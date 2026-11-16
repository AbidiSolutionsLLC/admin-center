// server/src/lib/health/index.ts
// Platform health collection (DRD 7.1, Plan 4.9): once a minute, under a lease, every component is measured (each check
// has 5 seconds), judged by ./evaluate.ts, stored in `HealthCheck`, and a state change adds a `HealthEvent`.
// `standalone_portals` is not collected (Phase 6). `GET /operator/v1/health` only reads what this stores.
import mongoose from 'mongoose';
import { HealthCheck, HealthEvent, type HealthState } from '../../models/Health.model';
import { EmailDelivery } from '../../models/EmailDelivery.model';
import { Job } from '../../models/Job.model';
import { OrgEventCounter } from '../../models/OrgEventCounter.model';
import { PlatformEventSubscription } from '../../models/PlatformEventSubscription.model';
import { SubscriptionCursor } from '../../models/SubscriptionCursor.model';
import { PlatformLease } from '../../models/PlatformLease.model';
import { getPublicJwks } from '../../identity/keys';
import { DISPATCHER_LEASE_NAME, DISPATCHER_LEASE_TTL_MS } from '../platformDispatcher';
import { every } from '../periodic';
import { probeProducts } from './productsProbe';
import { recentRouteStats } from './routeMetrics';
import {
  evalAdminApi, evalDatabase, evalDispatcher, evalEmail, evalIdentity, evalJobs, evalProductsApi, evalProductsWorker, unknownState,
  type Evaluation,
} from './evaluate';

export const HEALTH_EVERY_MS = 60_000;
export const CHECK_TIMEOUT_MS = 5_000;
const HOUR = 3600_000;

export const COMPONENTS = ['admin_api', 'database', 'identity', 'event_dispatcher', 'products_api', 'products_worker', 'email', 'jobs'] as const;
export type Component = (typeof COMPONENTS)[number];

// ── Collectors: measure, then hand the numbers to the pure rules ─────────────────────────────

async function checkAdminApi(): Promise<Evaluation> {
  return evalAdminApi(await recentRouteStats());
}

async function checkDatabase(): Promise<Evaluation> {
  const db = mongoose.connection.db;
  if (!db) return evalDatabase({ pingMs: null, writable: false });
  const t = Date.now();
  try {
    await db.admin().ping();
  } catch {
    return evalDatabase({ pingMs: null, writable: false });
  }
  const pingMs = Date.now() - t;
  const hello = await db.admin().command({ hello: 1 }).catch(() => null);
  return evalDatabase({ pingMs, writable: hello?.isWritablePrimary === true });
}

/** IDENTITY_KEY_ROTATE_BY (optional ISO date): the day the current signing keys should have been replaced. */
const rotateBy = (): Date | null => {
  const raw = process.env.IDENTITY_KEY_ROTATE_BY;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

async function checkIdentity(now: Date): Promise<Evaluation> {
  const realms = ['tenant', 'services', 'operator'] as const;
  const withKeys = realms.filter((r) => { try { return getPublicJwks(r).keys.length > 0; } catch { return false; } });
  return evalIdentity({ realmsWithKeys: withKeys.length, realms: realms.length, rotateBy: rotateBy() }, now);
}

async function checkDispatcher(now: Date): Promise<Evaluation> {
  if (process.env.PLATFORM_DISPATCHER === 'off') return { state: 'healthy', detail: 'Switched off (PLATFORM_DISPATCHER=off)' };
  const lease = await PlatformLease.findById(DISPATCHER_LEASE_NAME).lean();
  const leaseAgeMs = lease ? Math.max(0, now.getTime() - (lease.until.getTime() - DISPATCHER_LEASE_TTL_MS)) : null;

  // Organizations whose latest event is beyond the last acknowledged nudge, for any active subscriber.
  const subs = await PlatformEventSubscription.find({ status: 'active' }).select('_id').lean();
  const counters = await OrgEventCounter.find({ seq: { $gt: 0 } }).select('seq').lean();
  const behind = new Set<string>();
  for (const sub of subs) {
    const acked = new Map((await SubscriptionCursor.find({ subscription_id: sub._id }).select('org_id last_acknowledged_seq').lean())
      .map((c) => [String(c.org_id), c.last_acknowledged_seq]));
    for (const c of counters) if (c.seq > (acked.get(String(c._id)) ?? 0)) behind.add(String(c._id));
  }
  return evalDispatcher({ leaseAgeMs, intervalMs: Number(process.env.PLATFORM_DISPATCH_INTERVAL_MS) || 2000, backlogOrgs: behind.size });
}

async function checkProductsApi(): Promise<Evaluation> {
  const p = await probeProducts();
  return evalProductsApi(p && { answered: p.answered, ms: p.ms, status: p.status, error: p.error });
}

async function checkProductsWorker(): Promise<Evaluation> {
  const p = await probeProducts();
  if (!p || !p.answered || !p.summary) return evalProductsWorker(null);
  return evalProductsWorker({ leaseAgeMs: p.summary.worker.leaseAgeMs, maxLag: p.summary.maxLag, parkedTotal: p.summary.parkedTotal });
}

async function checkEmail(now: Date): Promise<Evaluation> {
  const since = new Date(now.getTime() - HOUR);
  const rows = await EmailDelivery.aggregate<{ _id: string; n: number }>([
    { $match: { created_at: { $gte: since }, status: { $in: ['sent', 'failed'] } } }, { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const count = (s: string) => rows.find((r) => r._id === s)?.n ?? 0;
  const oldest = await EmailDelivery.findOne({ status: 'queued' }).sort({ created_at: 1 }).select('created_at').lean();
  return evalEmail({ sent: count('sent'), failed: count('failed'), oldestQueuedAgeMs: oldest ? now.getTime() - oldest.created_at.getTime() : null });
}

async function checkJobs(now: Date): Promise<Evaluation> {
  const failedLastHour = await Job.countDocuments({ status: 'failed', finished_at: { $gte: new Date(now.getTime() - HOUR) } });
  const overdue = await Job.findOne({ status: 'queued', run_at: { $lte: now } }).sort({ run_at: 1 }).select('run_at').lean();
  return evalJobs({ failedLastHour, overdueAgeMs: overdue ? now.getTime() - overdue.run_at.getTime() : null });
}

const CHECKS: Record<Component, (now: Date) => Promise<Evaluation>> = {
  admin_api: checkAdminApi, database: checkDatabase, identity: checkIdentity, event_dispatcher: checkDispatcher,
  products_api: checkProductsApi, products_worker: checkProductsWorker, email: checkEmail, jobs: checkJobs,
};

/** Run one check with the 5 second limit. A check that throws or times out is `unknown`, never a crash. */
export async function runCheck(component: Component, now: Date, timeoutMs = CHECK_TIMEOUT_MS): Promise<Evaluation> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      CHECKS[component](now),
      new Promise<Evaluation>((resolve) => { timer = setTimeout(() => resolve(unknownState(`Check timed out after ${timeoutMs / 1000} s`)), timeoutMs); }),
    ]);
  } catch (err) {
    return unknownState(`Check failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Store one component's result; a change of state adds a HealthEvent. The first result for a component adds none. */
export async function recordCheck(component: string, ev: Evaluation, now: Date): Promise<HealthState | null> {
  const prior = await HealthCheck.findOneAndUpdate(
    { component },
    { $set: { state: ev.state, detail: ev.detail, metrics: ev.metrics, checked_at: now } },
    { upsert: true, returnDocument: 'before' },
  ).lean();
  if (prior && prior.state !== ev.state) {
    await HealthEvent.create({ component, from: prior.state, to: ev.state, detail: ev.detail, at: now });
  }
  return prior?.state ?? null;
}

/** One pass over every component. Returns the evaluations (for tests and the first run). */
export async function runHealthChecks(now: Date = new Date()): Promise<Record<string, Evaluation>> {
  const out: Record<string, Evaluation> = {};
  await Promise.all(COMPONENTS.map(async (c) => {
    const ev = await runCheck(c, now);
    out[c] = ev;
    await recordCheck(c, ev, now);
  }));
  return out;
}

let stop: (() => void) | undefined;

/** Start the minute loop under the `health-checks` lease. Safe to call twice. */
export function startHealthJob(): void {
  if (stop) return;
  stop = every('health-checks', HEALTH_EVERY_MS, async () => { await runHealthChecks(); });
}

export function stopHealthJob(): void {
  stop?.();
  stop = undefined;
}
