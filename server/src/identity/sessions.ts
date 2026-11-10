// server/src/identity/sessions.ts
// Karbexa `Session` lifecycle (03 §1.4, §5.3, §7). `_id` = oidc-provider session uid = `sid` claim.
// `revoked_at` is the revocation source of truth. Revoking also destroys the provider-side SSO
// session, its grants and refresh tokens, so a revoked browser is forced through a fresh login
// instead of being silently re-issued tokens for a dead sid.
import { Types, ClientSession } from 'mongoose';
import { Session, ISession } from '../models/Session.model';
import { User } from '../models/User.model';
import { realmCollection } from './mongoAdapter';
import { runInTransaction, emitPlatformEvent, PlatformEventInput } from '../lib/platformEvents';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from './config';

export class SessionDeniedError extends Error {
  constructor(public reason: string) {
    super(`session denied: ${reason}`);
  }
}

interface EnsureSessionParams {
  sid: string;
  memberId: Types.ObjectId;
  identityId: Types.ObjectId;
  companyId: Types.ObjectId;
  amr: string[];
  ip?: string;
  userAgent?: string;
}

/** Upsert the Session on first token issuance, then refuse revoked/expired sessions and slide idle expiry. */
export async function ensureSessionForToken(p: EnsureSessionParams): Promise<ISession> {
  const now = new Date();
  const insert = {
    identity_id: p.identityId,
    member_id: p.memberId,
    company_id: p.companyId,
    realm: 'tenant',
    created_at: now,
    last_seen_at: now,
    idle_expires_at: new Date(now.getTime() + SESSION_IDLE_MS),
    absolute_expires_at: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
    amr: p.amr,
    ip: p.ip,
    user_agent: p.userAgent,
  };

  let doc: ISession | null;
  try {
    doc = await Session.findOneAndUpdate({ _id: p.sid }, { $setOnInsert: insert }, { upsert: true, returnDocument: 'after' });
  } catch (err: any) {
    if (err?.code !== 11000) throw err; // concurrent first issuance: the other writer won
    doc = await Session.findById(p.sid);
  }
  if (!doc) throw new SessionDeniedError('session_missing');

  if (doc.revoked_at) throw new SessionDeniedError('revoked');
  if (doc.member_id.toString() !== p.memberId.toString()) throw new SessionDeniedError('principal_changed');
  if (doc.absolute_expires_at <= now || doc.idle_expires_at <= now) {
    await revokeSession(p.sid, 'expired');
    throw new SessionDeniedError('expired');
  }

  const idle = new Date(Math.min(now.getTime() + SESSION_IDLE_MS, doc.absolute_expires_at.getTime()));
  await Session.updateOne({ _id: p.sid, revoked_at: { $exists: false } }, { $set: { last_seen_at: now, idle_expires_at: idle } });
  return doc;
}

/** Session usable for an Admin API call (contract: exists, not revoked, absolute expiry in the future). */
export async function findLiveSession(sid: string): Promise<ISession | null> {
  const doc = await Session.findById(sid);
  if (!doc || doc.revoked_at || doc.absolute_expires_at <= new Date()) return null;
  return doc;
}

/** Delete the provider SSO session (by uid), every grant it authorized and their tokens. */
export async function destroyProviderSession(sid: string): Promise<void> {
  const sessions = realmCollection('tenant', 'Session');
  const docs = await sessions.find({ 'payload.uid': sid }).toArray();
  const grantIds = new Set<string>();
  for (const d of docs) {
    for (const a of Object.values((d.payload.authorizations || {}) as Record<string, { grantId?: string }>)) {
      if (a?.grantId) grantIds.add(a.grantId);
    }
  }
  for (const grantId of grantIds) {
    await realmCollection('tenant', 'Grant').deleteOne({ _id: grantId });
    for (const m of ['AuthorizationCode', 'RefreshToken', 'AccessToken']) {
      await realmCollection('tenant', m).deleteMany({ 'payload.grantId': grantId });
    }
  }
  await realmCollection('tenant', 'RefreshToken').deleteMany({ 'payload.sessionUid': sid });
  await realmCollection('tenant', 'AuthorizationCode').deleteMany({ 'payload.sessionUid': sid });
  await sessions.deleteMany({ 'payload.uid': sid });
}

type EventCtx = { actor: PlatformEventInput['actor']; correlation_id?: string };
const SYSTEM_CTX: EventCtx = { actor: { type: 'system' } };

/**
 * Transactional half of revocation: mark every live Session matching `filter` revoked and emit
 * `session.revoked` per sid (06 §2) in the caller's session. Provider-side teardown (not
 * transactional) must follow commit via destroyProviderSession. Returns the revoked sids.
 */
export async function revokeSessionsTx(
  session: ClientSession | undefined,
  filter: Record<string, unknown>,
  reason: string,
  ctx: EventCtx,
  opts: { emitEvents?: boolean } = {},
): Promise<string[]> {
  const live = await Session.find({ ...filter, revoked_at: { $exists: false } }, null, { session });
  if (live.length === 0) return [];
  const now = new Date();
  await Session.updateMany(
    { _id: { $in: live.map((l) => l._id) }, revoked_at: { $exists: false } },
    { $set: { revoked_at: now, revoked_reason: reason } },
    { session },
  );
  if (opts.emitEvents !== false) {
    for (const l of live) {
      await emitPlatformEvent(session, {
        org_id: l.company_id,
        type: 'session.revoked',
        subject: { type: 'member', id: l.member_id.toString() },
        actor: ctx.actor,
        correlation_id: ctx.correlation_id,
        data: { sid: l._id, member_id: l.member_id.toString() },
      });
    }
  }
  return live.map((l) => l._id);
}

/** Revoke one session (idempotent: first revocation reason wins) and tear down provider state. */
export async function revokeSession(sid: string, reason: string, ctx: EventCtx = SYSTEM_CTX): Promise<void> {
  await runInTransaction((session) => revokeSessionsTx(session, { _id: sid }, reason, ctx));
  await destroyProviderSession(sid);
}

/** Revoke every live session of an identity (password reset, identity disabled). Returns the count. */
export async function revokeIdentitySessions(identityId: Types.ObjectId | string, reason: string, ctx: EventCtx = SYSTEM_CTX): Promise<number> {
  const live = await Session.find({ identity_id: identityId, revoked_at: { $exists: false } }).select('_id');
  for (const s of live) await revokeSession(s._id, reason, ctx);
  // Provider sessions that never reached token issuance have no Session row yet.
  const memberIds = (await User.find({ identity_id: identityId }).select('_id')).map((u) => u._id.toString());
  if (memberIds.length) {
    const orphans = await realmCollection('tenant', 'Session').find({ 'payload.accountId': { $in: memberIds } }).toArray();
    for (const o of orphans) if (o.payload.uid) await destroyProviderSession(String(o.payload.uid));
  }
  return live.length;
}
