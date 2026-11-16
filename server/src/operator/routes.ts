// server/src/operator/routes.ts
// Operator API `/operator/v1` (09 §4–§7). All routes behind requireOperator. Envelope: { success, data, meta? }.
import { Router, Request, Response, NextFunction } from 'express';
import { Types, ClientSession } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { Company } from '../models/Company.model';
import { User } from '../models/User.model';
import { Role } from '../models/Role.model';
import { UserRole } from '../models/UserRole.model';
import { InviteToken } from '../models/InviteToken.model';
import { AuditEvent } from '../models/AuditEvent.model';
import { Plan } from '../models/Plan.model';
import { ProductKey } from '../models/ProductRole.model';
import { OrganizationEntitlement } from '../models/OrganizationEntitlement.model';
import { OperatorAccount } from '../models/OperatorAccount.model';
import { OperatorAuditEvent } from '../models/OperatorAuditEvent.model';
import { App } from '../models/App.model';
import { AppAssignment } from '../models/AppAssignment.model';
import { Group } from '../models/Group.model';
import { IdentityProviderConnection } from '../models/IdentityProviderConnection.model';
import { seedProductRegistry } from '../lib/productCatalog';
import { assertProductKey, assertProductKeys } from '../lib/productRegistry';
import { runInTransaction, emitPlatformEvent, emitAppAccessChanged, fanOutAppAccessChanged } from '../lib/platformEvents';
import { RefreshToken } from '../models/RefreshToken.model';
import { RolePermission } from '../models/RolePermission.model';
import { SecurityPolicy } from '../models/SecurityPolicy.model';
import { seedDatabase } from '../lib/seed';
import { sendWelcomeEmail } from '../lib/emailService';
import { revokeSessionsTx, destroyProviderSession } from '../identity/sessions';
import { ROLES } from '../constants/roles';
import { slugify } from '../utils/slugify';
import { generateEmployeeId } from '../services/employeeId';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { requireOperator } from './middleware';

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

/** Operator audit + mirrored tenant AuditEvent (source='operator'); direct model writes, not req-bound. */
async function audit(req: Request, p: {
  action: string; target_type: string; target_id: string; company?: { _id: Types.ObjectId; name: string };
  details?: Record<string, unknown>; before?: unknown; after?: unknown;
}, session?: ClientSession) {
  const op = req.operator!;
  const opts = { session: session ?? undefined };
  await OperatorAuditEvent.create([{
    operator_id: op._id, operator_email: op.email, action: p.action, target_type: p.target_type, target_id: p.target_id,
    company_id: p.company?._id, details: p.details, correlation_id: (req as any).correlationId,
  }], opts);
  if (p.company) {
    await AuditEvent.create([{
      company_id: p.company._id, actor_id: null, actor_email: `operator:${op.email}`, action: p.action, module: 'operator',
      category: 'Operator', object_type: p.target_type, object_id: p.target_id, object_label: p.company.name,
      before_state: (p.before as any) ?? null, after_state: (p.after as any) ?? p.details ?? null, ip_address: req.ip, source: 'operator',
      correlation_id: (req as any).correlationId,
    }], opts);
  }
}
const actorOf = (req: Request) => ({ type: 'operator' as const, id: req.operator!._id.toString() });
const corrOf = (req: Request): string => (req as any).correlationId;

const paging = (req: Request) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '25'), 10) || 25, 1), 100);
  return { limit };
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Orgs ─────────────────────────────────────────────────────────────────────────────────────
async function orgSummaries(companies: any[]) {
  const ids = companies.map((c) => c._id);
  const [members, logins, ents] = await Promise.all([
    User.aggregate([{ $match: { company_id: { $in: ids } } }, { $group: { _id: '$company_id', n: { $sum: 1 } } }]),
    User.aggregate([{ $match: { company_id: { $in: ids }, last_login: { $exists: true } } }, { $group: { _id: '$company_id', at: { $max: '$last_login' } } }]),
    OrganizationEntitlement.find({ company_id: { $in: ids } }),
  ]);
  const m = new Map(members.map((x) => [String(x._id), x.n]));
  const l = new Map(logins.map((x) => [String(x._id), x.at]));
  return companies.map((c) => ({
    id: c._id.toString(),
    slug: c.slug,
    name: c.name,
    status: c.status ?? (c.is_active === false ? 'suspended' : 'active'),
    members_count: m.get(String(c._id)) ?? 0,
    plan_key: c.plan ?? null,
    entitlements: ents.filter((e) => String(e.company_id) === String(c._id)).map((e) => ({ product_key: e.product_key, status: e.status, seats_limit: e.seats_limit ?? null })),
    last_activity: l.get(String(c._id)) ?? null,
    created_at: c.created_at,
  }));
}

router.get('/orgs', asyncHandler(async (req: Request, res: Response) => {
  const { limit } = paging(req);
  const filter: Record<string, unknown> = {};
  if (typeof req.query.status === 'string' && req.query.status) filter.status = req.query.status;
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const re = new RegExp(escapeRe(req.query.search.trim()), 'i');
    filter.$or = [{ name: re }, { slug: re }];
  }
  // Cursor = last seen _id (ObjectId order == creation order); newest first.
  if (typeof req.query.cursor === 'string' && req.query.cursor) filter._id = { $lt: oid(req.query.cursor, 'cursor') };
  const total = await Company.countDocuments(Object.fromEntries(Object.entries(filter).filter(([k]) => k !== '_id')));
  const rows = await Company.find(filter).sort({ _id: -1 }).limit(limit + 1);
  const page = rows.slice(0, limit);
  const next_cursor = rows.length > limit ? page[page.length - 1]._id.toString() : null;
  ok(res, await orgSummaries(page), 200, { total, limit, next_cursor });
}));

async function orgDetail(id: string) {
  const company = await Company.findById(oid(id));
  if (!company) throw new AppError('Organization not found', 404, 'NOT_FOUND');
  const [summary] = await orgSummaries([company]);
  const admin = await User.findOne({ company_id: company._id, role: ROLES.SUPER_ADMIN }).sort({ created_at: 1 }).select('email full_name lifecycle_state');
  return { ...summary, first_admin: admin ? { email: admin.email, full_name: admin.full_name, lifecycle_state: admin.lifecycle_state } : null };
}

router.get('/orgs/:id', asyncHandler(async (req: Request, res: Response) => ok(res, await orgDetail(String(req.params.id)))));

const ProvisionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  plan_key: z.string().trim().min(1),
  first_admin: z.object({ email: z.string().trim().email().toLowerCase(), full_name: z.string().trim().min(1).max(120) }),
});

/**
 * Org default rules on the "All Members" dynamic group, each only with an active entitlement for that product. Idempotent.
 * - people -> employee (04 §7).
 * - desk -> requester: C-3 "desk for everyone", decided 2026-11-12. An admin excludes members by editing or
 *   removing this rule; migrated orgs get per-member requester grants from the E11 seed instead (legacy
 *   hasDeskPortalAccess === false = excluded).
 */
const ORG_DEFAULT_RULES: ReadonlyArray<{ product: ProductKey; role: string }> = [
  { product: 'people', role: 'employee' },
  { product: 'desk', role: 'requester' },
];

async function ensureDefaultPeopleAccess(companyId: Types.ObjectId, grantedBy: Types.ObjectId, session?: ClientSession) {
  const sess = session ?? null;
  const opts = { session: session ?? undefined };
  for (const rule of ORG_DEFAULT_RULES) {
    if (!(await OrganizationEntitlement.exists({ company_id: companyId, product_key: rule.product, status: 'active' }).session(sess))) continue;
    let app = await App.findOne({ product_key: rule.product, app_type: 'karbexa_product' }).session(sess);
    if (!app) {
      await seedProductRegistry(); // global catalog, outside the txn
      app = await App.findOne({ product_key: rule.product, app_type: 'karbexa_product' }).session(sess);
    }
    if (!app) continue;
    let group = await Group.findOne({ company_id: companyId, name: 'All Members', type: 'dynamic' }).session(sess);
    if (!group) [group] = await Group.create([{ company_id: companyId, name: 'All Members', type: 'dynamic', dynamic_rules: {}, is_active: true } as never], opts);
    const exists = await AppAssignment.exists({ company_id: companyId, app_id: app._id, target_type: 'group', target_id: group._id, product_role_key: rule.role }).session(sess);
    if (!exists) {
      await AppAssignment.create([{
        company_id: companyId, app_id: app._id, target_type: 'group', target_id: group._id, product_role_key: rule.role, granted_by: grantedBy, is_active: true,
      } as never], opts);
    }
  }
}

/**
 * Entitlement/plan/status changes alter every member's effective access (04 §8.2). O(1) inside the txn:
 * one updateMany bumps every member's authz_ver. Per-member app_access.changed fans out after commit (fanOutOrgAccess).
 */
async function bumpOrgAuthz(companyId: Types.ObjectId, session?: ClientSession) {
  await User.updateMany({ company_id: companyId }, { $inc: { authz_ver: 1 } }, { session });
}
const fanOutOrgAccess = (req: Request, companyId: Types.ObjectId) =>
  fanOutAppAccessChanged(companyId, { actor: actorOf(req), correlation_id: corrOf(req), batchSize: 200 });

router.post('/orgs', asyncHandler(async (req: Request, res: Response) => {
  const input = ProvisionSchema.parse(req.body);
  const slug = input.slug || slugify(input.name);
  if (!slug) throw new AppError('Could not derive a slug from the name', 400, 'VALIDATION_ERROR');

  // Idempotent by slug: an existing org is returned unchanged.
  const existing = await Company.findOne({ slug });
  if (existing) return ok(res, { ...(await orgDetail(existing._id.toString())), already_existed: true }, 200);

  const plan = await Plan.findOne({ key: input.plan_key, status: 'active' });
  if (!plan) throw new AppError('Plan not found or archived', 404, 'PLAN_NOT_FOUND');

  const company = await Company.create({ name: input.name, slug, status: 'provisioning', is_active: false, plan: plan.key });
  const rawToken = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10); // placeholder until invite acceptance
  try {
    // seedDatabase() takes no session: it runs before the txn and is undone in the catch below on failure.
    await seedDatabase(company._id.toString()); // permissions + system roles + default security policy
    const user = await runInTransaction(async (session) => {
      const opts = { session: session ?? undefined };
      const actor = actorOf(req);
      const correlation_id = corrOf(req);
      if (plan.products.length) {
        await OrganizationEntitlement.insertMany(plan.products.map((pk) => ({
          company_id: company._id, product_key: pk, status: 'active', source: 'plan', plan_key: plan.key, updated_by_operator_id: req.operator!._id,
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
      await InviteToken.create([{ user_id: user._id, token_hash: crypto.createHash('sha256').update(rawToken).digest('hex'), expires_at: new Date(Date.now() + 72 * 3600 * 1000) }], opts);

      await ensureDefaultPeopleAccess(company._id, user._id, session);

      company.status = 'active';
      company.is_active = true;
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
      return user;
    });

    // Side effects after commit.
    // `invite_email_sent` means "accepted for delivery" (queued in the e-mail outbox); `invite_delivery_id` is its EmailDelivery id.
    let emailSent = true;
    let deliveryId: string | undefined;
    try {
      deliveryId = await sendWelcomeEmail({
        email: user.email, full_name: user.full_name, employee_id: user.employee_id, company_name: company.name,
        invite_link: `${process.env.CLIENT_URL}/onboarding?token=${rawToken}&email=${encodeURIComponent(user.email)}`,
        meta: { company_id: company._id, related: { type: 'user', id: String(user._id) } },
      });
    } catch (e) {
      emailSent = false;
      console.error('[operator] invite email failed', e);
    }

    const detail = await orgDetail(company._id.toString());
    ok(res, { ...detail, invite_email_sent: emailSent, invite_delivery_id: deliveryId ?? null, ...(!isProd() && process.env.EXPOSE_INVITE_TOKEN === 'true' ? { invite_token: rawToken } : {}) }, 201);
  } catch (err) {
    // The txn rolled back; undo the pre-txn company + seeded roles/policy so the slug is free for a clean retry.
    console.error('[operator] provisioning failed for', slug, err);
    try {
      const roleIds = await Role.find({ company_id: company._id }).distinct('_id');
      await RolePermission.deleteMany({ role_id: { $in: roleIds } });
      await Role.deleteMany({ company_id: company._id });
      await SecurityPolicy.deleteMany({ company_id: company._id });
      await Company.deleteOne({ _id: company._id, status: 'provisioning' });
    } catch (cleanupErr) {
      console.error('[operator] provisioning cleanup failed for', slug, cleanupErr);
    }
    throw err;
  }
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
router.post('/orgs/:id/suspend', asyncHandler((req: Request, res: Response) => setOrgStatus(req, res, 'suspended', 'org.suspended')));
router.post('/orgs/:id/reactivate', asyncHandler((req: Request, res: Response) => setOrgStatus(req, res, 'active', 'org.reactivated')));
router.post('/orgs/:id/close', asyncHandler((req: Request, res: Response) => setOrgStatus(req, res, 'closed', 'org.closed')));

// Assign a plan to an existing org: activates the plan's products (never removes or re-activates suspended ones).
router.patch('/orgs/:id', asyncHandler(async (req: Request, res: Response) => {
  const body = z.object({ plan_key: z.string().trim().min(1) }).parse(req.body);
  const company = await Company.findById(oid(String(req.params.id)));
  if (!company) throw new AppError('Organization not found', 404, 'NOT_FOUND');
  const plan = await Plan.findOne({ key: body.plan_key, status: 'active' });
  if (!plan) throw new AppError('Plan not found', 404, 'PLAN_NOT_FOUND');
  await runInTransaction(async (session) => {
    const orgId = company._id.toString();
    await Company.updateOne({ _id: company._id }, { $set: { plan: plan.key } }, { session: session ?? undefined });
    for (const key of plan.products) {
      await OrganizationEntitlement.updateOne(
        { company_id: company._id, product_key: key },
        { $setOnInsert: { status: 'active' }, $set: { source: 'plan', plan_key: plan.key, updated_by_operator_id: req.operator!._id } },
        { upsert: true, session: session ?? undefined },
      );
      const ent = await OrganizationEntitlement.findOne({ company_id: company._id, product_key: key }).session(session ?? null);
      await emitPlatformEvent(session, {
        org_id: orgId, type: 'entitlement.changed', subject: { type: 'org', id: orgId }, actor: actorOf(req), correlation_id: corrOf(req),
        data: { product_key: key, status: ent?.status ?? 'active' },
      });
    }
    const firstAdmin = await User.findOne({ company_id: company._id, role: ROLES.SUPER_ADMIN }).sort({ created_at: 1 }).select('_id').session(session ?? null);
    if (firstAdmin) await ensureDefaultPeopleAccess(company._id, firstAdmin._id, session);
    await bumpOrgAuthz(company._id, session);
    await audit(req, { action: 'org.plan_assigned', target_type: 'Company', target_id: String(company._id), company, before: null, after: { plan_key: plan.key, products: plan.products } }, session);
  });
  await fanOutOrgAccess(req, company._id);
  ok(res, { id: String(company._id), plan_key: plan.key, products: plan.products });
}));

router.put('/orgs/:id/entitlements/:productKey',asyncHandler(async (req: Request, res: Response) => {
  const key = await assertProductKey(productKey.parse(req.params.productKey));
  const body = z.object({ status: z.enum(['active', 'suspended']), seats_limit: z.number().int().min(0).nullable().optional() }).parse(req.body);
  const company = await Company.findById(oid(String(req.params.id)));
  if (!company) throw new AppError('Organization not found', 404, 'NOT_FOUND');
  const prior = await OrganizationEntitlement.findOne({ company_id: company._id, product_key: key });
  const set: Record<string, unknown> = { status: body.status, source: 'operator', updated_by_operator_id: req.operator!._id };
  const unset: Record<string, 1> = {};
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
      actor: actorOf(req), correlation_id: corrOf(req), data: { product_key: key, status: ent!.status },
    });
    await bumpOrgAuthz(company._id, session);
    await audit(req, {
      action: 'entitlement.updated', target_type: 'Entitlement', target_id: `${company._id}:${key}`, company,
      before: prior ? { status: prior.status, seats_limit: prior.seats_limit ?? null } : null,
      after: { product_key: key, status: ent!.status, seats_limit: ent!.seats_limit ?? null },
    }, session);
    return ent;
  });
  await fanOutOrgAccess(req, company._id);
  ok(res, { product_key: ent!.product_key, status: ent!.status, seats_limit: ent!.seats_limit ?? null, source: ent!.source });
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

router.get('/orgs/:id/identity-providers', asyncHandler(async (req: Request, res: Response) => {
  const companyId = oid(String(req.params.id));
  ok(res, (await IdentityProviderConnection.find({ company_id: companyId }).sort({ created_at: 1 })).map(idpOut));
}));

router.post('/orgs/:id/identity-providers/:connId/approve-tenant', asyncHandler(async (req: Request, res: Response) => {
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

// ── Plans ────────────────────────────────────────────────────────────────────────────────────
const planOut = (p: any) => ({ id: p._id.toString(), key: p.key, name: p.name, products: p.products, status: p.status });

router.get('/plans', asyncHandler(async (_req: Request, res: Response) => ok(res, (await Plan.find().sort({ key: 1 })).map(planOut))));
router.post('/plans', asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({
    key: z.string().trim().regex(/^[a-z0-9_-]{2,40}$/), name: z.string().trim().min(1).max(80),
    products: z.array(productKey).default([]), status: z.enum(['active', 'archived']).optional(),
  }).parse(req.body);
  await assertProductKeys(b.products);
  if (await Plan.exists({ key: b.key })) throw new AppError('A plan with this key already exists', 409, 'DUPLICATE');
  const plan = await Plan.create(b);
  await audit(req, { action: 'plan.created', target_type: 'Plan', target_id: plan.key, details: planOut(plan) });
  ok(res, planOut(plan), 201);
}));
router.patch('/plans/:key', asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ name: z.string().trim().min(1).max(80), products: z.array(productKey), status: z.enum(['active', 'archived']) }).partial().parse(req.body);
  if (b.products) await assertProductKeys(b.products);
  const plan = await Plan.findOne({ key: String(req.params.key) });
  if (!plan) throw new AppError('Plan not found', 404, 'NOT_FOUND');
  const before = planOut(plan);
  Object.assign(plan, b);
  await plan.save();
  await audit(req, { action: 'plan.updated', target_type: 'Plan', target_id: plan.key, details: { before, after: planOut(plan) } });
  ok(res, planOut(plan));
}));

// ── Audit ────────────────────────────────────────────────────────────────────────────────────
router.get('/audit', asyncHandler(async (req: Request, res: Response) => {
  const { limit } = paging(req);
  const filter: Record<string, unknown> = {};
  if (typeof req.query.company_id === 'string' && req.query.company_id) filter.company_id = oid(req.query.company_id, 'company_id');
  if (typeof req.query.action === 'string' && req.query.action) filter.action = req.query.action;
  if (typeof req.query.cursor === 'string' && req.query.cursor) filter._id = { $lt: oid(req.query.cursor, 'cursor') };
  const rows = await OperatorAuditEvent.find(filter).sort({ _id: -1 }).limit(limit + 1);
  const page = rows.slice(0, limit);
  ok(res, page.map((e) => ({
    id: e._id.toString(), operator_id: e.operator_id.toString(), operator_email: e.operator_email, action: e.action,
    target_type: e.target_type, target_id: e.target_id ?? null, company_id: e.company_id?.toString() ?? null,
    details: e.details ?? null, correlation_id: e.correlation_id ?? null, created_at: e.created_at,
  })), 200, { limit, next_cursor: rows.length > limit ? page[page.length - 1]._id.toString() : null });
}));

// ── Operators ────────────────────────────────────────────────────────────────────────────────
const opOut = (o: any) => ({
  id: o._id.toString(), email: o.email, full_name: o.full_name, roles: o.roles, status: o.status,
  mfa_enabled: !!o.mfa?.enabled, last_login_at: o.last_login_at ?? null, created_at: o.created_at,
});
const operatorRoles = z.array(z.enum(['platform_admin'])).min(1);

router.get('/operators', asyncHandler(async (_req: Request, res: Response) => ok(res, (await OperatorAccount.find().sort({ created_at: 1 })).map(opOut))));
router.post('/operators', asyncHandler(async (req: Request, res: Response) => {
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
router.patch('/operators/:id', asyncHandler(async (req: Request, res: Response) => {
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

export default router;
