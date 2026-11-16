// server/src/lib/health/evaluate.ts
// Pure rules that turn measurements into a state (DRD 7.1). No I/O here: the collectors in ./collect.ts measure, these
// decide, so every threshold is testable with plain numbers. `unknown` means the check itself could not be made.
import type { HealthState } from '../../models/Health.model';

export interface Evaluation { state: HealthState; detail: string; metrics?: Record<string, unknown> }

const MIN = 60_000;
const ok = (detail: string, metrics?: Record<string, unknown>): Evaluation => ({ state: 'healthy', detail, metrics });
const degraded = (detail: string, metrics?: Record<string, unknown>): Evaluation => ({ state: 'degraded', detail, metrics });
const critical = (detail: string, metrics?: Record<string, unknown>): Evaluation => ({ state: 'critical', detail, metrics });
export const unknownState = (detail: string): Evaluation => ({ state: 'unknown', detail });

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** admin_api: 5xx rate and p95 latency over the last five minutes of route counters. No traffic reads as healthy. */
export function evalAdminApi(m: { count: number; errors5xx: number; p95Ms: number | null }): Evaluation {
  const rate = m.count > 0 ? m.errors5xx / m.count : 0;
  const metrics = { requests: m.count, errors_5xx: m.errors5xx, error_rate: Number(rate.toFixed(4)), p95_ms: m.p95Ms };
  if (rate > 0.05) return critical(`${pct(rate)} of requests failed with 5xx over 5 minutes`, metrics);
  if (rate > 0.01) return degraded(`${pct(rate)} of requests failed with 5xx over 5 minutes`, metrics);
  if (m.p95Ms !== null && m.p95Ms > 1000) return degraded(`p95 latency ${m.p95Ms} ms over 5 minutes`, metrics);
  return ok(m.count ? `${m.count} requests in 5 minutes, ${pct(rate)} 5xx` : 'No traffic in the last 5 minutes', metrics);
}

/** database: ping time and whether a writable primary answered. */
export function evalDatabase(m: { pingMs: number | null; writable: boolean }): Evaluation {
  if (m.pingMs === null) return critical('Database did not answer a ping', { ping_ms: null });
  if (!m.writable) return critical('No writable primary', { ping_ms: m.pingMs });
  if (m.pingMs > 200) return degraded(`Ping took ${m.pingMs} ms`, { ping_ms: m.pingMs });
  return ok(`Ping ${m.pingMs} ms`, { ping_ms: m.pingMs });
}

/**
 * identity: usable signing keys for every realm, and (only when IDENTITY_KEY_ROTATE_BY is set) the rotation deadline.
 * `rotateBy` null = no deadline configured: the check says so instead of inventing one.
 */
export function evalIdentity(m: { realmsWithKeys: number; realms: number; rotateBy: Date | null }, now: Date): Evaluation {
  const metrics = { realms_with_keys: m.realmsWithKeys, realms: m.realms, rotate_by: m.rotateBy ? m.rotateBy.toISOString() : null };
  if (m.realmsWithKeys === 0) return critical('No usable signing key in any realm', metrics);
  if (m.realmsWithKeys < m.realms) return degraded(`${m.realms - m.realmsWithKeys} realm(s) have no signing key`, metrics);
  if (m.rotateBy) {
    const days = Math.ceil((m.rotateBy.getTime() - now.getTime()) / (24 * 60 * MIN));
    if (days <= 7) return degraded(days <= 0 ? 'Signing key rotation deadline has passed' : `Signing keys due for rotation in ${days} day(s)`, metrics);
    return ok(`Signing keys present; rotation due in ${days} days`, metrics);
  }
  return ok('Signing keys present (no rotation deadline configured)', metrics);
}

/** event_dispatcher: age of the dispatcher lease (time since its last renewal) and orgs with unacknowledged events. */
export function evalDispatcher(m: { leaseAgeMs: number | null; intervalMs: number; backlogOrgs: number }): Evaluation {
  const metrics = { lease_age_ms: m.leaseAgeMs, backlog_orgs: m.backlogOrgs };
  if (m.leaseAgeMs === null) return degraded('The dispatcher has not taken its lease yet', metrics);
  if (m.leaseAgeMs > 5 * MIN) return critical(`Dispatcher lease last renewed ${Math.round(m.leaseAgeMs / 1000)} s ago`, metrics);
  // Two intervals per DRD, but never tighter than 10 s so one slow cycle does not flap the state.
  if (m.leaseAgeMs > Math.max(2 * m.intervalMs, 10_000)) return degraded(`Dispatcher lease last renewed ${Math.round(m.leaseAgeMs / 1000)} s ago`, metrics);
  if (m.backlogOrgs > 50) return degraded(`${m.backlogOrgs} organizations have events not yet acknowledged`, metrics);
  return ok(`${m.backlogOrgs} organization(s) with unacknowledged events`, metrics);
}

/** products_api: whether the products internal health route answered, and how fast. `null` = not configured here. */
export function evalProductsApi(m: { answered: boolean; ms: number; status: number | null; error?: string } | null): Evaluation {
  if (m === null) return unknownState('Products backend URL or service key is not configured');
  if (!m.answered) return critical(m.error ? `No answer: ${m.error}` : 'No answer', { ms: m.ms });
  if (m.status !== null && m.status >= 400) return degraded(`Health route answered ${m.status}`, { ms: m.ms, status: m.status });
  if (m.ms > 2000) return degraded(`Answered in ${m.ms} ms`, { ms: m.ms });
  return ok(`Answered in ${m.ms} ms`, { ms: m.ms });
}

/** products_worker: from the products health `summary` block. `null` = the products API gave no summary. */
export function evalProductsWorker(m: { leaseAgeMs: number | null; maxLag: number; parkedTotal: number } | null): Evaluation {
  if (m === null) return unknownState('No worker summary from the products backend');
  const metrics = { lease_age_ms: m.leaseAgeMs, max_lag: m.maxLag, parked_total: m.parkedTotal };
  if (m.leaseAgeMs === null) return critical('The products worker has never held its lease', metrics);
  if (m.leaseAgeMs > 5 * MIN) return critical(`Worker lease last renewed ${Math.round(m.leaseAgeMs / 1000)} s ago`, metrics);
  if (m.maxLag > 100) return degraded(`Largest event lag is ${m.maxLag}`, metrics);
  if (m.parkedTotal > 0) return degraded(`${m.parkedTotal} event(s) parked`, metrics);
  return ok(`Largest lag ${m.maxLag}, nothing parked`, metrics);
}

/** email: failure share of finished deliveries in the last hour, and the age of the oldest queued message. */
export function evalEmail(m: { sent: number; failed: number; oldestQueuedAgeMs: number | null }): Evaluation {
  const done = m.sent + m.failed;
  const rate = done > 0 ? m.failed / done : 0;
  const age = m.oldestQueuedAgeMs;
  const metrics = { sent: m.sent, failed: m.failed, failure_rate: Number(rate.toFixed(4)), oldest_queued_age_ms: age };
  if (rate > 0.25) return critical(`${pct(rate)} of e-mails failed in the last hour`, metrics);
  if (age !== null && age > 60 * MIN) return critical(`Oldest queued e-mail is ${Math.round(age / MIN)} min old`, metrics);
  if (rate > 0.05) return degraded(`${pct(rate)} of e-mails failed in the last hour`, metrics);
  if (age !== null && age > 10 * MIN) return degraded(`Oldest queued e-mail is ${Math.round(age / MIN)} min old`, metrics);
  return ok(done ? `${m.sent} sent, ${m.failed} failed in the last hour` : 'No e-mail in the last hour', metrics);
}

/** jobs: failed jobs in the last hour and the age of the oldest overdue queued job. */
export function evalJobs(m: { failedLastHour: number; overdueAgeMs: number | null }): Evaluation {
  const metrics = { failed_last_hour: m.failedLastHour, overdue_age_ms: m.overdueAgeMs };
  if (m.overdueAgeMs !== null && m.overdueAgeMs > 15 * MIN) return critical(`A job has been waiting ${Math.round(m.overdueAgeMs / MIN)} min past its run time`, metrics);
  if (m.failedLastHour > 0) return degraded(`${m.failedLastHour} job(s) failed in the last hour`, metrics);
  return ok('No failed or overdue jobs', metrics);
}

const RANK: Record<HealthState, number> = { healthy: 0, unknown: 1, degraded: 1, critical: 2 };

/** Worst state wins; `unknown` counts as degraded (DRD 7.1). Nothing to judge = unknown. */
export function overallState(states: HealthState[]): HealthState {
  if (states.length === 0) return 'unknown';
  const worst = states.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
  return worst === 'unknown' ? 'degraded' : worst;
}
