// server/src/operator/health.ts
// Platform health endpoints (Plan 4.9, DRD 4.2, 7). They only read: the checks run in lib/health on a timer.
//   GET /health        components (latest state of each) + the last 50 state changes
//   GET /health/sync   per-tenant products sync rows, proxied from the products backend (cached 30 s)
import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { Company } from '../models/Company.model';
import { HealthCheck, HealthEvent } from '../models/Health.model';
import { COMPONENTS } from '../lib/health';
import { overallState } from '../lib/health/evaluate';
import { probeProducts } from '../lib/health/productsProbe';
import { asyncHandler } from '../utils/asyncHandler';
import { requirePermission } from './permissions';

interface Helpers { ok: (res: Response, data: unknown, status?: number, meta?: unknown) => unknown }

/** A result older than this means the health job is not running. */
export const STALE_AFTER_MS = 3 * 60_000;

export function healthRoutes(h: Helpers): Router {
  const router = Router();

  router.get('/health', requirePermission('health.read'), asyncHandler(async (_req: Request, res: Response) => {
    const [checks, events] = await Promise.all([HealthCheck.find().lean(), HealthEvent.find().sort({ at: -1 }).limit(50).lean()]);
    const by = new Map(checks.map((c) => [c.component, c]));
    const components = COMPONENTS.map((component) => {
      const c = by.get(component);
      return c
        ? { component, state: c.state, detail: c.detail, metrics: c.metrics ?? null, checked_at: c.checked_at }
        : { component, state: 'unknown' as const, detail: 'Not checked yet', metrics: null, checked_at: null };
    });
    const oldest = components.reduce<number | null>((m, c) => (c.checked_at ? Math.min(m ?? Infinity, c.checked_at.getTime()) : m), null);
    h.ok(res, {
      state: overallState(components.map((c) => c.state)),
      stale: oldest === null || Date.now() - oldest > STALE_AFTER_MS,
      components,
      history: events.map((e) => ({ id: String(e._id), component: e.component, from: e.from, to: e.to, detail: e.detail, at: e.at })),
    });
  }));

  router.get('/health/sync', requirePermission('health.read'), asyncHandler(async (_req: Request, res: Response) => {
    const p = await probeProducts();
    if (!p) return h.ok(res, { configured: false, answered: false, rows: [], summary: null, fetched_at: null });
    const ids = p.orgs.filter((o) => Types.ObjectId.isValid(o.platformOrgId)).map((o) => o.platformOrgId);
    const names = new Map((await Company.find({ _id: { $in: ids } }).select('name slug').lean()).map((c) => [String(c._id), c]));
    const rows = p.orgs.map((o) => ({
      org_id: o.platformOrgId, name: names.get(o.platformOrgId)?.name ?? null, slug: names.get(o.platformOrgId)?.slug ?? null,
      last_applied_seq: o.lastAppliedSeq, pending_seq: o.pendingSeq, lag: o.lag, parked: o.parked, last_error_code: o.lastErrorCode, updated_at: o.updatedAt,
    })).sort((a, b) => b.lag - a.lag || b.parked - a.parked);
    h.ok(res, { configured: true, answered: p.answered, error: p.error ?? null, rows, summary: p.summary, fetched_at: new Date(p.at) });
  }));

  return router;
}
