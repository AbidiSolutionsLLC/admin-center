// server/src/operator/sessions.ts
// Operator session lifecycle (Plan 0.4). Copy of identity/sessions.ts `ensureSessionForToken`, for the
// OperatorSession model. Idle window: OPERATOR_SESSION_IDLE_S (30 min, decision C-1).
import { Types } from 'mongoose';
import { OperatorSession, IOperatorSession } from '../models/OperatorSession.model';
import { OPERATOR_SESSION_IDLE_S } from '../identity/config';

export class OperatorSessionDeniedError extends Error {
  constructor(public reason: string) {
    super(`operator session denied: ${reason}`);
  }
}

const IDLE_MS = OPERATOR_SESSION_IDLE_S * 1000;

// requireOperator reads revocation on every call: one indexed read, cached 15 s per sid.
const CACHE_MS = 15_000;
const revokedCache = new Map<string, { revoked: boolean; at: number }>();

/** Idempotent: the first revocation reason wins. */
export async function revokeOperatorSession(sid: string, reason: string): Promise<void> {
  await OperatorSession.updateOne({ _id: sid, revoked_at: { $exists: false } }, { $set: { revoked_at: new Date(), revoked_reason: reason } });
  revokedCache.delete(sid);
}

/** Revoke every open session of one operator (password change, MFA reset, suspension: plan 04 C7). Returns the count. */
export async function revokeAllOperatorSessions(operatorId: Types.ObjectId | string, reason: string): Promise<number> {
  const operator_id = typeof operatorId === 'string' ? new Types.ObjectId(operatorId) : operatorId;
  // `as never`: the model types operator_id as Schema.Types.ObjectId (same cast as operator/security.ts).
  const ids = (await OperatorSession.distinct('_id', { operator_id, revoked_at: { $exists: false } } as never)).map(String);
  if (!ids.length) return 0;
  await OperatorSession.updateMany({ _id: { $in: ids }, revoked_at: { $exists: false } }, { $set: { revoked_at: new Date(), revoked_reason: reason } });
  for (const id of ids) revokedCache.delete(id);
  return ids.length;
}

/** Upsert the OperatorSession on token issuance, refuse revoked/idle-expired ones, slide the idle expiry. */
export async function ensureOperatorSessionForToken(p: { sid: string; operatorId: Types.ObjectId | string; ip?: string; userAgent?: string }): Promise<IOperatorSession> {
  const now = new Date();
  const insert = {
    operator_id: p.operatorId,
    created_at: now,
    last_seen_at: now,
    idle_expires_at: new Date(now.getTime() + IDLE_MS),
    ip: p.ip,
    user_agent: p.userAgent,
  };
  let doc: IOperatorSession | null;
  try {
    doc = await OperatorSession.findOneAndUpdate({ _id: p.sid }, { $setOnInsert: insert }, { upsert: true, returnDocument: 'after' });
  } catch (err: any) {
    if (err?.code !== 11000) throw err; // concurrent first issuance: the other writer won
    doc = await OperatorSession.findById(p.sid);
  }
  if (!doc) throw new OperatorSessionDeniedError('session_missing');
  if (doc.revoked_at) throw new OperatorSessionDeniedError('revoked');
  if (String(doc.operator_id) !== String(p.operatorId)) throw new OperatorSessionDeniedError('principal_changed');
  if (doc.idle_expires_at <= now) {
    await revokeOperatorSession(p.sid, 'expired');
    throw new OperatorSessionDeniedError('expired');
  }
  await OperatorSession.updateOne(
    { _id: p.sid, revoked_at: { $exists: false } },
    { $set: { last_seen_at: now, idle_expires_at: new Date(now.getTime() + IDLE_MS) } },
  );
  return doc;
}

/** True when the sid has a revoked OperatorSession. A missing row (token issued before Plan 0.4) is not revoked. */
export async function isOperatorSessionRevoked(sid: string): Promise<boolean> {
  const hit = revokedCache.get(sid);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.revoked;
  const row = await OperatorSession.findById(sid).select('revoked_at').lean();
  const revoked = !!row?.revoked_at;
  if (revokedCache.size > 5000) revokedCache.clear();
  revokedCache.set(sid, { revoked, at: Date.now() });
  return revoked;
}

/** Test hook: drop cached revocation state. */
export function clearOperatorSessionCache(): void {
  revokedCache.clear();
}
