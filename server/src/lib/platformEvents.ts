// server/src/lib/platformEvents.ts — 06 §1-3: transactional outbox for platform events
import crypto from 'crypto';
import type { Request } from 'express';
import mongoose, { ClientSession, Types } from 'mongoose';
import { PlatformEvent, IPlatformEvent } from '../models/PlatformEvent.model';
import { User } from '../models/User.model';
import { OrgEventCounter } from '../models/OrgEventCounter.model';
import { bumpAuthzVer, computeEffectiveAccess } from './effectiveAccess';
import { scheduleSeatRecompute } from './seats';

type TxMode = 'transactional' | 'standalone';
let txMode: TxMode | undefined;
let warnedStandalone = false;

async function detectTopology(): Promise<TxMode> {
  if (txMode) return txMode;
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  txMode = hello.setName || hello.msg === 'isdbgrid' ? 'transactional' : 'standalone';
  return txMode;
}

const commitHooks = new WeakMap<ClientSession, Array<() => unknown>>();

/** Queue fn to run after the session's transaction commits (never on abort). No session: run now. Errors are swallowed and logged. */
export function onCommit(session: ClientSession | undefined, fn: () => unknown): void {
  const queue = session ? commitHooks.get(session) : undefined;
  if (queue) { queue.push(fn); return; }
  void (async () => { try { await fn(); } catch (err) { console.error('[onCommit] hook failed:', err); } })();
}

/**
 * Run fn inside a Mongo transaction. A standalone MongoDB (no atomicity) is refused unless ALLOW_STANDALONE_MONGO=true
 * AND NODE_ENV is not production (E4 review L6): silently losing atomicity must be an explicit local-dev choice.
 */
export async function runInTransaction<T>(fn: (session: ClientSession | undefined) => Promise<T>): Promise<T> {
  if ((await detectTopology()) === 'standalone') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MongoDB transactions require a replica set; standalone topology is not allowed in production.');
    }
    if (process.env.ALLOW_STANDALONE_MONGO !== 'true') {
      throw new Error('MongoDB transactions require a replica set (see .env.example). For local development only, set ALLOW_STANDALONE_MONGO=true to run without transactions.');
    }
    if (!warnedStandalone) {
      warnedStandalone = true;
      console.warn('[platformEvents] ALLOW_STANDALONE_MONGO=true: running WITHOUT transactions (local development only).');
    }
    return fn(undefined);
  }
  let hooks: Array<() => unknown> = [];
  const result = await mongoose.connection.transaction((session) => {
    hooks = []; // a retried attempt starts with a clean queue
    commitHooks.set(session, hooks);
    return fn(session);
  });
  for (const h of hooks) { try { await h(); } catch (err) { console.error('[onCommit] hook failed:', err); } }
  return result;
}

export interface PlatformEventInput {
  org_id: string | Types.ObjectId;
  type: string;
  subject: { type: string; id: string };
  actor: { type: 'member' | 'operator' | 'system'; id?: string };
  correlation_id?: string;
  data?: object;
}

/** Allocate the next per-org seq and append the event (06 §1). Must run in the caller's session. */
export async function emitPlatformEvent(session: ClientSession | undefined, e: PlatformEventInput): Promise<IPlatformEvent> {
  const orgId = new Types.ObjectId(String(e.org_id));
  const counter = await OrgEventCounter.findOneAndUpdate(
    { _id: orgId },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, session },
  );
  const [evt] = await PlatformEvent.create([{
    org_id: orgId,
    seq: counter!.seq,
    type: e.type,
    subject: e.subject,
    actor: e.actor,
    correlation_id: e.correlation_id,
    data: e.data ?? {},
  }], { session });
  return evt;
}

/**
 * Emit one app_access.changed per member with the full effective product->role map. Bumps authz_ver first
 * unless `bump:false` (caller already bumped, e.g. an org-level updateMany). Effective access is computed
 * sequentially: a transaction session must not run concurrent operations.
 */
export async function emitAppAccessChanged(
  session: ClientSession | undefined,
  companyId: string | Types.ObjectId,
  memberIds: Array<string | Types.ObjectId>,
  ctx: { actor: PlatformEventInput['actor']; correlation_id?: string; bump?: boolean },
): Promise<void> {
  const ids = Array.from(new Set(memberIds.map(String)));
  if (ids.length === 0) return;
  if (ctx.bump !== false) await bumpAuthzVer(ids, session);
  for (const id of ids) {
    const acc = await computeEffectiveAccess(companyId, id, { session });
    const products: Record<string, string> = {};
    for (const [pk, v] of Object.entries(acc.products)) products[pk] = v.role;
    await emitPlatformEvent(session, {
      org_id: companyId,
      type: 'app_access.changed',
      subject: { type: 'member', id: acc.member_id },
      actor: ctx.actor,
      correlation_id: ctx.correlation_id,
      data: { authz_ver: acc.authz_ver, products },
    });
  }
  onCommit(session, () => scheduleSeatRecompute(companyId)); // Plan 4.7: seat counts follow access changes
}

/** Above this many affected members an app_access.changed fan-out leaves the originating transaction. */
export const APP_ACCESS_INLINE_LIMIT = 200;

/**
 * Like emitAppAccessChanged, but bounded: up to APP_ACCESS_INLINE_LIMIT members are emitted inside the caller's
 * transaction; for more, authz_ver is bumped inside it (one updateMany) and the per-member events are fanned out
 * in batched transactions after commit (same pattern as org-level changes). Errors in the post-commit part are logged.
 */
export async function emitAppAccessChangedBounded(
  session: ClientSession | undefined,
  companyId: string | Types.ObjectId,
  memberIds: Array<string | Types.ObjectId>,
  ctx: { actor: PlatformEventInput['actor']; correlation_id?: string; limit?: number; batchSize?: number },
): Promise<void> {
  const ids = Array.from(new Set(memberIds.map(String)));
  if (ids.length === 0) return;
  if (ids.length <= (ctx.limit ?? APP_ACCESS_INLINE_LIMIT)) {
    await emitAppAccessChanged(session, companyId, ids, { actor: ctx.actor, correlation_id: ctx.correlation_id });
    return;
  }
  await bumpAuthzVer(ids, session);
  const batchSize = ctx.batchSize ?? APP_ACCESS_INLINE_LIMIT;
  onCommit(session, async () => {
    for (let i = 0; i < ids.length; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize);
      try {
        await runInTransaction((s) => emitAppAccessChanged(s, companyId, chunk, { actor: ctx.actor, correlation_id: ctx.correlation_id, bump: false }));
      } catch (err) {
        console.error('[emitAppAccessChangedBounded] batch failed', String(companyId), err);
      }
    }
  });
}

/**
 * After an org-level change committed (members' authz_ver already bumped in that txn), fan out per-member
 * app_access.changed in batches, each in its own transaction, without bumping again. Errors are logged, never thrown.
 * Keyset-paginated by _id, so a failed batch is skipped (logged) and the remainder still proceeds.
 */
export async function fanOutAppAccessChanged(
  companyId: string | Types.ObjectId,
  ctx: { actor: PlatformEventInput['actor']; correlation_id?: string; batchSize?: number; bump?: boolean },
): Promise<void> {
  const batchSize = ctx.batchSize ?? 200;
  let after: Types.ObjectId | undefined;
  try {
    for (;;) {
      const rows = await User.find({ company_id: companyId, ...(after ? { _id: { $gt: after } } : {}) })
        .sort({ _id: 1 }).limit(batchSize).select('_id').lean();
      if (rows.length === 0) break;
      const ids = rows.map((r) => r._id as Types.ObjectId);
      after = ids[ids.length - 1];
      try {
        await runInTransaction((session) => emitAppAccessChanged(session, companyId, ids, { actor: ctx.actor, correlation_id: ctx.correlation_id, bump: ctx.bump ?? false }));
      } catch (err) {
        console.error('[fanOutAppAccessChanged] batch failed', String(companyId), err);
      }
      if (rows.length < batchSize) break;
    }
  } catch (err) {
    console.error('[fanOutAppAccessChanged] failed', String(companyId), err);
  }
}

const reqCorrelation = new WeakMap<object, string>();

export function correlationIdFor(req?: Request): string {
  if (!req) return crypto.randomUUID();
  const hdr = req.headers?.['x-correlation-id'];
  const fromHeader = Array.isArray(hdr) ? hdr[0] : hdr;
  if (typeof fromHeader === 'string' && /^[\w.-]{1,100}$/.test(fromHeader)) return fromHeader;
  let id = reqCorrelation.get(req);
  if (!id) { id = crypto.randomUUID(); reqCorrelation.set(req, id); }
  return id;
}
