// server/src/lib/backchannelLogout.ts — OpenID Connect Back-Channel Logout 1.0 for standalone portals (DRD §8.6).
// When a Karbexa session ends (sign-out, revocation, suspension, termination, tenant suspension) or a member loses access to
// a portal, every standalone client that holds a session for that `sid` gets a signed logout token at its
// `backchannel_logout_uri`. One `Job` per client; the shared runner (lib/jobs.ts) retries, and failures stay in the Job
// table where Platform Health counts them (lib/health, component `standalone_portals`).
import crypto from 'crypto';
import * as jose from 'jose';
import { Types } from 'mongoose';
import { App } from '../models/App.model';
import { Job } from '../models/Job.model';
import { Session } from '../models/Session.model';
import { getIdentityConfig } from '../identity/config';
import { loadRealmKeys } from '../identity/keys';
import { realmCollection } from '../identity/mongoAdapter';
import { enqueue, registerJobHandler, type JobHandler } from './jobs';
import { resolveSafeSubscriber, postPinned } from './ssrfGuard';
import { keyFromClientId, systemProduct } from './standalonePortals';

export const BACKCHANNEL_JOB = 'standalone.backchannel_logout';
export const LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';
const DELIVERY_TIMEOUT_MS = 5_000;
/** A second request for the same (sid, client) within this window is the same logout. */
const DEDUPE_MS = 10 * 60 * 1000;

export interface LogoutJobPayload {
  sid: string;
  sub: string;
  product_key: string;
  client_id: string;
  company_id?: string;
  reason: string;
}

/** Claims of a Logout Token (BCL 1.0 §2.4): no `nonce`, `events` names the logout event, `sub` and `sid` identify who. */
export function logoutTokenClaims(p: { issuer: string; clientId: string; sub: string; sid: string; jti?: string }) {
  return {
    iss: p.issuer, aud: p.clientId, sub: p.sub, sid: p.sid, jti: p.jti ?? crypto.randomUUID(),
    events: { [LOGOUT_EVENT]: {} },
  };
}

/** Signed with the tenant realm's current key; `typ: logout+jwt` so it cannot be mistaken for an ID token. */
export async function signLogoutToken(p: { clientId: string; sub: string; sid: string }): Promise<string> {
  const { privateJwks } = await loadRealmKeys('tenant');
  const jwk = privateJwks.keys[0];
  const key = await jose.importJWK(jwk, 'RS256');
  const c = logoutTokenClaims({ issuer: getIdentityConfig().tenantIssuer, clientId: p.clientId, sub: p.sub, sid: p.sid });
  return new jose.SignJWT({ sub: c.sub, sid: c.sid, events: c.events })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid, typ: 'logout+jwt' })
    .setIssuer(c.iss).setAudience(c.aud).setJti(c.jti).setIssuedAt().setExpirationTime('2m')
    .sign(key);
}

/**
 * Queue a logout for every standalone client with a back-channel URI that holds a session for `sid`.
 * `clientIds` is the set of clients known to hold one (the end-session handler passes it because the provider session is
 * already gone by then); without it, the provider's stored session is read, so call this BEFORE the session is destroyed.
 * `productKey` narrows it to one portal (access removed for that product only). Never throws: a failed enqueue must not stop
 * a revocation. Returns the number of jobs queued.
 */
export async function queueBackchannelLogouts(p: { sid: string; reason: string; clientIds?: string[]; productKey?: string }): Promise<number> {
  try {
    let clientIds = p.clientIds;
    if (!clientIds) {
      const docs = await realmCollection('tenant', 'Session').find({ 'payload.uid': p.sid }).toArray();
      clientIds = [...new Set(docs.flatMap((d) => Object.keys((d.payload.authorizations ?? {}) as Record<string, unknown>)))];
    }
    const keys = [...new Set(clientIds.map(keyFromClientId).filter((k): k is string => !!k && (!p.productKey || k === p.productKey)))];
    if (!keys.length) return 0;
    const apps: any[] = await App.find({ app_type: 'karbexa_product', company_id: { $exists: false }, product_key: { $in: keys }, hosting_mode: 'standalone', 'hosting.client.backchannel_logout_uri': { $exists: true, $ne: null } })
      .select('product_key').lean();
    if (!apps.length) return 0;
    const session: any = await Session.findById(p.sid).select('member_id company_id').lean();
    if (!session) return 0;
    let queued = 0;
    for (const a of apps) {
      const clientId = `karbexa-${a.product_key}`;
      const dup = await Job.exists({
        type: BACKCHANNEL_JOB, 'payload.sid': p.sid, 'payload.client_id': clientId, created_at: { $gt: new Date(Date.now() - DEDUPE_MS) },
      });
      if (dup) continue;
      const payload: LogoutJobPayload = {
        sid: p.sid, sub: String(session.member_id), product_key: a.product_key, client_id: clientId, company_id: String(session.company_id), reason: p.reason,
      };
      await enqueue(BACKCHANNEL_JOB, payload as unknown as Record<string, unknown>);
      queued++;
    }
    return queued;
  } catch (err) {
    console.error('[backchannel] could not queue logout', p.sid, err);
    return 0;
  }
}

/**
 * Access to one portal ended for these members (assignment removed, entitlement suspended): log them out of that portal
 * only. Looks up their live Karbexa sessions. Callers: any code path that removes product access (see PROGRESS-WS-C.md).
 */
export async function queueProductBackchannelLogouts(companyId: Types.ObjectId | string, productKey: string, memberIds: Array<Types.ObjectId | string> | undefined, reason: string): Promise<number> {
  const sessions: any[] = await Session.find({
    company_id: companyId, revoked_at: { $exists: false }, ...(memberIds ? { member_id: { $in: memberIds } } : {}),
  }).select('_id').lean();
  let n = 0;
  for (const s of sessions) n += await queueBackchannelLogouts({ sid: String(s._id), reason, clientIds: [`karbexa-${productKey}`], productKey });
  return n;
}

/** Job handler: deliver one logout token. Throws on any non-2xx so the runner retries. Skips quietly if the portal changed. */
export const deliverLogoutJob: JobHandler = async (payload) => {
  const p = payload as unknown as LogoutJobPayload;
  const app: any = await App.findOne({ ...systemProduct(p.product_key), hosting_mode: 'standalone' }).select('hosting.client.backchannel_logout_uri').lean();
  const uri: string | undefined = app?.hosting?.client?.backchannel_logout_uri;
  if (!uri) return; // unregistered or the endpoint was removed since: nothing to notify
  const token = await signLogoutToken({ clientId: p.client_id, sub: p.sub, sid: p.sid });
  const target = await resolveSafeSubscriber(uri);
  const status = await postPinned(target, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-store' },
    body: `logout_token=${encodeURIComponent(token)}`,
    timeoutMs: DELIVERY_TIMEOUT_MS,
  });
  if (status < 200 || status >= 300) throw new Error(`${p.product_key} back-channel endpoint answered HTTP ${status}`);
};

registerJobHandler(BACKCHANNEL_JOB, deliverLogoutJob);
