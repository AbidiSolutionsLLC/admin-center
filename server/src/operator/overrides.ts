// server/src/operator/overrides.ts
// Entitlement overrides (Plan 4.6, DRD 3.2 rule 5): an operator override (`source: 'operator'`, stored value kept per F5)
// is set by PUT /orgs/:id/entitlements/:productKey (routes.ts, `reason` required, optional `expires_at`). This file holds
// the way back to plan state, used by DELETE /orgs/:id/entitlements/:productKey/override and by the expiry job.
import { Router, Request, Response } from 'express';
import { Types, ClientSession } from 'mongoose';
import { Company, ICompany } from '../models/Company.model';
import { Plan } from '../models/Plan.model';
import { OrganizationEntitlement } from '../models/OrganizationEntitlement.model';
import { runInTransaction, emitPlatformEvent, fanOutAppAccessChanged } from '../lib/platformEvents';
import { assertProductKey } from '../lib/productRegistry';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { bumpOrgAuthz } from './plans';
import { writeAudit, type AuditInput } from './audit';
import { requirePermission } from './permissions';

export type EventActor = { type: 'operator' | 'system'; id?: string };

export interface RemoveOverrideCtx {
  actor: EventActor;
  correlation_id: string;
  operator_id?: Types.ObjectId;
  audit: (p: AuditInput) => Promise<void>;
  reason: string;
}

/**
 * Take an override off one product, inside the caller's transaction. When the tenant's plan includes the product it goes
 * back to the plan's state (`source: 'plan'`, active, the plan's seat default); otherwise the entitlement is deleted.
 * Returns the resulting state, or null when there was no override. The caller fans out `app_access.changed` after commit.
 */
export async function removeOverride(
  session: ClientSession | undefined, company: ICompany, productKey: string, ctx: RemoveOverrideCtx,
): Promise<{ status: 'active' | 'removed' } | null> {
  const opts = { session: session ?? undefined };
  const ent = await OrganizationEntitlement.findOne({ company_id: company._id, product_key: productKey, source: 'operator' }).session(session ?? null);
  if (!ent) return null;
  const plan = company.plan ? await Plan.findOne({ key: company.plan }).session(session ?? null) : null;
  const inPlan = !!plan && plan.products.includes(productKey);
  const before = { status: ent.status, source: 'override', seats_limit: ent.seats_limit ?? null, expires_at: ent.expires_at ?? null };
  const orgId = String(company._id);

  if (inPlan && plan) {
    const def = plan.seat_defaults?.get(productKey);
    await OrganizationEntitlement.updateOne({ _id: ent._id }, {
      $set: { status: 'active', source: 'plan', plan_key: plan.key, plan_version: plan.version ?? 1, ...(typeof def === 'number' ? { seats_limit: def } : {}), ...(ctx.operator_id ? { updated_by_operator_id: ctx.operator_id } : {}) },
      $unset: { reason: 1, expires_at: 1, ...(typeof def === 'number' ? {} : { seats_limit: 1 }) },
    }, opts);
  } else {
    await OrganizationEntitlement.deleteOne({ _id: ent._id }, opts);
  }
  await emitPlatformEvent(session, {
    org_id: orgId, type: 'entitlement.changed', subject: { type: 'org', id: orgId }, actor: ctx.actor, correlation_id: ctx.correlation_id,
    data: { product_key: productKey, status: inPlan ? 'active' : 'restricted', ...(inPlan ? { source: 'plan' } : {}) },
  });
  await bumpOrgAuthz(company._id as Types.ObjectId, session);
  await ctx.audit({
    action: 'entitlement.override_removed', target_type: 'Entitlement', target_id: `${orgId}:${productKey}`, company,
    before, after: { status: inPlan ? 'active' : 'removed', source: inPlan ? 'plan' : null }, reason: ctx.reason,
  });
  return { status: inPlan ? 'active' : 'removed' };
}

/**
 * Hourly job body: every active override whose `expires_at` has passed falls back to plan state, audited with actor
 * `system`. One transaction per entitlement; the access fan-out follows each commit. Returns how many were removed.
 */
export async function expireOverrides(now: Date = new Date(), limit = 500): Promise<number> {
  const due = await OrganizationEntitlement.find({ source: 'operator', status: 'active', expires_at: { $lte: now } }).limit(limit).select('company_id product_key').lean();
  let n = 0;
  for (const row of due) {
    const company = await Company.findById(row.company_id);
    if (!company) continue;
    const actor: EventActor = { type: 'system' };
    const correlation_id = `override-expiry-${now.toISOString()}`;
    const removed = await runInTransaction((session) => removeOverride(session, company, row.product_key, {
      actor, correlation_id, reason: 'Override expired',
      audit: (p) => writeAudit({ operator: null, correlation_id }, p, session),
    }));
    if (!removed) continue;
    n++;
    await fanOutAppAccessChanged(company._id, { actor, correlation_id, batchSize: 200 });
  }
  return n;
}

interface Helpers {
  ok: (res: Response, data: unknown, status?: number, meta?: unknown) => unknown;
  oid: (id: string, what?: string) => string;
  audit: (req: Request, p: AuditInput, session?: ClientSession) => Promise<void>;
  actorOf: (req: Request) => { type: 'operator'; id: string };
  corrOf: (req: Request) => string;
}

export function overrideRoutes(h: Helpers): Router {
  const router = Router();

  // Back to plan state. `reason` is required (query or body) and goes into the audit entry.
  router.delete('/orgs/:id/entitlements/:productKey/override', requirePermission('entitlements.write'), asyncHandler(async (req: Request, res: Response) => {
    const key = await assertProductKey(String(req.params.productKey));
    const raw = typeof req.body?.reason === 'string' ? req.body.reason : typeof req.query.reason === 'string' ? req.query.reason : '';
    const reason = raw.trim().slice(0, 500);
    if (!reason) throw new AppError('A reason is required', 400, 'REASON_REQUIRED');
    const company = await Company.findById(h.oid(String(req.params.id)));
    if (!company) throw new AppError('Organization not found', 404, 'NOT_FOUND');
    const result = await runInTransaction((session) => removeOverride(session, company, key, {
      actor: h.actorOf(req), correlation_id: h.corrOf(req), operator_id: req.operator!._id as Types.ObjectId, reason,
      audit: (p) => h.audit(req, p, session),
    }));
    if (!result) throw new AppError('This product has no override', 404, 'NOT_FOUND');
    await fanOutAppAccessChanged(company._id, { actor: h.actorOf(req), correlation_id: h.corrOf(req), batchSize: 200 });
    h.ok(res, { product_key: key, ...result });
  }));

  return router;
}
