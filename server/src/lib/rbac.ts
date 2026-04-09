// server/src/lib/rbac.ts
import { Types } from 'mongoose';
import { Role, IRole } from '../models/Role.model';
import { Permission, IPermission } from '../models/Permission.model';
import { RolePermission, IRolePermission } from '../models/RolePermission.model';
import { UserRole, IUserRole } from '../models/UserRole.model';

/**
 * Represents a resolved permission with its grant/deny state
 */
export interface ResolvedPermission {
  module: string;
  action: string;
  data_scope: string;
  granted: boolean;
}

/**
 * Represents the effective permissions for a user across all their roles
 */
export interface UserEffectivePermissions {
  user_id: Types.ObjectId;
  company_id: Types.ObjectId;
  roles: Array<{ role_id: Types.ObjectId; role_name: string }>;
  permissions: Map<string, boolean>;
}

/**
 * Resolves all permissions for a user by joining UserRole → RolePermission → Permission.
 * Implements deny-overrides-grant logic: if any role denies a permission, it's denied
 * even if other roles grant it.
 *
 * @param userId - The user's ID
 * @param companyId - The company ID to scope permissions to
 * @returns UserEffectivePermissions with all resolved permissions
 */
export const resolveUserPermissions = async (
  userId: Types.ObjectId,
  companyId: Types.ObjectId
): Promise<UserEffectivePermissions> => {
  // Get all roles assigned to this user
  const userRoles = await UserRole.find({ user_id: userId, company_id: companyId }).lean();

  if (userRoles.length === 0) {
    return {
      user_id: userId,
      company_id: companyId,
      roles: [],
      permissions: new Map(),
    };
  }

  const roleIds = userRoles.map((ur) => ur.role_id);

  // Get role details
  const roles = await Role.find({
    _id: { $in: roleIds },
    company_id: companyId,
  }).lean();

  // Get all role permissions for these roles
  const rolePermissions = await RolePermission.find({
    role_id: { $in: roleIds },
    company_id: companyId,
  }).lean();

  // Get all permission details
  const permissionIds = rolePermissions.map((rp) => rp.permission_id);
  const permissions = await Permission.find({
    _id: { $in: permissionIds },
  }).lean();

  // Build permission map with deny-overrides-grant logic
  // Key: "module:action:data_scope", Value: granted (false if any role denies)
  const permissionMap = new Map<string, boolean>();

  // First pass: collect all grants
  for (const rp of rolePermissions) {
    const perm = permissions.find((p) => p._id.equals(rp.permission_id));
    if (!perm) continue;

    const key = `${perm.module}:${perm.action}:${perm.data_scope}`;

    if (rp.granted) {
      // Initialize as granted if not seen before
      if (!permissionMap.has(key)) {
        permissionMap.set(key, true);
      }
    }
  }

  // Second pass: apply denies (deny overrides grant)
  for (const rp of rolePermissions) {
    const perm = permissions.find((p) => p._id.equals(rp.permission_id));
    if (!perm) continue;

    const key = `${perm.module}:${perm.action}:${perm.data_scope}`;

    if (!rp.granted) {
      // Deny always overrides grant
      permissionMap.set(key, false);
    }
  }

  return {
    user_id: userId,
    company_id: companyId,
    roles: roles.map((r) => ({
      role_id: r._id as Types.ObjectId,
      role_name: r.name,
    })),
    permissions: permissionMap,
  };
};

/**
 * Checks if a user has a specific permission.
 * Uses resolveUserPermissions and checks the effective grant state.
 *
 * @param userId - The user's ID
 * @param companyId - The company ID
 * @param module - Permission module to check
 * @param action - Permission action to check
 * @param dataScope - Permission data scope to check
 * @returns true if the permission is granted, false if denied or not found
 */
export const hasPermission = async (
  userId: Types.ObjectId,
  companyId: Types.ObjectId,
  module: string,
  action: string,
  dataScope: string
): Promise<boolean> => {
  const effectivePerms = await resolveUserPermissions(userId, companyId);
  const key = `${module}:${action}:${dataScope}`;
  return effectivePerms.permissions.get(key) ?? false;
};

/**
 * Gets all permissions for a specific role.
 *
 * @param roleId - The role ID
 * @param companyId - The company ID (for validation)
 * @returns Array of resolved permissions for the role
 */
export const getRolePermissions = async (
  roleId: Types.ObjectId,
  companyId: Types.ObjectId
): Promise<ResolvedPermission[]> => {
  // Verify role belongs to company
  const role = await Role.findOne({
    _id: roleId,
    company_id: companyId,
  }).lean();

  if (!role) {
    return [];
  }

  // Get role permissions
  const rolePermissions = await RolePermission.find({
    role_id: roleId,
    company_id: companyId,
  }).lean();

  // Get permission details
  const permissionIds = rolePermissions.map((rp) => rp.permission_id);
  const permissions = await Permission.find({
    _id: { $in: permissionIds },
  }).lean();

  // Build resolved permissions
  return rolePermissions
    .map((rp) => {
      const perm = permissions.find((p) => p._id.equals(rp.permission_id));
      if (!perm) return null;

      return {
        module: perm.module,
        action: String(perm.action),
        data_scope: String(perm.data_scope),
        granted: rp.granted,
      };
    })
    .filter((p): p is ResolvedPermission => p !== null);
};

/**
 * Batch updates permissions for a role.
 * Implements atomic upsert: creates new grants or updates existing ones.
 *
 * @param roleId - The role ID
 * @param companyId - The company ID (for validation)
 * @param updates - Array of permission updates
 * @returns Number of permissions updated
 */
export const batchUpdateRolePermissions = async (
  roleId: Types.ObjectId,
  companyId: Types.ObjectId,
  updates: Array<{ permission_id: Types.ObjectId; granted: boolean }>
): Promise<number> => {
  // Verify role belongs to company
  const role = await Role.findOne({
    _id: roleId,
    company_id: companyId,
  });

  if (!role) {
    throw new Error('Role not found');
  }

  let updatedCount = 0;

  // Process each update
  for (const update of updates) {
    await RolePermission.updateOne(
      {
        role_id: roleId,
        permission_id: update.permission_id,
      },
      {
        $set: {
          role_id: roleId,
          permission_id: update.permission_id,
          granted: update.granted,
        },
      },
      { upsert: true }
    );
    updatedCount++;
  }

  return updatedCount;
};

/**
 * Simulates effective permissions for a user with a hypothetical role assignment.
 * Useful for "what-if" scenarios before actually assigning roles.
 *
 * @param userId - The user's ID
 * @param companyId - The company ID
 * @param hypotheticalRoleIds - Additional role IDs to simulate
 * @returns UserEffectivePermissions with simulated permissions
 */
export const simulateUserPermissions = async (
  userId: Types.ObjectId,
  companyId: Types.ObjectId,
  hypotheticalRoleIds: Types.ObjectId[]
): Promise<UserEffectivePermissions> => {
  // Get current user roles
  const userRoles = await UserRole.find({ user_id: userId, company_id: companyId }).lean();
  const currentRoleIds = userRoles.map((ur) => ur.role_id);

  // Combine current and hypothetical roles
  const allRoleIds = [...currentRoleIds, ...hypotheticalRoleIds];

  // Get role details
  const roles = await Role.find({
    _id: { $in: allRoleIds },
    company_id: companyId,
  }).lean();

  // Get all role permissions for these roles
  const rolePermissions = await RolePermission.find({
    role_id: { $in: allRoleIds },
    company_id: companyId,
  }).lean();

  // Get all permission details
  const permissionIds = rolePermissions.map((rp) => rp.permission_id);
  const permissions = await Permission.find({
    _id: { $in: permissionIds },
  }).lean();

  // Build permission map with deny-overrides-grant logic
  const permissionMap = new Map<string, boolean>();

  // First pass: collect all grants
  for (const rp of rolePermissions) {
    const perm = permissions.find((p) => p._id.equals(rp.permission_id));
    if (!perm) continue;

    const key = `${perm.module}:${perm.action}:${perm.data_scope}`;

    if (rp.granted) {
      if (!permissionMap.has(key)) {
        permissionMap.set(key, true);
      }
    }
  }

  // Second pass: apply denies (deny overrides grant)
  for (const rp of rolePermissions) {
    const perm = permissions.find((p) => p._id.equals(rp.permission_id));
    if (!perm) continue;

    const key = `${perm.module}:${perm.action}:${perm.data_scope}`;

    if (!rp.granted) {
      permissionMap.set(key, false);
    }
  }

  return {
    user_id: userId,
    company_id: companyId,
    roles: roles.map((r) => ({
      role_id: r._id as Types.ObjectId,
      role_name: r.name,
    })),
    permissions: permissionMap,
  };
};
