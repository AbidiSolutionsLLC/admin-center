// server/src/lib/platformDispatcher.ts — 06 §4: signed nudges after commit, coalesced, with backoff
import crypto from 'crypto';
import os from 'os';
import { PlatformEvent } from '../models/PlatformEvent.model';
import { OrgEventCounter } from '../models/OrgEventCounter.model';
import { PlatformEventSubscription, IPlatformEventSubscription } from '../models/PlatformEventSubscription.model';
import { SubscriptionCursor } from '../models/SubscriptionCursor.model';
import { resolveSafeSubscriber, postPinned } from './ssrfGuard';
import { acquireLease, releaseLease } from './platformLease';

const TIMEOUT_MS = 5000;
const SAFETY_RENUDGE_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const CONCURRENCY = 4;               // (subscription, org) nudges in flight
const LEASE_NAME = 'platform-dispatcher';
const LEASE_TTL_MS = 30_000;
/** Read by the platform health check (lib/health): the lease row's `until` minus the TTL is the last renewal. */
export const DISPATCHER_LEASE_NAME = LEASE_NAME;
export const DISPATCHER_LEASE_TTL_MS = LEASE_TTL_MS;
const HOLDER_ID = `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString('hex')}`;

function sign(secret: string, t: number, body: string): string {
  return crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
}

/** Verify `t=<unix>,v1=<hex>` over `${t}.${body}`. */
export function verifyNudgeSignature(secret: string, header: string, body: string, toleranceSec = 300): boolean {
  const parts: Record<string, string> = {};
  for (const p of (header || '').split(',')) {
    const i = p.indexOf('=');
    if (i > 0) parts[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > toleranceSec) return false;
  const expected = Buffer.from(sign(secret, t, body), 'hex');
  const got = Buffer.from(v1, 'hex');
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

const SECRET_REF_RE = /^PLATFORM_SUB_SECRET_[A-Z0-9_]+$/;

async function seedSubscriptions(): Promise<void> {
  const raw = process.env.PLATFORM_SUBSCRIPTIONS;
  if (!raw) return;
  let list: Array<{ name: string; url: string; secret_env: string }>;
  try { list = JSON.parse(raw); } catch { console.error('[PlatformDispatcher] PLATFORM_SUBSCRIPTIONS is not valid JSON'); return; }
  if (!Array.isArray(list)) return;
  for (const s of list) {
    if (!s?.name || !s?.url || !s?.secret_env) continue;
    if (!SECRET_REF_RE.test(s.secret_env)) { console.error(`[PlatformDispatcher] subscription ${s.name}: secret_env must match ${SECRET_REF_RE}`); continue; }
    await PlatformEventSubscription.updateOne(
      { name: s.name },
      { $set: { url: s.url, secret_ref: s.secret_env }, $setOnInsert: { status: 'active' } },
      { upsert: true },
    );
  }
}

async function nudge(sub: IPlatformEventSubscription, orgId: string, latestSeq: number): Promise<void> {
  if (!SECRET_REF_RE.test(sub.secret_ref)) throw new Error('Subscription secret_ref must match PLATFORM_SUB_SECRET_*');
  const secret = process.env[sub.secret_ref];
  if (!secret) throw new Error(`Secret env var ${sub.secret_ref} is not set`);
  // Resolve once, validate every address, connect only to the validated one (no DNS-rebinding window).
  const target = await resolveSafeSubscriber(sub.url);
  const evt = await PlatformEvent.findOne({ org_id: orgId, seq: latestSeq }).select('id').lean();
  const body = JSON.stringify({ org_id: orgId, latest_seq: latestSeq });
  const t = Math.floor(Date.now() / 1000);
  const status = await postPinned(target, {
    timeoutMs: TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      'X-Karbexa-Signature': `t=${t},v1=${sign(secret, t, body)}`,
      'X-Karbexa-Event-Id': evt?.id ?? '',
    },
    body,
  });
  if (status < 200 || status > 299) throw new Error(`Subscriber responded ${status}`);
}

/** Run fn over items with at most `limit` in flight. */
export async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

export async function dispatchOnce(opts: { renew?: () => Promise<boolean> } = {}): Promise<{ nudged: number; failed: number }> {
  let nudged = 0;
  let failed = 0;
  const subs = await PlatformEventSubscription.find({ status: 'active' });
  if (subs.length === 0) return { nudged, failed };
  const counters = await OrgEventCounter.find({ seq: { $gt: 0 } }).lean();
  const now = Date.now();

  type Work = { sub: IPlatformEventSubscription; counter: (typeof counters)[number]; cur?: { attempts?: number } };
  const work: Work[] = [];
  for (const sub of subs) {
    const cursors = await SubscriptionCursor.find({ subscription_id: sub._id }).lean();
    const byOrg = new Map(cursors.map(c => [String(c.org_id), c]));
    for (const counter of counters) {
      const cur = byOrg.get(String(counter._id));
      const newEvents = counter.seq > (cur?.last_nudged_seq ?? 0);
      const lagging = !newEvents && counter.seq > (cur?.last_acknowledged_seq ?? 0)
        && (!cur?.last_nudged_at || now - cur.last_nudged_at.getTime() >= SAFETY_RENUDGE_MS);
      if (!newEvents && !lagging) continue;
      if (cur?.next_attempt_at && cur.next_attempt_at.getTime() > now) continue;
      work.push({ sub, counter, cur });
    }
  }

  let leaseLost = false;
  // Bounded concurrency: one slow or dead subscriber no longer blocks every other (subscription, org) pair.
  await runPool(work, CONCURRENCY, async ({ sub, counter, cur }) => {
    if (leaseLost) return;
    if (opts.renew && !(await opts.renew())) { leaseLost = true; return; }
    const filter = { subscription_id: sub._id, org_id: counter._id };
    try {
      await nudge(sub, String(counter._id), counter.seq);
      await SubscriptionCursor.updateOne(filter, {
        $max: { last_nudged_seq: counter.seq },
        $set: { last_nudged_at: new Date(), attempts: 0 },
        $unset: { last_error: '', next_attempt_at: '' },
      }, { upsert: true });
      nudged++;
    } catch (err) {
      const attempts = (cur?.attempts ?? 0) + 1;
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempts, 20));
      await SubscriptionCursor.updateOne(filter, {
        $set: {
          last_error: String((err as Error)?.message ?? err).slice(0, 500),
          attempts,
          next_attempt_at: new Date(Date.now() + delay),
        },
      }, { upsert: true });
      failed++;
    }
  });
  return { nudged, failed };
}

/** One dispatcher cycle under the cross-instance lease: only the lease holder sends; others return skipped. */
export async function dispatchCycle(holder: string = HOLDER_ID): Promise<{ nudged: number; failed: number; skipped: boolean }> {
  if (!(await acquireLease(LEASE_NAME, holder, LEASE_TTL_MS))) return { nudged: 0, failed: 0, skipped: true };
  const r = await dispatchOnce({ renew: () => acquireLease(LEASE_NAME, holder, LEASE_TTL_MS) });
  return { ...r, skipped: false };
}

let timer: NodeJS.Timeout | undefined;
let running = false;

export function startPlatformDispatcher(): void {
  if (timer || process.env.PLATFORM_DISPATCHER === 'off') return;
  const interval = Number(process.env.PLATFORM_DISPATCH_INTERVAL_MS) || 2000;
  seedSubscriptions().catch(err => console.error('[PlatformDispatcher] seed failed', err));
  timer = setInterval(() => {
    if (running) return;
    running = true;
    dispatchCycle()
      .catch(err => console.error('[PlatformDispatcher] run failed', err))
      .finally(() => { running = false; });
  }, interval);
  timer.unref();
  console.log('[PlatformDispatcher] started.');
}

export function stopPlatformDispatcher(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
  releaseLease(LEASE_NAME, HOLDER_ID).catch(() => undefined); // let another instance take over immediately
}
