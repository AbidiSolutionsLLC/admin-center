// server/src/lib/roleHierarchy.ts
// WI-08: role grant hierarchy — an administrator may only grant/revoke roles at or below their own level,
// may never change their own roles, and may not manage users who outrank them.
import { Types } from 'mongoose';
import { ROLES } from '../constants/roles';
import { UserRole } from '../models/UserRole.model';
import { AppError } from '../utils/AppError';

/** Rank per system role name. Higher = more privileged. */
export const ROLE_RANK: Record<string, number> = {
  [ROLES.SUPER_ADMIN]: 100,
  [ROLES.IT_ADMIN]: 80,
  [ROLES.HR_ADMIN]: 80,
  [ROLES.OPS_ADMIN]: 70,
  [ROLES.ADMIN]: 60,
  [ROLES.HR]: 50,
  [ROLES.MANAGER]: 20,
  [ROLES.TECHNICIAN]: 10,
  [ROLES.EMPLOYEE]: 0,
};

/** Custom (company-defined) roles may carry arbitrary permissions: treat them as administrative (Admin level). */
export const CUSTOM_ROLE_RANK = 60;

export interface RankedRole {
  name: string;
  type?: 'system' | 'custom' | string;
}

export function rankOf(role: RankedRole | string | null | undefined): number {
  if (!role) return 0;
  const name = typeof role === 'string' ? role : role.name;
  if (name in ROLE_RANK) return ROLE_RANK[name];
  const type = typeof role === 'string' ? undefined : role.type;
  return type === 'system' ? 0 : CUSTOM_ROLE_RANK;
}

export function maxRank(roles: Array<RankedRole | string>): number {
  return roles.reduce<number>((m, r) => Math.max(m, rankOf(r)), 0);
}

/** Pure decision function (unit-tested). Returns an error message, or null when allowed. */
export function checkGrant(params: {
  actorId: string;
  actorRank: number;
  rolesToGrant: RankedRole[];
  targets: Array<{ userId: string; rank: number }>;
}): string | null {
  const { actorId, actorRank, rolesToGrant, targets } = params;
  for (const t of targets) {
    if (t.userId === actorId) return 'You cannot change your own roles.';
    if (t.rank > actorRank) return 'You cannot manage roles of a user with higher privileges than yours.';
  }
  for (const role of rolesToGrant) {
    if (role.name === ROLES.SUPER_ADMIN && actorRank < ROLE_RANK[ROLES.SUPER_ADMIN]) {
      return 'Only a Super Admin can grant the Super Admin role.';
    }
    if (rankOf(role) > actorRank) return `You cannot grant the role "${role.name}" (above your own level).`;
  }
  return null;
}

/** Highest rank among a user's assigned roles within a company. */
export async function getUserMaxRank(userId: string | Types.ObjectId, companyId: string | Types.ObjectId): Promise<number> {
  const assignments = await UserRole.find({ user_id: userId, company_id: companyId }).populate('role_id', 'name type').lean();
  const roles = assignments
    .map((a: any) => a.role_id)
    .filter(Boolean)
    .map((r: any) => ({ name: r.name, type: r.type }));
  return maxRank(roles);
}

/** Throws 403 when the authenticated actor may not grant `rolesToGrant` to / change roles of `targetUserIds`. */
export async function assertCanAssignRoles(
  req: { user: { userId: string; company_id: any; user_role?: string } },
  rolesToGrant: RankedRole[],
  targetUserIds: Array<string | Types.ObjectId>
): Promise<void> {
  const companyId = req.user.company_id;
  const actorRank = Math.max(await getUserMaxRank(req.user.userId, companyId), rankOf(req.user.user_role || ''));
  const targets = await Promise.all(
    targetUserIds.map(async (id) => ({ userId: id.toString(), rank: await getUserMaxRank(id, companyId) }))
  );
  const error = checkGrant({ actorId: req.user.userId.toString(), actorRank, rolesToGrant, targets });
  if (error) throw new AppError(error, 403, 'ROLE_HIERARCHY_VIOLATION');
}
