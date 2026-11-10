// server/src/identity/accounts.ts
// Account resolution for the tenant realm: accountId = membership `User._id` (03 §5.1 `sub`).
import { Types } from 'mongoose';
import { User, IUser } from '../models/User.model';
import { Identity, IIdentity } from '../models/Identity.model';
import { Company } from '../models/Company.model';
import { UserRole } from '../models/UserRole.model';
import '../models/Role.model';
import { ACCESS_STATES } from './config';

export interface AccessContext {
  user: IUser;
  identity: IIdentity;
  roles: string[];
}

export const hasAccessState = (state: string) => (ACCESS_STATES as readonly string[]).includes(state);

/**
 * 03 §4.1.5 — identity `active`, membership lifecycle ∈ ACCESS_STATES, org active.
 * Returns null when the member must not receive tokens.
 */
export async function loadAccessContext(memberId: string): Promise<AccessContext | null> {
  if (!Types.ObjectId.isValid(memberId)) return null;
  const user = await User.findById(memberId);
  if (!user || !user.identity_id || !hasAccessState(user.lifecycle_state)) return null;
  const [identity, company] = await Promise.all([
    Identity.findById(user.identity_id),
    Company.findById(user.company_id).select('is_active status'),
  ]);
  if (!identity || identity.status !== 'active') return null;
  if (!company || company.is_active === false || (company.status && company.status !== 'active')) return null;
  const assignments = await UserRole.find({ user_id: user._id, company_id: user.company_id }).populate('role_id', 'name');
  const roles = assignments.map((a) => (a.role_id as unknown as { name?: string } | null)?.name).filter((n): n is string => !!n);
  return { user, identity, roles };
}

/** One active membership per identity at launch (contract): oldest membership in ACCESS_STATES. */
export async function pickMembership(identityId: Types.ObjectId, companyId?: Types.ObjectId): Promise<IUser | null> {
  return User.findOne({
    identity_id: identityId,
    lifecycle_state: { $in: ACCESS_STATES as unknown as string[] },
    ...(companyId ? { company_id: companyId } : {}),
  }).sort({ created_at: 1 });
}

/** oidc-provider `findAccount`. */
export async function findAccount(_ctx: unknown, id: string) {
  const access = await loadAccessContext(id);
  if (!access) return undefined;
  const { user, identity } = access;
  return {
    accountId: id,
    claims: async () => ({
      sub: id,
      email: identity.email,
      email_verified: !!identity.email_verified_at,
      name: identity.full_name || user.full_name,
    }),
  };
}
