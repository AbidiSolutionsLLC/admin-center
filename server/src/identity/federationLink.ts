// server/src/identity/federationLink.ts
// Microsoft Entra account resolution with safe first-sign-in linking (elevation 5.11, owner decision: linking only, no JIT).
//
// An (issuer, oid) link resolves the identity. When there is none, a link is created only if ALL hold:
//   - the id_token carries an e-mail whose domain is a VERIFIED domain of this connection (the `email` claim alone is
//     not trusted: Entra does not verify it, so the domain check is what ties it to this organisation);
//   - an Identity with that e-mail already exists and is active;
//   - that identity already has an access-state membership in the connection's company;
//   - the identity has no link for this connection yet (a second Microsoft account never replaces the first).
// The write is one conditional update, so two concurrent first sign-ins cannot both link.
import { Types } from 'mongoose';
import { Identity, IIdentity } from '../models/Identity.model';
import type { IIdentityProviderConnection } from '../models/IdentityProviderConnection.model';
import { auditLogger } from '../lib/auditLogger';
import { pickMembership } from './accounts';

export type FederationFailure = 'federation_no_link' | 'federation_domain_not_verified' | 'identity_inactive' | 'federation_conflict';

export type FederationResult =
  | { ok: true; identity: IIdentity; linked: boolean }
  | { ok: false; reason: FederationFailure };

interface Input {
  connection: Pick<IIdentityProviderConnection, 'company_id' | 'verified_domains'> & { _id: Types.ObjectId };
  issuer: string;
  oid: string;
  /** The `email` claim (or `preferred_username`) of the verified id_token, if any. */
  email?: string;
}

export async function resolveFederatedIdentity({ connection, issuer, oid, email }: Input): Promise<FederationResult> {
  const linked = await Identity.findOne({ federated_links: { $elemMatch: { issuer, subject: oid } } });
  if (linked) {
    const link = linked.federated_links.find((l) => l.issuer === issuer && l.subject === oid);
    if (!link || link.connection_id.toString() !== connection._id.toString()) return { ok: false, reason: 'federation_no_link' };
    return { ok: true, identity: linked, linked: false };
  }

  const address = (email ?? '').trim().toLowerCase();
  const at = address.lastIndexOf('@');
  if (at < 1) return { ok: false, reason: 'federation_no_link' };
  const domain = address.slice(at + 1);
  const verified = (connection.verified_domains ?? []).map((d) => d.toLowerCase());
  if (!verified.includes(domain)) return { ok: false, reason: 'federation_domain_not_verified' };

  const identity = await Identity.findOne({ email: address });
  if (!identity) return { ok: false, reason: 'federation_no_link' };
  if (identity.status !== 'active') return { ok: false, reason: 'identity_inactive' };
  const membership = await pickMembership(identity._id, connection.company_id);
  if (!membership) return { ok: false, reason: 'federation_no_link' };

  const res = await Identity.updateOne(
    { _id: identity._id, 'federated_links.connection_id': { $ne: connection._id } },
    { $push: { federated_links: { connection_id: connection._id, issuer, subject: oid, linked_at: new Date() } } },
  );
  if (res.modifiedCount !== 1) return { ok: false, reason: 'federation_conflict' };

  await auditLogger.log({
    action: 'identity.federation_linked',
    module: 'security',
    category: 'Security',
    object_type: 'Identity',
    object_id: identity._id.toString(),
    object_label: identity.email,
    after_state: { issuer, connection_id: connection._id.toString(), method: 'verified_domain_email' },
    actor_override: { userId: membership._id.toString(), email: identity.email, company_id: connection.company_id },
  });
  const fresh = await Identity.findById(identity._id);
  return { ok: true, identity: fresh ?? identity, linked: true };
}
