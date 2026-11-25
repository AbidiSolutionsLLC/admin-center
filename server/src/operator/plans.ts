// server/src/operator/plans.ts
// Plans (Plan 4.5, DRD 3 and 4.2): the plan list and editor, applying a plan to one tenant (`applyPlanToOrg`) and to
// every tenant on it (`POST /plans/:key/apply`, one job per tenant), and the access helpers they share with routes.ts.
//   GET /plans   POST /plans   PATCH /plans/:key   POST /plans/:key/apply[?dry_run=true]
// `routes.ts` passes in its own helpers (as onboarding.ts does).
import { Router, Request, Response } from 'express';
import { Types, ClientSession } from 'mongoose';
import { z } from 'zod';
import { Company, ICompany } from '../models/Company.model';
import { User } from '../models/User.model';
import { Plan, IPlan } from '../models/Plan.model';
import { App } from '../models/App.model';
import { ProductRole } from '../models/ProductRole.model';
import { AppAssignment } from '../models/AppAssignment.model';
import { Group } from '../models/Group.model';
import { OrganizationEntitlement } from '../models/OrganizationEntitlement.model';
import { OperatorAccount } from '../models/OperatorAccount.model';
import { seedProductRegistry } from '../lib/productCatalog';
import { assertProductKeys, listProducts } from '../lib/productRegistry';
import { runInTransaction, emitPlatformEvent, fanOutAppAccessChanged } from '../lib/platformEvents';
import { enqueueMany, registerJobHandler } from '../lib/jobs';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { findFirstAdmin } from './onboarding';
import { requirePermission } from './permissions';
import { writeAudit, type AuditInput } from './audit';

// ── Access helpers shared with routes.ts (moved here unchanged from routes.ts) ───────────────
/**
 * Default access on the "All Members" dynamic group, from each product manifest's default_assignments, each only with
 * an active entitlement for that product. Idempotent. Built-in defaults: people -> employee (04 §7); desk -> requester
 * (C-3 "desk for everyone", decided 2026-11-12: an admin excludes members by editing or removing the rule; migrated
 * orgs get per-member requester grants from the E11 seed instead, legacy hasDeskPortalAccess === false = excluded).
 */
export async function ensureDefaultAccess(companyId: Types.ObjectId, grantedBy: Types.ObjectId, session?: ClientSession) {
  const sess = session ?? null;
  const opts = { session: session ?? undefined };
  // Global catalog, outside the txn: seed when empty or when a built-in predates the manifest fields (re-seed is idempotent).
  if (!(await listProducts()).length || await App.exists({ app_type: 'karbexa_product', company_id: { $exists: false }, manifest_version: { $exists: false } })) await seedProductRegistry();
  for (const product of await listProducts()) {
    const app = await App.findOne({ product_key: product.product_key, app_type: 'karbexa_product', company_id: { $exists: false } }).session(sess);
    if (!app) continue;
    const rules = (app.default_assignments ?? []).filter(a => a.target === 'all_members');
    if (!rules.length) continue;
    if (!(await OrganizationEntitlement.exists({ company_id: companyId, product_key: product.product_key, status: 'active' }).session(sess))) continue;
    let group = await Group.findOne({ company_id: companyId, name: 'All Members', type: 'dynamic' }).session(sess);
    if (!group) [group] = await Group.create([{ company_id: companyId, name: 'All Members', type: 'dynamic', dynamic_rules: {}, is_active: true } as never], opts);
    for (const rule of rules) {
      const exists = await AppAssignment.exists({ company_id: companyId, app_id: app._id, target_type: 'group', target_id: group._id, product_role_key: rule.role }).session(sess);
      if (!exists) {
        await AppAssignment.create([{
          company_id: companyId, app_id: app._id, target_type: 'group', target_id: group._id, product_role_key: rule.role, granted_by: grantedBy, is_active: true,
        } as never], opts);
      }
    }
  }
}

/**
 * Entitlement/plan/status changes alter every member's effective access (04 §8.2). O(1) inside the txn:
 * one updateMany bumps every member's authz_ver. Per-member app_access.changed fans out after commit (fanOutOrgAccess).
 */
export async function bumpOrgAuthz(companyId: Types.ObjectId, session?: ClientSession) {
  await User.updateMany({ company_id: companyId }, { $inc: { authz_ver: 1 } }, { session });
}

// ── Applying a plan (DRD 3.2 rules 2 to 4) ─────────────────────────────────────────────────────

type EntRow = { product_key: string; status: string; source: string; seats_limit?: number | null };

export interface PlanDiff {
  /** Plan products that become active: no entitlement yet, or a `restricted` one coming back. */
  added: string[];
  /** Plan-sourced entitlements for products the plan no longer includes: become `restricted`. */
  restricted: string[];
  /** Plan products left as they are: already active, suspended, or an operator override. */
  unchanged: string[];
  /** Plan-sourced entitlements kept as they are whose seat limit differs from the plan's seat default: the limit follows the plan. */
  reseated: string[];
}

/**
 * What applying `plan` would do, given a tenant's current entitlements. Pure. Overrides (`source: 'operator'`) are never
 * touched; only `source: 'plan'` entitlements are restricted when their product leaves the plan. `seatDefaultFor` gives the
 * plan's seat default per product (null = no limit); when it is passed, a plan-sourced entitlement whose limit differs is
 * reported as `reseated` instead of `unchanged`, so a changed seat default is visible and applied.
 */
export function diffPlan(products: readonly string[], ents: readonly EntRow[], seatDefaultFor?: (key: string) => number | null): PlanDiff {
  const byKey = new Map(ents.map((e) => [e.product_key, e]));
  const diff: PlanDiff = { added: [], restricted: [], unchanged: [], reseated: [] };
  for (const key of products) {
    const e = byKey.get(key);
    if (!e || (e.status === 'restricted' && e.source !== 'operator')) diff.added.push(key);
    else if (seatDefaultFor && e.source === 'plan' && e.status !== 'restricted' && (e.seats_limit ?? null) !== seatDefaultFor(key)) diff.reseated.push(key);
    else diff.unchanged.push(key);
  }
  for (const e of ents) if (e.source === 'plan' && e.status !== 'restricted' && !products.includes(e.product_key)) diff.restricted.push(e.product_key);
  return diff;
}

const seatDefault = (plan: IPlan, key: string): number | null => {
  const v = plan.seat_defaults?.get(key);
  return typeof v === 'number' ? v : null;
};

export interface PlanApplyCtx {
  actor: { type: 'operator'; id: string };
  correlation_id: string;
  operator_id: Types.ObjectId;
  /** Writes the audit entry (a request-bound or a job-bound writer). */
  audit: (p: AuditInput) => Promise<void>;
  /** Compute the diff only; write nothing. */
  dry_run?: boolean;
}

/**
 * Apply `plan` to one tenant inside the caller's transaction (DRD 3.2 rule 2): upsert an entitlement per plan product
 * (`source: 'plan'`, `plan_version`, the seat default when no limit is set), restrict plan-sourced entitlements that
 * left the plan, keep overrides, ensure default access for newly active products. The caller fans out
 * `app_access.changed` after commit when `added` or `restricted` is not empty.
 */
export async function applyPlanToOrg(session: ClientSession | undefined, company: ICompany, plan: IPlan, ctx: PlanApplyCtx): Promise<PlanDiff> {
  const opts = { session: session ?? undefined };
  const ents = await OrganizationEntitlement.find({ company_id: company._id }).session(session ?? null).lean();
  const diff = diffPlan(plan.products, ents, (key) => seatDefault(plan, key));
  if (ctx.dry_run) return diff;

  const orgId = String(company._id);
  const byKey = new Map(ents.map((e) => [e.product_key, e]));
  const before = { plan_key: company.plan ?? null };
  await Company.updateOne({ _id: company._id }, { $set: { plan: plan.key } }, opts);

  for (const key of plan.products) {
    const existing = byKey.get(key);
    if (existing?.source === 'operator') continue; // an override: untouched
    const set: Record<string, unknown> = { source: 'plan', plan_key: plan.key, plan_version: plan.version ?? 1, updated_by_operator_id: ctx.operator_id };
    if (diff.added.includes(key)) set.status = 'active';
    const def = seatDefault(plan, key);
    // A plan-sourced entitlement (or a new one) takes the plan's seat default, also when the default changed since the
    // plan was last applied: a per-tenant limit is an override (`source: 'operator'`), which `continue`s above. Any other
    // source keeps the old rule: the default fills an empty limit only.
    const followsPlan = !existing || existing.source === 'plan';
    const unset: Record<string, 1> = {};
    if (def !== null && (followsPlan || existing?.seats_limit === undefined || existing?.seats_limit === null)) set.seats_limit = def;
    else if (def === null && followsPlan && existing?.seats_limit != null) unset.seats_limit = 1;
    await OrganizationEntitlement.updateOne({ company_id: company._id, product_key: key }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { upsert: true, ...opts });
    if (diff.added.includes(key) || diff.reseated.includes(key)) {
      await emitPlatformEvent(session, {
        org_id: orgId, type: 'entitlement.changed', subject: { type: 'org', id: orgId }, actor: ctx.actor, correlation_id: ctx.correlation_id,
        data: { product_key: key, status: existing && !diff.added.includes(key) ? existing.status : 'active', source: 'plan', ...(def !== null ? { seats_limit: def } : {}) },
      });
    }
  }
  for (const key of diff.restricted) {
    await OrganizationEntitlement.updateOne({ company_id: company._id, product_key: key, source: 'plan' }, { $set: { status: 'restricted', updated_by_operator_id: ctx.operator_id } }, opts);
    await emitPlatformEvent(session, {
      org_id: orgId, type: 'entitlement.changed', subject: { type: 'org', id: orgId }, actor: ctx.actor, correlation_id: ctx.correlation_id,
      data: { product_key: key, status: 'restricted', source: 'plan' },
    });
  }

  if (diff.added.length) {
    const firstAdmin = await findFirstAdmin(company._id as Types.ObjectId, session);
    if (firstAdmin) await ensureDefaultAccess(company._id as Types.ObjectId, firstAdmin._id as Types.ObjectId, session);
  }
  if (diff.added.length || diff.restricted.length) await bumpOrgAuthz(company._id as Types.ObjectId, session);
  await ctx.audit({
    action: 'org.plan_assigned', target_type: 'Company', target_id: orgId, company, before,
    after: { plan_key: plan.key, plan_version: plan.version ?? 1, added: diff.added, restricted: diff.restricted, reseated: diff.reseated },
  });
  return diff;
}

/** `[{ product_key, tenants }]` from per-tenant key lists: the shape both dry runs return. */
const countKeys = (lists: string[][]) => {
  const m = new Map<string, number>();
  for (const l of lists) for (const k of l) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].map(([product_key, tenants]) => ({ product_key, tenants })).sort((a, b) => a.product_key.localeCompare(b.product_key));
};
export const dryRunSummary = (diffs: PlanDiff[]) => ({
  added: countKeys(diffs.map((d) => d.added)),
  restricted: countKeys(diffs.map((d) => d.restricted)),
  unchanged: countKeys(diffs.map((d) => d.unchanged)),
  reseated: countKeys(diffs.map((d) => d.reseated)),
  tenants_affected: diffs.filter((d) => d.added.length || d.restricted.length || d.reseated.length).length,
});

const APPLY_JOB = 'plan.apply';

/** Job handler: apply the plan to one tenant as the operator who started the run, then fan out after commit. */
registerJobHandler(APPLY_JOB, async (payload) => {
  const company = await Company.findById(payload.company_id);
  const plan = await Plan.findOne({ key: payload.plan_key });
  const operator = await OperatorAccount.findById(payload.operator_id).select('email');
  if (!company || !plan || !operator || company.status === 'closed' || company.plan !== plan.key || plan.status !== 'active') return; // moved off the plan, closed or gone: nothing to do
  const actor = { type: 'operator' as const, id: String(operator._id) };
  const correlation_id = String(payload.correlation_id ?? '');
  const diff = await runInTransaction((session) => applyPlanToOrg(session, company, plan, {
    actor, correlation_id, operator_id: operator._id as Types.ObjectId,
    audit: (p) => writeAudit({ operator: { _id: operator._id as Types.ObjectId, email: operator.email }, correlation_id }, { ...p, reason: `Plan ${plan.key} applied to all tenants` }, session),
  }));
  if (diff.added.length || diff.restricted.length) await fanOutAppAccessChanged(company._id, { actor, correlation_id, batchSize: 200 });
});

// ── Routes ───────────────────────────────────────────────────────────────────────────────────

interface Helpers {
  ok: (res: Response, data: unknown, status?: number, meta?: unknown) => unknown;
  audit: (req: Request, p: AuditInput, session?: ClientSession) => Promise<void>;
  corrOf: (req: Request) => string;
}

const productKey = z.string().trim().min(1).max(64);
const seatDefaults = z.record(productKey, z.number().int().min(0).nullable());

const planOut = (p: any, tenant_count?: number) => ({
  id: p._id.toString(), key: p.key, name: p.name, products: p.products, status: p.status,
  description: p.description ?? null, seat_defaults: Object.fromEntries(p.seat_defaults ?? []), trial_days: p.trial_days ?? null,
  version: p.version ?? 1, ...(tenant_count === undefined ? {} : { tenant_count }),
});

export function planRoutes(h: Helpers): Router {
  const router = Router();

  router.get('/plans', requirePermission('tenants.read'), asyncHandler(async (_req: Request, res: Response) => {
    const [plans, counts] = await Promise.all([
      Plan.find().sort({ key: 1 }),
      Company.aggregate<{ _id: string; n: number }>([{ $match: { status: { $ne: 'closed' } } }, { $group: { _id: '$plan', n: { $sum: 1 } } }]),
    ]);
    const n = new Map(counts.map((c) => [c._id, c.n]));
    h.ok(res, plans.map((p) => planOut(p, n.get(p.key) ?? 0)));
  }));

  router.post('/plans', requirePermission('plans.write'), asyncHandler(async (req: Request, res: Response) => {
    const b = z.object({
      key: z.string().trim().regex(/^[a-z0-9_-]{2,40}$/), name: z.string().trim().min(1).max(80),
      products: z.array(productKey).default([]), status: z.enum(['active', 'archived']).optional(),
      description: z.string().trim().max(500).optional(), seat_defaults: seatDefaults.optional(), trial_days: z.number().int().min(1).max(365).nullable().optional(),
    }).parse(req.body);
    await assertProductKeys(b.products);
    if (b.seat_defaults) await assertProductKeys(Object.keys(b.seat_defaults));
    if (await Plan.exists({ key: b.key })) throw new AppError('A plan with this key already exists', 409, 'DUPLICATE');
    const plan = await Plan.create(b);
    await h.audit(req, { action: 'plan.created', target_type: 'Plan', target_id: plan.key, after: planOut(plan), details: planOut(plan) });
    h.ok(res, planOut(plan), 201);
  }));

  router.patch('/plans/:key', requirePermission('plans.write'), asyncHandler(async (req: Request, res: Response) => {
    const b = z.object({
      name: z.string().trim().min(1).max(80), products: z.array(productKey), status: z.enum(['active', 'archived']),
      description: z.string().trim().max(500), seat_defaults: seatDefaults, trial_days: z.number().int().min(1).max(365).nullable(),
    }).partial().parse(req.body);
    if (b.products) await assertProductKeys(b.products);
    if (b.seat_defaults) await assertProductKeys(Object.keys(b.seat_defaults));
    const plan = await Plan.findOne({ key: String(req.params.key) });
    if (!plan) throw new AppError('Plan not found', 404, 'NOT_FOUND');
    const before = planOut(plan);
    Object.assign(plan, b);
    plan.version = (plan.version ?? 1) + 1; // every edit raises the version
    await plan.save();
    await h.audit(req, { action: 'plan.updated', target_type: 'Plan', target_id: plan.key, before, after: planOut(plan), details: { before, after: planOut(plan) } });
    h.ok(res, planOut(plan));
  }));

  // Apply the plan to every tenant on it: one job per tenant (DRD 3.2 rule 3). `?dry_run=true` writes nothing.
  router.post('/plans/:key/apply', requirePermission('plans.write'), asyncHandler(async (req: Request, res: Response) => {
    const plan = await Plan.findOne({ key: String(req.params.key) });
    if (!plan) throw new AppError('Plan not found', 404, 'NOT_FOUND');
    if (plan.status !== 'active') throw new AppError('Archived plans cannot be applied', 409, 'PLAN_ARCHIVED');
    const tenants = await Company.find({ plan: plan.key, status: { $ne: 'closed' } }).select('_id').lean();

    if (req.query.dry_run === 'true') {
      const diffs: PlanDiff[] = [];
      for (let i = 0; i < tenants.length; i += 200) {
        const ids = tenants.slice(i, i + 200).map((t) => t._id);
        const ents = await OrganizationEntitlement.find({ company_id: { $in: ids } }).lean();
        const by = new Map<string, EntRow[]>();
        for (const e of ents) by.set(String(e.company_id), [...(by.get(String(e.company_id)) ?? []), e]);
        for (const id of ids) diffs.push(diffPlan(plan.products, by.get(String(id)) ?? [], (key) => seatDefault(plan, key)));
      }
      return h.ok(res, dryRunSummary(diffs));
    }

    const queued = await enqueueMany(APPLY_JOB, tenants.map((t) => ({
      company_id: String(t._id), plan_key: plan.key, operator_id: String(req.operator!._id), correlation_id: h.corrOf(req),
    })));
    await h.audit(req, { action: 'plan.applied', target_type: 'Plan', target_id: plan.key, after: { version: plan.version ?? 1 }, details: { tenants_queued: queued } });
    h.ok(res, { queued, tenants_affected: queued }, 202);
  }));

  // Read-only catalogue (Plan 4.13): every registered product with its manifest facts and how many organizations hold it.
  router.get('/products', requirePermission('products.read'), asyncHandler(async (_req: Request, res: Response) => {
    const registered = await listProducts();
    const closed = await Company.find({ status: 'closed' }).distinct('_id');
    const [apps, roleCounts, entCounts] = await Promise.all([
      App.find({ app_type: 'karbexa_product', company_id: { $exists: false }, product_key: { $in: registered.map((p) => p.product_key) } }).lean(),
      ProductRole.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$product_key', n: { $sum: 1 } } }]),
      OrganizationEntitlement.aggregate<{ _id: { product_key: string; status: string }; n: number }>([
        { $match: { company_id: { $nin: closed } } },
        { $group: { _id: { product_key: '$product_key', status: '$status' }, n: { $sum: 1 } } },
      ]),
    ]);
    const roles = new Map(roleCounts.map((r) => [r._id, r.n]));
    const tenants = (key: string, status: string) => entCounts.find((e) => e._id.product_key === key && e._id.status === status)?.n ?? 0;
    h.ok(res, registered.map((p) => {
      const a = apps.find((x) => x.product_key === p.product_key);
      return {
        product_key: p.product_key, name: p.name, status: a?.product_status ?? 'active', category: a?.product_category ?? null,
        manifest_version: a?.manifest_version ?? null, icon: a?.icon ?? null, launch_url: a?.launch_url ?? null,
        roles: roles.get(p.product_key) ?? 0, default_assignments: a?.default_assignments ?? [],
        tenants_active: tenants(p.product_key, 'active'), tenants_suspended: tenants(p.product_key, 'suspended'), tenants_restricted: tenants(p.product_key, 'restricted'),
      };
    }));
  }));

  return router;
}
