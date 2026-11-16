// server/src/operator/overview.ts
// Overview endpoint (Plan 4.10, DRD 4.2): one call for the Command Center home page. Each block is computed on its own;
// a block that fails comes back as `{ error: true }` so one broken query never blanks the page.
//   GET /overview   { tenants, members_active, health, attention, activity }
import { Router, Request, Response } from 'express';
import { Company } from '../models/Company.model';
import { Invitation } from '../models/Invitation.model';
import { OperatorAuditEvent } from '../models/OperatorAuditEvent.model';
import { HealthCheck } from '../models/Health.model';
import { AttentionItem, TenantDailyStat } from '../models/Signals.model';
import { COMPONENTS } from '../lib/health';
import { overallState } from '../lib/health/evaluate';
import { startOfDay } from '../lib/signals';
import { asyncHandler } from '../utils/asyncHandler';
import { requirePermission } from './permissions';

interface Helpers { ok: (res: Response, data: unknown, status?: number, meta?: unknown) => unknown }

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

async function block<T>(fn: () => Promise<T>): Promise<T | { error: true }> {
  try {
    return await fn();
  } catch (err) {
    console.error('[overview]', String((err as Error)?.message ?? err));
    return { error: true };
  }
}

export function overviewRoutes(h: Helpers): Router {
  const router = Router();

  router.get('/overview', requirePermission('overview.read'), asyncHandler(async (_req: Request, res: Response) => {
    const now = new Date();
    const [tenants, members_active, health, attention, activity] = await Promise.all([
      block(async () => {
        const [byStatus, trial, onboardingIds] = await Promise.all([
          Company.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
          Company.countDocuments({ status: 'active', trial_ends_at: { $gt: now } }),
          Invitation.distinct('company_id', { kind: 'first_admin', state: 'pending', company_id: { $ne: null } }),
        ]);
        const n = (s: string) => byStatus.find((r) => r._id === s)?.n ?? 0;
        return {
          total: byStatus.reduce((t, r) => t + r.n, 0), active: n('active'), trial, suspended: n('suspended'),
          onboarding: new Set([...onboardingIds.map(String)]).size + n('provisioning'),
        };
      }),
      block(async () => {
        // The latest stat row of each tenant (today's, or yesterday's before the first run of the day).
        const since = new Date(startOfDay(now).getTime() - 24 * 3600_000);
        const rows = await TenantDailyStat.aggregate<{ n: number }>([
          { $match: { day: { $gte: since } } }, { $sort: { day: -1 } },
          { $group: { _id: '$company_id', n: { $first: '$members_active' } } },
          { $group: { _id: null, n: { $sum: '$n' } } },
        ]);
        return rows[0]?.n ?? 0;
      }),
      block(async () => {
        const checks = await HealthCheck.find().lean();
        const by = new Map(checks.map((c) => [c.component, c]));
        const components = COMPONENTS.map((component) => ({ component, state: by.get(component)?.state ?? ('unknown' as const), detail: by.get(component)?.detail ?? 'Not checked yet' }));
        return { state: overallState(components.map((c) => c.state)), components };
      }),
      block(async () => {
        const open = { open: true, confirmed: { $ne: false } };
        const [counts, items] = await Promise.all([
          AttentionItem.aggregate<{ _id: string; n: number }>([{ $match: open }, { $group: { _id: '$severity', n: { $sum: 1 } } }]),
          AttentionItem.find(open).sort({ first_seen_at: 1 }).limit(200).lean(),
        ]);
        const c = (s: string) => counts.find((r) => r._id === s)?.n ?? 0;
        const top = items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.first_seen_at.getTime() - b.first_seen_at.getTime()).slice(0, 10)
          .map((i) => ({ id: String(i._id), kind: i.kind, severity: i.severity, company_id: i.company_id ? String(i.company_id) : null, summary: i.summary, link: i.link, first_seen_at: i.first_seen_at }));
        return { counts: { critical: c('critical'), warning: c('warning'), info: c('info') }, top };
      }),
      block(async () => (await OperatorAuditEvent.find().sort({ created_at: -1 }).limit(20).select('operator_email action target_type target_id category result created_at').lean())
        .map((e) => ({ id: String(e._id), operator_email: e.operator_email, action: e.action, target_type: e.target_type, target_id: e.target_id ?? null, category: e.category, result: e.result, at: e.created_at }))),
    ]);
    h.ok(res, { tenants, members_active, health, attention, activity });
  }));

  return router;
}
