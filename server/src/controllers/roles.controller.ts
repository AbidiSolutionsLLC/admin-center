// server/src/controllers/roles.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { rbacCache } from '../lib/rbacCache';
import { auditLogger } from '../lib/auditLogger';
import { Role } from '../models/Role.model';
import { Permission } from '../models/Permission.model';
import { RolePermission } from '../models/RolePermission.model';
import { UserRole } from '../models/UserRole.model';
import { User } from '../models/User.model';
import { Group } from '../models/Group.model';
import { GroupMember } from '../models/GroupMember.model';
import { Types, FilterQuery } from 'mongoose';
import {
  getRolePermissions as fetchRolePermissions,
  batchUpdateRolePermissions,
  simulateUserPermissions,
} from '../lib/rbac';

/**
 * Zod schema for creating a role
 */
const createRoleSchema = z.object({
  name: z.string().trim().min(1, 'Role name is required').max(100),
  description: z.string().trim().optional(),
  type: z.enum(['system', 'custom']).default('custom'),
  parent_role_id: z.string().optional(),
  template_role_id: z.string().optional(),
});

/**
 * Zod schema for updating a role
 */
const updateRoleSchema = z.object({
  name: z.string().trim().min(1, 'Role name cannot be empty').max(100).optional(),
  description: z.string().trim().optional(),
  parent_role_id: z.string().optional(),
  is_active: z.boolean().optional(),
});

/**
 * Zod schema for batch updating role permissions
 */
const batchUpdatePermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      permission_id: z.string(),
      granted: z.boolean().nullable(),
    })
  ),
});

/**
 * Zod schema for permission simulation
 */
const simulatePermissionsSchema = z.object({
  hypothetical_role_ids: z.array(z.string()),
});

/**
 * GET /api/v1/roles
 * Get all roles for the authenticated user's company
 */
export const getRoles = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;
  const companyObjectId = new Types.ObjectId(companyId as string);
  const { search } = req.query;

  const filter: FilterQuery<any> = { 
    company_id: companyObjectId, 
    is_active: true 
  };

  if (search) {
    filter.name = { $regex: String(search), $options: 'i' };
  }

  const roles = await Role.find(filter)
    .sort({ name: 1 })
    .lean();

  // Get permission count and user count for each role
  const rolesWithCounts = await Promise.all(
    roles.map(async (role) => {
      const grantedCount = await RolePermission.countDocuments({
        role_id: role._id,
        company_id: new Types.ObjectId(companyId),
        granted: true,
      });

      const userCount = await UserRole.countDocuments({
        role_id: role._id,
        company_id: new Types.ObjectId(companyId),
      });

      return {
        ...role,
        granted_permissions_count: grantedCount,
        user_count: userCount,
      };
    })
  );

  res.status(200).json({
    success: true,
    data: rolesWithCounts,
  });
});

/**
 * GET /api/v1/roles/:id
 * Get a specific role with its permissions
 */
export const getRoleById = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;
  const companyObjectId = new Types.ObjectId(companyId as string);
  const roleId = req.params.id;

  const role = await Role.findOne({
    _id: new Types.ObjectId(roleId),
    company_id: companyObjectId,
  }).lean();

  if (!role) {
    throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  }

  // Get role permissions
  const rolePermissions = await fetchRolePermissions(
    new Types.ObjectId(role._id as string),
    new Types.ObjectId(companyId)
  );

  res.status(200).json({
    success: true,
    data: {
      ...role,
      permissions: rolePermissions,
    },
  });
});

/**
 * POST /api/v1/roles
 * Create a new role, optionally duplicating from a template
 */
export const createRole = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;
  const companyObjectId = new Types.ObjectId(companyId as string);

  const validated = createRoleSchema.parse(req.body);

  // Case-insensitive duplicate check
  const existingRole = await Role.findOne({
    company_id: companyObjectId,
    name: { $regex: `^${validated.name}$`, $options: 'i' },
  });

  if (existingRole) {
    throw new AppError('A role with this name already exists', 400, 'DUPLICATE');
  }

  // Handle template role if provided
  let templatePermissions: any[] = [];
  if (validated.template_role_id) {
    const templateRole = await Role.findOne({
      _id: validated.template_role_id,
      company_id: companyId,
    });

    if (!templateRole) {
      throw new AppError('Template role not found', 404, 'TEMPLATE_NOT_FOUND');
    }

    templatePermissions = await RolePermission.find({
      role_id: validated.template_role_id,
      company_id: companyId,
    }).lean();
  }

  const role = await Role.create({
    company_id: companyObjectId,
    name: validated.name,
    description: validated.description,
    type: validated.type,
    parent_role_id: validated.parent_role_id
      ? new Types.ObjectId(validated.parent_role_id)
      : undefined,
    is_active: true,
  });

  // If duplicating, copy permissions
  if (templatePermissions.length > 0) {
    const newPermissions = templatePermissions.map((tp) => ({
      role_id: role._id,
      permission_id: tp.permission_id,
      company_id: companyId,
      granted: tp.granted,
    }));

    await RolePermission.insertMany(newPermissions);
  }

  // Audit log
  await auditLogger.log({
    req,
    action: 'roles.created',
    module: 'roles',
    object_type: 'Role',
    object_id: (role._id as Types.ObjectId).toString(),
    object_label: role.name,
    before_state: null,
    after_state: {
      ...role.toObject(),
      duplicated_from: validated.template_role_id,
      permissions_copied: templatePermissions.length,
    },
  });

  res.status(201).json({
    success: true,
    data: role,
  });
});

/**
 * PUT /api/v1/roles/:id
 * Update a role
 */
export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;
  const companyObjectId = new Types.ObjectId(companyId as string);
  const roleId = req.params.id;

  const validated = updateRoleSchema.parse(req.body);

  const role = await Role.findOne({
    _id: new Types.ObjectId(roleId),
    company_id: companyObjectId,
  });

  if (!role) {
    throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  }

  // Case-insensitive duplicate check if name is being updated
  if (validated.name && validated.name !== role.name) {
    const duplicate = await Role.findOne({
      company_id: companyObjectId,
      name: { $regex: `^${validated.name}$`, $options: 'i' },
      _id: { $ne: new Types.ObjectId(roleId) },
    });

    if (duplicate) {
      throw new AppError('A role with this name already exists', 400, 'DUPLICATE');
    }
  }

  // Check if any users are assigned to this role (prevent editing if assigned)
  const assignedUsersCount = await UserRole.countDocuments({
    role_id: roleId,
    company_id: new Types.ObjectId(companyId),
  });

  if (assignedUsersCount > 0) {
    throw new AppError(
      `Cannot edit role: ${assignedUsersCount} user(s) still assigned. Unassign all users before editing.`,
      400,
      'HAS_DEPENDENTS'
    );
  }

  const beforeState = role.toObject();

  // Update fields
  Object.assign(role, validated);
  await role.save();

  // Invalidate entire cache
  rbacCache.invalidateAll();

  const afterState = role.toObject();

  // Audit log
  await auditLogger.log({
    req,
    action: 'roles.updated',
    module: 'roles',
    object_type: 'Role',
    object_id: (role._id as Types.ObjectId).toString(),
    object_label: role.name,
    before_state: beforeState,
    after_state: afterState,
  });

  res.status(200).json({
    success: true,
    data: role,
  });
});

/**
 * DELETE /api/v1/roles/:id
 * Delete a role (blocked if users are assigned or it has children)
 */
export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;
  const companyObjectId = new Types.ObjectId(companyId as string);
  const roleId = req.params.id;

  const role = await Role.findOne({
    _id: new Types.ObjectId(roleId),
    company_id: companyObjectId,
  });

  if (!role) {
    throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  }

  // Check if any users are assigned to this role
  const assignedUsersCount = await UserRole.countDocuments({
    role_id: new Types.ObjectId(roleId),
    company_id: companyObjectId,
  });

  if (assignedUsersCount > 0) {
    throw new AppError(
      `Cannot delete role: ${assignedUsersCount} user(s) still assigned`,
      400,
      'HAS_DEPENDENTS'
    );
  }

  // Check if any other roles have this role as a parent
  const childRolesCount = await Role.countDocuments({
    parent_role_id: new Types.ObjectId(roleId),
    company_id: companyObjectId,
  });

  if (childRolesCount > 0) {
    throw new AppError(
      `Cannot delete role: ${childRolesCount} child role(s) still exist`,
      400,
      'HAS_DEPENDENTS'
    );
  }

  // Check if any policies are targeting this role
  const { PolicyAssignment } = await import('../models/PolicyAssignment.model');
  const policyAssignmentsCount = await PolicyAssignment.countDocuments({
    company_id: companyObjectId,
    target_type: 'role',
    target_id: roleId,
  });

  if (policyAssignmentsCount > 0) {
    throw new AppError(
      `Cannot delete role: Assigned to ${policyAssignmentsCount} active policy/policies`,
      400,
      'HAS_DEPENDENTS'
    );
  }

  const beforeState = role.toObject();

  // Delete all role permissions associated with this role
  await RolePermission.deleteMany({ role_id: roleId, company_id: companyId });

  // Hard delete the role
  await Role.deleteOne({ _id: roleId, company_id: companyId });

  // Invalidate entire cache
  rbacCache.invalidateAll();

  // Audit log
  await auditLogger.log({
    req,
    action: 'roles.deleted',
    module: 'roles',
    object_type: 'Role',
    object_id: (role._id as Types.ObjectId).toString(),
    object_label: role.name,
    before_state: beforeState,
    after_state: null,
  });

  res.status(200).json({
    success: true,
    data: null,
  });
});

/**
 * GET /api/v1/roles/:id/permissions
 * Get all permissions for a specific role
 */
export const getRolePermissions = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;
  const roleId = req.params.id;

  const role = await Role.findOne({
    _id: roleId,
    company_id: companyId,
  });

  if (!role) {
    throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  }

  const permissions = await fetchRolePermissions(
    new Types.ObjectId(role._id as string),
    new Types.ObjectId(companyId)
  );

  res.status(200).json({
    success: true,
    data: permissions,
  });
});

/**
 * PUT /api/v1/roles/:id/permissions
 * Batch update permissions for a role
 */
export const updateRolePermissions = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;
  const roleId = req.params.id;

  const validated = batchUpdatePermissionsSchema.parse(req.body);

  const role = await Role.findOne({
    _id: roleId,
    company_id: companyId,
  });

  if (!role) {
    throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  }

  // Get before state for audit
  const beforePermissions = await RolePermission.find({ role_id: roleId, company_id: companyId }).lean();

  // Convert string IDs to ObjectIds
  const updates = validated.permissions.map((p) => ({
    permission_id: new Types.ObjectId(p.permission_id),
    granted: p.granted,
  }));

  // Batch update
  const updatedCount = await batchUpdateRolePermissions(
    new Types.ObjectId(role._id as string),
    new Types.ObjectId(companyId),
    updates
  );

  // Invalidate entire cache on permission updates
  rbacCache.invalidateAll();

  // Get after state for audit
  const afterPermissions = await RolePermission.find({ role_id: roleId, company_id: companyId }).lean();

  // Audit log
  await auditLogger.log({
    req,
    action: 'roles.permissions_updated',
    module: 'roles',
    object_type: 'Role',
    object_id: (role._id as Types.ObjectId).toString(),
    object_label: role.name,
    before_state: { permissions: beforePermissions },
    after_state: { permissions: afterPermissions },
  });

  res.status(200).json({
    success: true,
    data: {
      updated_count: updatedCount,
    },
  });
});

/**
 * GET /api/v1/roles/permissions/all
 * Get all available permissions (for building the permission matrix)
 */
export const getAllPermissions = asyncHandler(async (req: Request, res: Response) => {
  const permissions = await Permission.find({}).sort({ module: 1, action: 1 }).lean();

  res.status(200).json({
    success: true,
    data: permissions,
  });
});

/**
 * POST /api/v1/roles/simulate-permissions
 * Simulate effective permissions for a user with hypothetical role assignments
 */
export const simulatePermissions = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;
  const userId = req.query.user_id as string;

  if (!userId) {
    throw new AppError('user_id query parameter is required', 400, 'MISSING_USER_ID');
  }

  const validated = simulatePermissionsSchema.parse(req.body);

  const user = await User.findOne({
    _id: userId,
    company_id: companyId,
  });

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const hypotheticalRoleIds = validated.hypothetical_role_ids.map(
    (id) => new Types.ObjectId(id)
  );

  const effectivePermissions = await simulateUserPermissions(
    new Types.ObjectId(userId),
    new Types.ObjectId(companyId),
    hypotheticalRoleIds
  );

  // Convert Map to array for JSON response
  const permissionsArray = Array.from(effectivePermissions.permissions.entries()).map(
    ([key, granted]) => {
      const [module, action, data_scope] = key.split(':');
      return { module, action, data_scope, granted };
    }
  );

  // Audit log for simulation event
  await auditLogger.log({
    req,
    action: 'roles.permissions_simulated',
    module: 'roles',
    object_type: 'User',
    object_id: userId,
    object_label: user.full_name,
    after_state: {
      hypothetical_role_ids: validated.hypothetical_role_ids,
      simulated_roles: effectivePermissions.roles.map(r => r.role_name),
    },
  });

  res.status(200).json({
    success: true,
    data: {
      user_id: effectivePermissions.user_id,
      roles: effectivePermissions.roles,
      permissions: permissionsArray,
    },
  });
});

/**
 * GET /api/v1/roles/:id/users
 * Get all users assigned to a specific role
 */
export const getRoleUsers = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;
  const roleId = req.params.id;

  const role = await Role.findOne({
    _id: roleId,
    company_id: companyId,
  });

  if (!role) {
    throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  }

  // Get user IDs assigned to this role
  const userRoles = await UserRole.find({ role_id: roleId, company_id: companyId }).lean();
  const userIds = userRoles.map((ur) => ur.user_id);

  const users = await User.find({
    _id: { $in: userIds },
    company_id: companyId,
  })
    .select('full_name email employee_id lifecycle_state')
    .lean();

  res.status(200).json({
    success: true,
    data: users,
  });
});

/**
 * POST /api/v1/roles/:id/users
 * Assign a user to a role
 */
export const assignRoleToUser = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;
  const roleId = req.params.id;
  const { user_id } = z.object({ user_id: z.string() }).parse(req.body);

  console.log('ASSIGNING ROLE START:', { 
    roleId, 
    user_id, 
    companyId,
    roleIdType: typeof roleId,
    user_idType: typeof user_id,
    companyIdType: typeof companyId
  });

  const role = await Role.findOne({ 
    _id: new Types.ObjectId(roleId), 
    company_id: new Types.ObjectId(companyId) 
  });

  if (!role) {
    console.log('ROLE NOT FOUND IN DB:', { roleId, companyId });
    throw new AppError(`Role not found: ${roleId}`, 404, 'ROLE_NOT_FOUND');
  }

  const user = await User.findOne({ 
    _id: new Types.ObjectId(user_id), 
    company_id: new Types.ObjectId(companyId) 
  });

  if (!user) {
    console.log('USER NOT FOUND IN DB:', { user_id, companyId });
    throw new AppError(`User not found: ${user_id}`, 404, 'USER_NOT_FOUND');
  }

  // Check if already assigned
  const existing = await UserRole.findOne({ user_id, role_id: roleId });
  if (existing) {
    return res.status(200).json({ success: true, message: 'User already assigned to this role' });
  }

  await UserRole.create({
    user_id,
    role_id: roleId,
    company_id: companyId,
    assigned_by: req.user.userId,
  });

  // Invalidate cache for assigned user
  rbacCache.invalidateUser(user_id);

  await auditLogger.log({
    req,
    action: 'roles.user_assigned',
    module: 'roles',
    object_type: 'Role',
    object_id: roleId,
    object_label: role.name,
    after_state: { user_id, full_name: user.full_name },
  });

  res.status(201).json({ success: true, message: 'User assigned to role' });
});

/**
 * DELETE /api/v1/roles/:id/users/:userId
 * Unassign a user from a role
 */
export const unassignRoleFromUser = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;
  const roleId = req.params.id;
  const userId = req.params.userId;

  const role = await Role.findOne({ _id: roleId, company_id: companyId });
  if (!role) throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');

  const user = await User.findOne({ _id: userId, company_id: companyId });
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

  const result = await UserRole.deleteOne({
    user_id: userId,
    role_id: roleId,
  });

  if (result.deletedCount === 0) {
    throw new AppError('User not assigned to this role', 404, 'ASSIGNMENT_NOT_FOUND');
  }

  // Invalidate cache for unassigned user
  rbacCache.invalidateUser(userId);

  await auditLogger.log({
    req,
    action: 'roles.user_unassigned',
    module: 'roles',
    object_type: 'Role',
    object_id: roleId,
    object_label: role.name,
    after_state: { user_id: userId, full_name: user.full_name },
  });

  res.status(200).json({ success: true, message: 'User unassigned from role' });
});

/**
 * GET /api/v1/roles/access-map
 * Get a hierarchical map of roles, assigned users, their groups, and permissions.
 */
export const getAccessMap = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;

  // 1. Fetch all active roles
  const roles = await Role.find({ company_id: companyId, is_active: true }).lean();
  const roleIds = roles.map(r => r._id);

  // 2. Fetch all role permissions for these roles
  const rolePermissions = await RolePermission.find({
    company_id: companyId,
    role_id: { $in: roleIds },
    granted: true,
  }).populate('permission_id').lean();

  // 3. Fetch all user assignments for these roles
  const userRoles = await UserRole.find({
    company_id: companyId,
    role_id: { $in: roleIds },
  }).lean();
  const userIds = [...new Set(userRoles.map(ur => ur.user_id.toString()))];

  // 4. Fetch the users
  const users = await User.find({
    company_id: companyId,
    _id: { $in: userIds },
  }).select('full_name email lifecycle_state avatar_url').lean();

  // 5. Fetch groups these users belong to
  const groupMembers = await GroupMember.find({
    user_id: { $in: userIds },
  }).lean();
  const groupIds = [...new Set(groupMembers.map(gm => gm.group_id.toString()))];

  const groups = await Group.find({
    company_id: companyId,
    _id: { $in: groupIds },
  }).select('name type').lean();

  // Map Data construction
  const mapData = roles.map(role => {
    // Users for this role
    const assignedUserIds = userRoles
      .filter(ur => ur.role_id.toString() === role._id.toString())
      .map(ur => ur.user_id.toString());
    
    const roleUsers = users.filter(u => assignedUserIds.includes(u._id.toString()));

    // Permissions for this role, grouped by module
    const rolePerms = rolePermissions.filter(rp => rp.role_id.toString() === role._id.toString());
    const permissionsByModule: Record<string, any[]> = {};
    rolePerms.forEach(rp => {
      const p = rp.permission_id as any;
      if (!p) return;
      if (!permissionsByModule[p.module]) permissionsByModule[p.module] = [];
      permissionsByModule[p.module].push({
        action: p.action,
        data_scope: p.data_scope,
      });
    });

    const permissions = Object.keys(permissionsByModule).map(module => ({
      module,
      actions: permissionsByModule[module],
    }));

    // Groups related to these users
    const roleGroups = groups.filter(g => {
      const membersOfThisGroup = groupMembers
        .filter(gm => gm.group_id.toString() === g._id.toString())
        .map(gm => gm.user_id.toString());
      return membersOfThisGroup.some(memberId => assignedUserIds.includes(memberId));
    });

    return {
      _id: role._id,
      name: role.name,
      type: role.type,
      users: roleUsers.map(u => ({
        _id: u._id,
        full_name: u.full_name,
        email: u.email,
        lifecycle_state: u.lifecycle_state,
        avatar_url: u.avatar_url,
      })),
      groups: roleGroups.map(g => ({
        _id: g._id,
        name: g.name,
        type: g.type,
      })),
      permissions,
    };
  });

  res.status(200).json({
    success: true,
    data: mapData,
  });
});

