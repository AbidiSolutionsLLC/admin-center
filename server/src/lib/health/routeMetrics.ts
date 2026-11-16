// server/src/lib/health/routeMetrics.ts
// Route counters (DRD 7.3, Plan 4.9): a small middleware counts requests, 5xx and a latency histogram (fixed buckets) per
// route group in memory; once a minute each instance writes one `RouteMetric` document for the minute. The health job
// aggregates the last five minutes. Nothing here stores a path, a query, a header or a user: only counts.
import os from 'os';
import type { Request, Response, NextFunction } from 'express';
import { RouteMetric } from '../../models/Health.model';

/** Upper bounds in ms; a final slot holds everything slower than the last bound. */
export const BUCKETS_MS = [50, 100, 250, 500, 1000, 2500, 5000];
const INSTANCE = `${os.hostname()}:${process.pid}`;
const MINUTE = 60_000;

export const bucketIndex = (ms: number): number => {
  const i = BUCKETS_MS.findIndex((b) => ms <= b);
  return i === -1 ? BUCKETS_MS.length : i;
};

/** Upper bound of the bucket holding the p-th percentile, or null with no data. The overflow slot reports the last bound x 2. */
export function percentileFromBuckets(buckets: number[], p = 0.95): number | null {
  const total = buckets.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const target = Math.ceil(total * p);
  let seen = 0;
  for (let i = 0; i < buckets.length; i++) {
    seen += buckets[i];
    if (seen >= target) return i < BUCKETS_MS.length ? BUCKETS_MS[i] : BUCKETS_MS[BUCKETS_MS.length - 1] * 2;
  }
  return null;
}

/** A short label for the part of the API a request belongs to (never the full path). */
export function routeGroup(path: string): string {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  if (parts[0] === 'api') return parts[2] ?? 'api';
  if (parts[0] === 'operator') return 'operator';
  if (parts[0] === 'platform') return 'platform';
  if (parts[0] === 'realms') return parts[1] ? `realms/${parts[1]}` : 'realms';
  return 'other';
}

interface Pending { count: number; errors: number; buckets: number[]; groups: Map<string, { count: number; errors: number }> }
const pending = new Map<number, Pending>(); // minute start (ms) -> counts not yet written

const slot = (minuteStart: number): Pending => {
  let p = pending.get(minuteStart);
  if (!p) { p = { count: 0, errors: 0, buckets: new Array(BUCKETS_MS.length + 1).fill(0), groups: new Map() }; pending.set(minuteStart, p); }
  return p;
};

export function record(path: string, status: number, ms: number, at: number = Date.now()): void {
  const p = slot(Math.floor(at / MINUTE) * MINUTE);
  const err = status >= 500 ? 1 : 0;
  p.count++; p.errors += err; p.buckets[bucketIndex(ms)]++;
  const g = routeGroup(path);
  const cur = p.groups.get(g) ?? { count: 0, errors: 0 };
  cur.count++; cur.errors += err;
  p.groups.set(g, cur);
}

/** Express middleware: times the request and records it when the response finishes. */
export function routeMetrics(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on('finish', () => record(req.originalUrl || req.url, res.statusCode, Number(process.hrtime.bigint() - start) / 1e6));
  next();
}

/** Write what has been counted (every minute, and on shutdown). Errors are logged, never thrown. */
export async function flushRouteMetrics(): Promise<void> {
  const minutes = [...pending.keys()];
  for (const minute of minutes) {
    const p = pending.get(minute)!;
    pending.delete(minute);
    try {
      // Another flush for the same minute (the current one, flushed early) adds to the same document.
      const doc = await RouteMetric.findOneAndUpdate(
        { instance: INSTANCE, minute: new Date(minute) },
        { $inc: { count: p.count, errors_5xx: p.errors } },
        { upsert: true, returnDocument: 'after' },
      );
      const buckets = [...(doc!.buckets.length ? doc!.buckets : new Array(BUCKETS_MS.length + 1).fill(0))];
      p.buckets.forEach((n, i) => { buckets[i] = (buckets[i] ?? 0) + n; });
      const groups = new Map(doc!.groups.map((g) => [g.group, { count: g.count, errors_5xx: g.errors_5xx }]));
      for (const [group, v] of p.groups) {
        const cur = groups.get(group) ?? { count: 0, errors_5xx: 0 };
        groups.set(group, { count: cur.count + v.count, errors_5xx: cur.errors_5xx + v.errors });
      }
      await RouteMetric.updateOne({ _id: doc!._id }, { $set: { buckets, groups: [...groups].map(([group, v]) => ({ group, ...v })) } });
    } catch (err) {
      console.error('[route-metrics] flush failed', err);
    }
  }
}

/** Totals and p95 over the last `windowMs` (all instances), from the stored documents. */
export async function recentRouteStats(windowMs = 5 * MINUTE, now: number = Date.now()): Promise<{ count: number; errors5xx: number; p95Ms: number | null }> {
  const rows = await RouteMetric.find({ minute: { $gte: new Date(now - windowMs) } }).lean();
  const buckets = new Array(BUCKETS_MS.length + 1).fill(0);
  let count = 0, errors5xx = 0;
  for (const r of rows) {
    count += r.count; errors5xx += r.errors_5xx;
    (r.buckets ?? []).forEach((n, i) => { buckets[i] += n; });
  }
  return { count, errors5xx, p95Ms: percentileFromBuckets(buckets) };
}

let timer: NodeJS.Timeout | undefined;

export function startRouteMetricsFlush(): void {
  if (timer) return;
  timer = setInterval(() => { void flushRouteMetrics(); }, MINUTE);
  timer.unref();
}

export async function stopRouteMetricsFlush(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = undefined;
  await flushRouteMetrics();
}

/** Test hook: drop everything counted but not yet written. */
export function resetRouteMetrics(): void { pending.clear(); }
