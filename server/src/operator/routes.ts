// server/src/operator/routes.ts
// Operator API `/operator/v1` (09 §4–§7). All routes behind requireOperator. Envelope: { success, data, meta? }.
import { Router, Request, Response, NextFunction } from 'express';
import { Types, ClientSession } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { Company } from '../models/Company.model';
import { SeatUsage } from '../models/SeatUsage.model';
import { User } from '../models/User.model';
import { Role } from '../models/Role.model';
import { UserRole } from '../models/UserRole.model';
import { createInvitation, inviteLink } from '../lib/invitations';
import { AuditEvent } from '../models/AuditEvent.model';
import { Plan } from '../models/Plan.model';
import { OrganizationEntitlement } from '../models/OrganizationEntitlement.model';
import { OperatorAccount } from '../models/OperatorAccount.model';
import { OperatorAuditEvent } from '../models/OperatorAuditEvent.model';
import { IdentityProviderConnection } from '../models/IdentityProviderConnection.model';
import { assertProductKey } from '../lib/productRegistry';
import { runInTransaction, emitPlatformEvent, emitAppAccessChanged, fanOutAppAccessChanged } from '../lib/platformEvents';
import { RefreshToken } from '../models/RefreshToken.model';
import { seedPermissions, seedSystemRoles, seedSecurityPolicy } from '../lib/seed';
import { sendWelcomeEmail } from '../lib/emailService';
import { revokeSessionsTx, destroyProviderSession } from '../identity/sessions';
import { ROLES } from '../constants/roles';
import { slugify } from '../utils/slugify';
import { generateEmployeeId } from '../services/employeeId';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { requireOperator } from './middleware';
import { buildAuditFilter, categoryOf, csvRow, CSV_COLUMNS, EXPORT_ROW_CAP, writeAudit, type AuditInput } from './audit';
import { requirePermission, anyOperator, permissionsFor, operatorRolesSchema } from './permissions';
import { findFirstAdmin, onboardingRoutes } from './onboarding';
import { tenantRoutes } from './tenants';
import { overrideRoutes } from './overrides';
import { healthRoutes } from './health';
import { planRoutes, applyPlanToOrg, ensureDefaultAccess, bumpOrgAuthz, dryRunSummary } from './plans';

const router = Router();
/** Shape only; membership in the registry is checked with assertProductKey(s) (lib/productRegistry). */
const productKey = z.string().trim().min(1).max(64);
const ok = (res: Response, data: unknown, status = 200, meta?: unknown) => res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
const oid = (id: string, what = 'id') => {
  if (!Types.ObjectId.isValid(id)) throw new AppError(`Invalid ${what}`, 400, 'VALIDATION_ERROR');
  return id;
};
const isProd = () => process.env.NODE_ENV === 'production';

// X-Correlation-Id echo (generated when absent), then operator auth.
router.use((req: Request, res: Response, next: NextFunction) => {
  const incoming = req.header('x-correlation-id');
  const id = incoming && /^[\w.-]{1,100}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Correlation-Id', id);
  (req as any).correlationId = id;
  next();
});
router.use(requireOperator);

// The signed-in operator and their permission list; the SPA reads it for navigation and buttons (the API never trusts the SPA).
router.get('/me', anyOperator, asyncHandler(async (req: Request, res: Response) => {
  ok(res, { ...opOut(req.operator!), permissions: permissionsFor(req.operator!.roles) });
}));

/** Operator audit + mirrored tenant AuditEvent (source='operator'); see writeAudit in ./audit. */
const audit = (req: Request, p: AuditInput, session?: ClientSession) =>
  writeAudit({ operator: req.operator!, correlation_id: (req as any).correlationId, ip: req.ip }, p, session);
const actorOf = (req: Request) => ({ type: 'operator' as const, id: req.operator!._id.toString() });
const corrOf = (req: Request): string => (req as any).correlationId;

const paging = (req: Request) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '25'), 10) || 25, 1), 100);
  return { limit };
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Orgs ─────────────────────────────────────────────────────────────────────────────────────
// One member aggregation for the page (total and active); the last sign-in time is read from the company (Plan 4.3).
async function orgSummaries(companies: any[]) {
  const ids = companies.map((c) => c._id);
  const [members, ents] = await Promise.all([
    User.aggregate([
      { $match: { company_id: { $in: ids } } },
      { $group: { _id: '$company_id', total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$lifecycle_state', 'active'] }, 1, 0] } } } },
    ]),
    OrganizationEntitlement.find({ company_id: { $in: ids } }),
  ]);
  const m = new Map(members.map((x) => [String(x._id), x]));
  return companies.map((c) => {
    const mine = ents.filter((e) => String(e.company_id) === String(c._id));
    return {
      id: c._id.toString(),
      slug: c.slug,
      name: c.name,
      status: c.status ?? (c.is_active === false ? 'suspended' : 'active'),
      members_count: m.get(String(c._id))?.total ?? 0,
      members_total: m.get(String(c._id))?.total ?? 0,
      members_active: m.get(String(c._id))?.active ?? 0,
      plan_key: c.plan ?? null,
      entitlements: mine.map((e) => ({ product_key: e.product_key, status: e.status, seats_limit: e.seats_limit ?? null })),
      products: mine.filter((e) => e.status === 'active').map((e) => e.product_key),
      last_activity: c.last_activity_at ?? null, // legacy name, same value
      last_activity_at: c.last_activity_at ?? null,
      tags: c.tags ?? [],
      trial_ends_at: c.trial_ends_at ?? null,
      created_at: c.created_at,
    };
  });
}

const ORG_SORTS = ['created', 'name', 'members', 'last_activity'] as const;

router.get('/orgs', requirePermission('tenants.read'), asyncHandler(async (req: Request, res: Response) => {
  const { limit } = paging(req);
  const filter: Record<string, unknown> = {};
  if (typeof req.query.status === 'string' && req.query.status) filter.status = req.query.status;
  if (typeof req.query.plan === 'string' && req.query.plan) filter.plan = req.query.plan;
  if (typeof req.query.tag === 'string' && req.query.tag) filter.tags = req.query.tag;
  if (req.query.trial === 'true') filter.trial_ends_at = { $ne: null };
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const re = new RegExp(escapeRe(req.query.search.trim()), 'i');
    filter.$or = [{ name: re }, { slug: re }];
  }
  const sort = typeof req.query.sort === 'string' && req.query.sort ? req.query.sort : 'created';
  if (!(ORG_SORTS as readonly string[]).includes(sort)) throw new AppError('Invalid sort', 400, 'VALIDATION_ERROR');
  const total = await Company.countDocuments(filter);
  const cursorRaw = typeof req.query.cursor === 'string' ? req.query.cursor : '';

  if (sort === 'created') {
    // Cursor = last seen _id (ObjectId order == creation order); newest first.
    const paged = cursorRaw ? { ...filter, _id: { $lt: oid(cursorRaw, 'cursor') } } : filter;
    const rows = await Company.find(paged).sort({ _id: -1 }).limit(limit + 1);
    const page = rows.slice(0, limit);
    const next_cursor = rows.length > limit ? page[page.length - 1]._id.toString() : null;
    return ok(res, await orgSummaries(page), 200, { total, limit, next_cursor });
  }

  // Other sorts page by offset (cursor = the offset, as a number).
  const offset = cursorRaw ? parseInt(cursorRaw, 10) : 0;
  if (!Number.isInteger(offset) || offset < 0) throw new AppError('Invalid cursor', 400, 'VALIDATION_ERROR');
  let page: any[];
  if (sort === 'members') {
    // Counts come from one grouped aggregation over the matching tenants; the tenants themselves are then ordered in memory.
    const all = await Company.find(filter).select('_id').lean();
    const counts = new Map((await User.aggregate([
      { $match: { company_id: { $in: all.map((c) => c._id) } } }, { $group: { _id: '$company_id', n: { $sum: 1 } } },
    ])).map((x) => [String(x._id), x.n as number]));
    const ordered = all.map((c) => ({ id: c._id, n: counts.get(String(c._id)) ?? 0 }))
      .sort((x, y) => y.n - x.n || String(y.id).localeCompare(String(x.id)));
    const ids = ordered.slice(offset, offset + limit).map((x) => x.id);
    const byId = new Map((await Company.find({ _id: { $in: ids } })).map((c) => [String(c._id), c]));
    page = ids.map((id) => byId.get(String(id))).filter(Boolean);
  } else {
    const order = sort === 'name' ? { name: 1, _id: 1 } : { last_activity_at: -1, _id: -1 }; // descending puts never-active tenants last
    page = await Company.find(filter).sort(order as any).collation({ locale: 'en' }).skip(offset).limit(limit);
  }
  ok(res, await orgSummaries(page), 200, { total, limit, next_cursor: offset + limit < total ? String(offset + limit) : null });
}));

async function orgDetail(id: string) {
  const company = await Company.findById(oid(id));
  if (!company) throw new AppError('Organization not found', 404, 'NOT_FOUND');
  const [summary] = await orgSummaries([company]);
  const admin = await findFirstAdmin(company._id as Types.ObjectId); // through UserRole + the Super Admin role (Plan 2.6)
  const [ents, usage] = await Promise.all([OrganizationEntitlement.find({ company_id: company._id }).lean(), SeatUsage.find({ company_id: company._id }).lean()]);
  const limitOf = new Map(ents.map((e) => [e.product_key, e.seats_limit ?? null]));
  const seat_usage = usage.map((u) => ({ product_key: u.product_key, used: u.used, limit: limitOf.get(u.product_key) ?? null, computed_at: u.computed_at }));
  return { ...summary, first_admin: admin ? { email: admin.email, full_name: admin.full_name, lifecycle_state: admin.lifecycle_state } : null, seat_usage };
}

router.get('/orgs/:id', requirePermission('tenants.read'), asyncHandler(async (req: Request, res: Response) => ok(res, await orgDetail(String(req.params.id)))));

const ProvisionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  plan_key: z.string().trim().min(1),
  first_admin: z.object({ email: z.string().trim().email().toLowerCase(), full_name: z.string().trim().min(1).max(120) }),
});

const fanOutOrgAccess = (req: Request, companyId: Types.ObjectId) =>
  fanOutAppAccessChanged(companyId, { actor: actorOf(req), correlation_id: corrOf(req), batchSize: 200 });

router.post('/orgs', requirePermission('tenants.write'), asyncHandler(async (req: Request, res: Response) => {
  const input = ProvisionSchema.parse(req.body);
  const slug = input.slug || slugify(input.name);
  if (!slug) throw new AppError('Could not derive a slug from the name', 400, 'VALIDATION_ERROR');

  // Idempotent by slug: an existing org is returned unchanged.
  const existing = await Company.findOne({ slug });
  if (existing) return ok(res, { ...(await orgDetail(existing._id.toString())), already_existed: true }, 200);

  const plan = await Plan.findOne({ key: input.plan_key, status: 'active' });
  if (!plan) throw new AppError('Plan not found or archived', 404, 'PLAN_NOT_FOUND');

  // Permissions are global and idempotent, so they are seeded before the transaction. Everything the tenant owns
  // (company, roles, security policy, entitlements, first admin, invitation, e-mail row, events) commits together or
  // not at all (Plan 2.5): a failure leaves nothing behind and the same request can simply be sent again.
  await seedPermissions();
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10); // placeholder until invite acceptance
  let rawToken = '';
  let created;
  try {
    created = await runInTransaction(async (session) => {
      const opts = { session: session ?? undefined };
      const actor = actorOf(req);
      const correlation_id = corrOf(req);

      const [company] = await Company.create([{
        name: input.name, slug, status: 'active', is_active: true, plan: plan.key,
        ...(plan.trial_days ? { trial_ends_at: new Date(Date.now() + plan.trial_days * 86400e3) } : {}),
      }], opts);
      await seedSystemRoles(company._id, session);
      await seedSecurityPolicy(company._id, session);

      if (plan.products.length) {
        await OrganizationEntitlement.insertMany(plan.products.map((pk) => ({
          company_id: company._id, product_key: pk, status: 'active', source: 'plan', plan_key: plan.key, plan_version: plan.version ?? 1,
          ...(typeof plan.seat_defaults?.get(pk) === 'number' ? { seats_limit: plan.seat_defaults.get(pk) } : {}),
          updated_by_operator_id: req.operator!._id,
        })), opts);
      }

      const [user] = await User.create([{
        company_id: company._id,
        full_name: input.first_admin.full_name,
        email: input.first_admin.email,
        password_hash: passwordHash,
        role: ROLES.SUPER_ADMIN,
        lifecycle_state: 'invited',
        is_active: false,
        employment_type: 'full_time',
        // Pre-set so User's pre-save hook (which bumps the counter outside any session) is skipped; the counter is saved with the company below.
        employee_id: generateEmployeeId(company.employee_id_format, {
          date: new Date(), company: { name: company.name, code: company.slug },
          user: { department: undefined, departmentCode: undefined, location: undefined, jobTitle: undefined }, counter: 1,
        }),
      }], opts);
      const superRole = await Role.findOne({ company_id: company._id, name: ROLES.SUPER_ADMIN }).session(session ?? null);
      if (superRole) await UserRole.create([{ user_id: user._id, role_id: superRole._id, company_id: company._id, assigned_by: user._id, assigned_at: new Date() }], opts);
      ({ rawToken } = await createInvitation(session, {
        kind: 'first_admin', company_id: company._id, user_id: user._id, email: user.email,
        created_by: { type: 'operator', id: req.operator!._id },
      }));

      await ensureDefaultAccess(company._id, user._id, session);

      company.employee_id_counter = 1;
      await company.save(opts);

      const orgId = company._id.toString();
      await emitPlatformEvent(session, {
        org_id: orgId, type: 'org.provisioned', subject: { type: 'org', id: orgId }, actor, correlation_id,
        data: { slug, name: company.name, status: company.status },
      });
      for (const pk of plan.products) {
        await emitPlatformEvent(session, {
          org_id: orgId, type: 'entitlement.changed', subject: { type: 'org', id: orgId }, actor, correlation_id,
          data: { product_key: pk, status: 'active' },
        });
      }
      await emitPlatformEvent(session, {
        org_id: orgId, type: 'member.provisioned', subject: { type: 'member', id: user._id.toString() }, actor, correlation_id,
        data: { email: user.email, full_name: user.full_name, lifecycle_state: user.lifecycle_state },
      });
      await emitAppAccessChanged(session, company._id, [user._id], { actor, correlation_id });
      await audit(req, { action: 'org.provisioned', target_type: 'Organization', target_id: orgId, company, details: { slug, plan_key: plan.key, first_admin_email: user.email } }, session);

      // The welcome e-mail is queued in the outbox inside the transaction (its row rolls back with everything else);
      // the sender loop delivers it after commit. Its fate is readable through the delivery id.
      const deliveryId = await sendWelcomeEmail({
        email: user.email, full_name: user.full_name, employee_id: user.employee_id, company_name: company.name,
        invite_link: inviteLink(rawToken, user.email),
        meta: { company_id: company._id, related: { type: 'user', id: String(user._id) }, session },
      });
      return { companyId: orgId, deliveryId };
    });
  } catch (err) {
    console.error('[operator] provisioning failed for', slug, err);
    throw err; // the transaction rolled back: no company, roles or policy exist for this slug
  }

  // `invite_email_sent` means "accepted for delivery" (queued in the e-mail outbox); `invite_delivery_id` is its EmailDelivery id.
  const detail = await orgDetail(created.companyId);
  ok(res, { ...detail, invite_email_sent: true, invite_delivery_id: created.deliveryId ?? null, ...(!isProd() && process.env.EXPOSE_INVITE_TOKEN === 'true' ? { invite_token: rawToken } : {}) }, 201);
}));

async function setOrgStatus(req: Request, res: Response, status: 'active' | 'suspended' | 'closed', action: string) {
  const company = await Company.findById(oid(String(req.params.id)));
  if (!company) throw new AppError('Organization not found', 404, 'NOT_FOUND');
  if (company.status === 'closed' && status !== 'closed') throw new AppError('Closed organizations cannot be changed', 409, 'ORG_CLOSED');
  const before = company.status;
  const reason = typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : status;
  const eventType = action as 'org.suspended' | 'org.reactivated' | 'org.closed';
  const revokedSids = await runInTransaction(async (session) => {
    company.status = status;
    company.is_active = status === 'active';
    await company.save({ session: session ?? undefined });
    await bumpOrgAuthz(company._id, session);
    let sids: string[] = [];
    if (status !== 'active') {
      await RefreshToken.updateMany(
        { user_id: { $in: await User.find({ company_id: company._id }).session(session ?? null).distinct('_id') }, is_revoked: false },
        { $set: { is_revoked: true } },
        { session },
      );
      sids = await revokeSessionsTx(session, { company_id: company._id }, `org_${status}`, { actor: actorOf(req), correlation_id: corrOf(req) });
    }
    await emitPlatformEvent(session, {
      org_id: company._id.toString(), type: eventType, subject: { type: 'org', id: company._id.toString() },
      actor: actorOf(req), correlation_id: corrOf(req), data: { reason },
    });
    await audit(req, { action, target_type: 'Organization', target_id: company._id.toString(), company, before: { status: before }, after: { status }, details: { from: before, to: status, sessions_revoked: sids.length } }, session);
    return sids;
  });
  for (const sid of revokedSids) await destroyProviderSession(sid).catch((e) => console.error('[operator] provider session teardown failed', sid, e));
  await fanOutOrgAccess(req, company._id);
  ok(res, { ...(await orgDetail(company._id.toString())), sessions_revoked: revokedSids.length });
}
router.post('/orgs/:id/suspend', requirePermission('tenants.write'), asyncHandler((req: Request, res: Response) => setOrgStatus(req, res, 'suspended', 'org.suspended')));
router.post('/orgs/:id/reactivate', requirePermission('tenants.write'), asyncHandler((req: Request, res: Response) => setOrgStatus(req, res, 'active', 'org.reactivated')));
router.post('/orgs/:id/close', requirePermission('tenants.close'), asyncHandler((req: Request, res: Response) => setOrgStatus(req, res, 'closed', 'org.closed')));

// Change an existing org: assign a plan (activates the plan's products; never removes or re-activates suspended ones),
// set tags and the trial end (Plan 4.4). Any subset of the three; at least one is required.
const dateOrNull = z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date').nullable();
const PatchOrgSchema = z.object({
  plan_key: z.string().trim().min(1).optional(),
  trial_ends_at: dateOrNull.optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
}).refine((b) => b.plan_key !== undefined || b.trial_ends_at !== undefined || b.tags !== undefined, { message: 'Nothing to change' });

router.patch('/orgs/:id', requirePermission('tenants.write'), asyncHandler(async (req: Request, res: Response) => {
  const body = PatchOrgSchema.parse(req.body);
  const company = await Company.findById(oid(String(req.params.id)));
  if (!company) throw new AppError('Organization not found', 404, 'NOT_FOUND');
  const plan = body.plan_key !== undefined ? await Plan.findOne({ key: body.plan_key, status: 'active' }) : null;
  if (body.plan_key !== undefined && !plan) throw new AppError('Plan not found', 404, 'PLAN_NOT_FOUND');

  if (body.tags !== undefined || body.trial_ends_at !== undefined) {
    const set: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (body.tags !== undefined) {
      const tags = [...new Set(body.tags)];
      before.tags = company.tags ?? []; after.tags = tags; set.tags = tags;
    }
    if (body.trial_ends_at !== undefined) {
      const at = body.trial_ends_at === null ? null : new Date(body.trial_ends_at);
      before.trial_ends_at = company.trial_ends_at ?? null; after.trial_ends_at = at; set.trial_ends_at = at;
    }
    await Company.updateOne({ _id: company._id }, { $set: set });
    company.set(set);
    await audit(req, { action: 'org.updated', target_type: 'Company', target_id: String(company._id), company, before, after });
  }
  if (!plan) return ok(res, { id: String(company._id), tags: company.tags ?? [], trial_ends_at: company.trial_ends_at ?? null });
  const ctx = { actor: actorOf(req), correlation_id: corrOf(req), operator_id: req.operator!._id as Types.ObjectId };
  if (req.query.dry_run === 'true') {
    return ok(res, dryRunSummary([await applyPlanToOrg(undefined, company, plan, { ...ctx, audit: async () => undefined, dry_run: true })]));
  }
  const diff = await runInTransaction((session) => applyPlanToOrg(session, company, plan, { ...ctx, audit: (p) => audit(req, p, session) }));
  if (diff.added.length || diff.restricted.length) await fanOutOrgAccess(req, company._id);
  ok(res, { id: String(company._id), plan_key: plan.key, products: plan.products, tags: company.tags ?? [], trial_ends_at: company.trial_ends_at ?? null, ...diff });
}));

router.put('/orgs/:id/entitlements/:productKey', requirePermission('entitlements.write'), asyncHandler(async (req: Request, res: Response) => {
  const key = await assertProductKey(productKey.parse(req.params.productKey));
  const body = z.object({
    status: z.enum(['active', 'suspended']), seats_limit: z.number().int().min(0).nullable().optional(),
    reason: z.string().trim().max(500).optional(),
    expires_at: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date').nullable().optional(),
  }).parse(req.body);
  // An override says why it exists (Plan 4.6) and may say when it ends; only an active override can expire (DRD 3.2 rule 5).
  if (!body.reason) throw new AppError('A reason is required', 400, 'REASON_REQUIRED');
  const expiresAt = body.expires_at ? new Date(body.expires_at) : null;
  if (expiresAt && expiresAt.getTime() <= Date.now()) throw new AppError('expires_at must be in the future', 400, 'VALIDATION_ERROR');
  if (expiresAt && body.status !== 'active') throw new AppError('Only an active override can expire', 400, 'VALIDATION_ERROR');
  const company = await Company.findById(oid(String(req.params.id)));
  if (!company) throw new AppError('Organization not found', 404, 'NOT_FOUND');
  const prior = await OrganizationEntitlement.findOne({ company_id: company._id, product_key: key });
  const set: Record<string, unknown> = { status: body.status, source: 'operator', updated_by_operator_id: req.operator!._id, reason: body.reason };
  const unset: Record<string, 1> = {};
  if (expiresAt) set.expires_at = expiresAt; else unset.expires_at = 1; // a new PUT replaces the previous override, expiry included
  if (body.seats_limit === null) unset.seats_limit = 1;
  else if (body.seats_limit !== undefined) set.seats_limit = body.seats_limit;
  const ent = await runInTransaction(async (session) => {
    const ent = await OrganizationEntitlement.findOneAndUpdate(
      { company_id: company._id, product_key: key },
      { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, session: session ?? undefined },
    );
    await emitPlatformEvent(session, {
      org_id: company._id.toString(), type: 'entitlement.changed', subject: { type: 'org', id: company._id.toString() },
      actor: actorOf(req), correlation_id: corrOf(req), data: { product_key: key, status: ent!.status, source: 'operator', ...(ent!.seats_limit != null ? { seats_limit: ent!.seats_limit } : {}), ...(expiresAt ? { expires_at: expiresAt.toISOString() } : {}) },
    });
    await bumpOrgAuthz(company._id, session);
    await audit(req, {
      action: 'entitlement.updated', target_type: 'Entitlement', target_id: `${company._id}:${key}`, company, reason: body.reason,
      before: prior ? { status: prior.status, source: prior.source === 'operator' ? 'override' : prior.source, seats_limit: prior.seats_limit ?? null, expires_at: prior.expires_at ?? null } : null,
      after: { product_key: key, status: ent!.status, source: 'override', seats_limit: ent!.seats_limit ?? null, expires_at: expiresAt },
    }, session);
    return ent;
  });
  await fanOutOrgAccess(req, company._id);
  ok(res, { product_key: ent!.product_key, status: ent!.status, seats_limit: ent!.seats_limit ?? null, source: ent!.source, reason: ent!.reason ?? null, expires_at: ent!.expires_at ?? null });
}));

// ── Identity provider tenant approval (review M-2, decided 2026-11-12) ──
// A tenant admin can't prove ownership of an Entra tenant id, so an operator approves it (after checking with the
// customer) before the org can activate the connection. Audited; no platform event (06 has no IdP event type).
const idpOut = (c: any) => ({
  id: c._id.toString(), type: c.type, display_name: c.display_name, status: c.status,
  tenant_id: c.config?.tenant_id ?? null,
  domains: (c.domains || []).map((d: any) => ({ domain: d.domain, verified_at: d.verified_at ?? null })),
  tenant_approval: c.tenant_approval
    ? { tenant_id: c.tenant_approval.tenant_id, approved_at: c.tenant_approval.approved_at, operator_id: String(c.tenant_approval.operator_id) }
    : null,
});

router.get('/orgs/:id/identity-providers', requirePermission('tenants.read'), asyncHandler(async (req: Request, res: Response) => {
  const companyId = oid(String(req.params.id));
  ok(res, (await IdentityProviderConnection.find({ company_id: companyId }).sort({ created_at: 1 })).map(idpOut));
}));

router.post('/orgs/:id/identity-providers/:connId/approve-tenant', requirePermission('tenants.write'), asyncHandler(async (req: Request, res: Response) => {
  const company = await Company.findById(oid(String(req.params.id)));
  if (!company) throw new AppError('Organization not found', 404, 'NOT_FOUND');
  const conn = await IdentityProviderConnection.findOne({ _id: oid(String(req.params.connId), 'connection id'), company_id: company._id });
  if (!conn) throw new AppError('Identity provider connection not found', 404, 'NOT_FOUND');
  const tenantId = conn.config?.tenant_id;
  if (conn.type !== 'entra' || !tenantId) throw new AppError('Only an Entra connection with a tenant id can be approved', 400, 'VALIDATION_ERROR');
  const other = await IdentityProviderConnection.findOne({ _id: { $ne: conn._id }, 'tenant_approval.tenant_id': tenantId });
  if (other) throw new AppError('This Entra tenant is already approved for another connection', 409, 'TENANT_TAKEN');
  const before = conn.tenant_approval ? { tenant_id: conn.tenant_approval.tenant_id, approved_at: conn.tenant_approval.approved_at } : null;
  conn.tenant_approval = { tenant_id: tenantId, approved_at: new Date(), operator_id: req.operator!._id } as any;
  await conn.save();
  await audit(req, {
    action: 'identity_provider.tenant_approved', target_type: 'IdentityProviderConnection', target_id: conn._id.toString(), company,
    before, after: { tenant_id: tenantId }, details: { tenant_id: tenantId, connection: conn.display_name },
  });
  ok(res, idpOut(conn));
}));

// ── Audit ────────────────────────────────────────────────────────────────────────────────────
const auditOut = (e: any) => ({
  id: e._id.toString(), operator_id: e.operator_id?.toString() ?? null, operator_email: e.operator_email, action: e.action,
  category: e.category ?? categoryOf(e.action), result: e.result ?? 'success', reason: e.reason ?? null,
  target_type: e.target_type, target_id: e.target_id ?? null, company_id: e.company_id?.toString() ?? null,
  before: e.before ?? null, after: e.after ?? null,
  details: e.details ?? null, correlation_id: e.correlation_id ?? null, created_at: e.created_at,
});

router.get('/audit', requirePermission('audit.read'), asyncHandler(async (req: Request, res: Response) => {
  const { limit } = paging(req);
  const filter = buildAuditFilter(req.query);
  if (typeof req.query.cursor === 'string' && req.query.cursor) filter._id = { $lt: oid(req.query.cursor, 'cursor') };
  const rows = await OperatorAuditEvent.find(filter).sort({ _id: -1 }).limit(limit + 1);
  const page = rows.slice(0, limit);
  ok(res, page.map(auditOut), 200, { limit, next_cursor: rows.length > limit ? page[page.length - 1]._id.toString() : null });
}));

// CSV of the filtered result, newest first, at most EXPORT_ROW_CAP rows. The export is itself audited (before any data leaves).
router.get('/audit/export', requirePermission('audit.export'), asyncHandler(async (req: Request, res: Response) => {
  const filter = buildAuditFilter(req.query);
  await audit(req, {
    action: 'audit.exported', target_type: 'AuditLog', target_id: 'operator', category: 'security',
    details: { filter: Object.fromEntries(Object.entries(req.query).filter(([k]) => ['action', 'company_id', 'operator_id', 'category', 'from', 'to'].includes(k))), row_cap: EXPORT_ROW_CAP },
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="operator-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.write('﻿' + csvRow([...CSV_COLUMNS]));
  for await (const e of OperatorAuditEvent.find(filter).sort({ _id: -1 }).limit(EXPORT_ROW_CAP).cursor()) {
    const o = auditOut(e);
    if (!res.write(csvRow(CSV_COLUMNS.map((c) => (o as Record<string, unknown>)[c])))) await new Promise<void>((resolve) => res.once('drain', resolve));
  }
  res.end();
}));

// ── Operators ────────────────────────────────────────────────────────────────────────────────
const opOut = (o: any) => ({
  id: o._id.toString(), email: o.email, full_name: o.full_name, roles: o.roles, status: o.status,
  mfa_enabled: !!o.mfa?.enabled, last_login_at: o.last_login_at ?? null, created_at: o.created_at,
});
const operatorRoles = operatorRolesSchema;

router.get('/operators', requirePermission('operators.read'), asyncHandler(async (_req: Request, res: Response) => ok(res, (await OperatorAccount.find().sort({ created_at: 1 })).map(opOut))));
router.post('/operators', requirePermission('operators.write'), asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({
    email: z.string().trim().email().toLowerCase(), full_name: z.string().trim().min(1).max(120),
    password: z.string().min(12).max(200), roles: operatorRoles.optional(),
  }).parse(req.body);
  if (await OperatorAccount.exists({ email: b.email })) throw new AppError('An operator with this email already exists', 409, 'DUPLICATE');
  const acct = await OperatorAccount.create({
    email: b.email, full_name: b.full_name, password_hash: await bcrypt.hash(b.password, 12), roles: b.roles ?? ['platform_admin'], status: 'active',
  });
  await audit(req, { action: 'operator.created', target_type: 'Operator', target_id: acct._id.toString(), details: { email: acct.email } });
  ok(res, opOut(acct), 201);
}));
router.patch('/operators/:id', requirePermission('operators.write'), asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({
    full_name: z.string().trim().min(1).max(120), status: z.enum(['active', 'suspended']),
    roles: operatorRoles, password: z.string().min(12).max(200), reset_mfa: z.boolean(),
  }).partial().parse(req.body);
  const acct = await OperatorAccount.findById(oid(String(req.params.id)));
  if (!acct) throw new AppError('Operator not found', 404, 'NOT_FOUND');
  if (b.status === 'suspended' && acct._id.equals(req.operator!._id)) throw new AppError('You cannot suspend your own account', 409, 'SELF_SUSPEND');
  if (b.full_name !== undefined) acct.full_name = b.full_name;
  if (b.status !== undefined) acct.status = b.status;
  if (b.roles !== undefined) acct.roles = b.roles;
  if (b.password !== undefined) acct.password_hash = await bcrypt.hash(b.password, 12);
  if (b.reset_mfa) acct.mfa = { enabled: false };
  await acct.save();
  await audit(req, { action: 'operator.updated', target_type: 'Operator', target_id: acct._id.toString(), details: { fields: Object.keys(b).filter((k) => k !== 'password') , password_changed: b.password !== undefined } });
  ok(res, opOut(acct));
}));

router.use(onboardingRoutes({ ok, oid, audit, actorOf, corrOf })); // Plan 2.6
router.use(tenantRoutes({ ok, oid, audit })); // Plan 4.4
router.use(planRoutes({ ok, audit, corrOf })); // Plan 4.5
router.use(overrideRoutes({ ok, oid, audit, actorOf, corrOf })); // Plan 4.6
router.use(healthRoutes({ ok })); // Plan 4.9

export default router;
