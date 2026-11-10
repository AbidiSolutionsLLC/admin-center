// server/src/lib/platformEvents.ts — 06 §1-3: transactional outbox for platform events
import crypto from 'crypto';
import type { Request } from 'express';
import mongoose, { ClientSession, Types } from 'mongoose';
import { PlatformEvent, IPlatformEvent } from '../models/PlatformEvent.model';
import { OrgEventCounter } from '../models/OrgEventCounter.model';
import { bumpAuthzVer, computeEffectiveAccess } from './effectiveAccess';

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

/** Run fn inside a Mongo transaction. Standalone Mongo is tolerated outside production (no atomicity). */
export async function runInTransaction<T>(fn: (session: ClientSession | undefined) => Promise<T>): Promise<T> {
  if ((await detectTopology()) === 'standalone') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MongoDB transactions require a replica set; standalone topology is not allowed in production.');
    }
    if (!warnedStandalone) {
      warnedStandalone = true;
      console.warn('[platformEvents] Standalone MongoDB detected: running WITHOUT transactions (dev only).');
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

const CHUNK = 20;

/** Bump authz_ver and emit one app_access.changed per member with the full effective product->role map. */
export async function emitAppAccessChanged(
  session: ClientSession | undefined,
  companyId: string | Types.ObjectId,
  memberIds: Array<string | Types.ObjectId>,
  ctx: { actor: PlatformEventInput['actor']; correlation_id?: string },
): Promise<void> {
  const ids = Array.from(new Set(memberIds.map(String)));
  if (ids.length === 0) return;
  await bumpAuthzVer(ids, session);
  for (let i = 0; i < ids.length; i += CHUNK) {
    const accesses = await Promise.all(ids.slice(i, i + CHUNK).map(id => computeEffectiveAccess(companyId, id, { session })));
    // seq allocation is serialized: counter doc is a hot row inside one transaction
    for (const acc of accesses) {
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
  }
}

const reqCorrelation = new WeakMap<object, string>();

export function correlationIdFor(req?: Request): string {
  if (!req) return crypto.randomUUID();
  const hdr = req.headers?.['x-correlation-id'];
  const fromHeader = Array.isArray(hdr) ? hdr[0] : hdr;
  if (fromHeader) return fromHeader;
  let id = reqCorrelation.get(req);
  if (!id) { id = crypto.randomUUID(); reqCorrelation.set(req, id); }
  return id;
}
