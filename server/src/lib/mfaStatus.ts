import { Types } from 'mongoose';
import { Identity } from '../models/Identity.model';

/**
 * Members whose sign-in identity has a second factor (authenticator app or e-mail code).
 * MFA is enrolled on the Identity (hosted sign-in pages, identity/interactions.ts), not on User;
 * `User.mfa_enabled` is a legacy field that sign-in never sets, so health checks must use this.
 * Returns the ids (as strings) of the given users that have MFA.
 */
export async function usersWithMfa(users: Array<{ _id: Types.ObjectId | string; identity_id?: Types.ObjectId | string | null }>): Promise<Set<string>> {
  const identityIds = users.map((u) => u.identity_id).filter((i): i is Types.ObjectId | string => !!i);
  if (!identityIds.length) return new Set();
  const identities = await Identity.find({ _id: { $in: identityIds } }).select('mfa').lean();
  const enrolled = new Set(identities.filter((i: any) => i.mfa?.totp_enabled || i.mfa?.email_otp_enabled).map((i) => String(i._id)));
  return new Set(users.filter((u) => u.identity_id && enrolled.has(String(u.identity_id))).map((u) => String(u._id)));
}
