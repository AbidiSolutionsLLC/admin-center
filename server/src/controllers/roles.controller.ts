// server/src/controllers/roles.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { auditLogger } from '../lib/auditLogger';
import { Role, IRole } from '../models/Role.model';
import { Permission, IPermission } from '../models/Permission.model';
import { RolePermission } from '../models/RolePermission.model';
import { UserRole } from '../models/UserRole.model';
import { User } from '../models/User.model';
import { Types } from 'mongoose';
import {
  resolveUserPermissions,
  getRolePermissions as fetchRolePermissions,
  batchUpdateRolePermissions,
  simulateUserPermissions,
} from '../lib/rbac';

/**
 * Zod schema for creating a role
 */
const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  type: z.enum(['system', 'custom']).default('custom'),
  parent_role_id: z.string().optional(),
});

/**
 * Zod schema for updating a role
 */
const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
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
      granted: z.boolean(),
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
  const companyId = req.user!.company_id;

  const roles = await Role.find({ company_id: companyId, is_active: true })
    .sort({ name: 1 })
    .lean();

  // Get permission count for each role
  const rolesWithCounts = await Promise.all(
    roles.map(async (role) => {
      const grantedCount = await RolePermission.countDocuments({
        role_id: role._id,
        granted: true,
      });

      return {
        ...role,
        granted_permissions_count: grantedCount,
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
  const companyId = req.user!.company_id;
  const roleId = req.params.id;

  const role = await Role.findOne({
    _id: roleId,
    company_id: companyId,
  }).lean();

  if (!role) {
    throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  }

  // Get role permissions
  const rolePermissions = await fetchRolePermissions(
    new Types.ObjectId(role._id),
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
 * Create a new role
 */
export const createRole = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;

  const validated = createRoleSchema.parse(req.body);

  // Check if role name already exists for this company
  const existingRole = await Role.findOne({
    company_id: companyId,
    name: validated.name,
  });

  if (existingRole) {
    throw new AppError('A role with this name already exists', 409, 'ROLE_EXISTS');
  }

  const role = await Role.create({
    company_id: companyId,
    name: validated.name,
    description: validated.description,
    type: validated.type,
    parent_role_id: validated.parent_role_id
      ? new Types.ObjectId(validated.parent_role_id)
      : undefined,
    is_active: true,
  });

  // Audit log
  await auditLogger.log({
    req,
    action: 'roles.created',
    module: 'roles',
    object_type: 'Role',
    object_id: role._id.toString(),
    object_label: role.name,
    after_state: role,
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
  const companyId = req.user!.company_id;
  const roleId = req.params.id;

  const validated = updateRoleSchema.parse(req.body);

  const role = await Role.findOne({
    _id: roleId,
    company_id: companyId,
  });

  if (!role) {
    throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  }

  // Check for duplicate name if name is being updated
  if (validated.name && validated.name !== role.name) {
    const duplicate = await Role.findOne({
      company_id: companyId,
      name: validated.name,
      _id: { $ne: roleId },
    });

    if (duplicate) {
      throw new AppError('A role with this name already exists', 409, 'ROLE_EXISTS');
    }
  }

  const beforeState = { ...role.toObject() };

  // Update fields
  Object.assign(role, validated);
  await role.save();

  const afterState = { ...role.toObject() };

  // Audit log
  await auditLogger.log({
    req,
    action: 'roles.updated',
    module: 'roles',
    object_type: 'Role',
    object_id: role._id.toString(),
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
 * Delete a role (blocked if users are assigned to it)
 */
export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const roleId = req.params.id;

  const role = await Role.findOne({
    _id: roleId,
    company_id: companyId,
  });

  if (!role) {
    throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  }

  // Check if any users are assigned to this role
  const assignedUsersCount = await UserRole.countDocuments({
    role_id: roleId,
  });

  if (assignedUsersCount > 0) {
    throw new AppError(
      `Cannot delete role: ${assignedUsersCount} user(s) are assigned to this role. Remove all users first.`,
      409,
      'ROLE_HAS_USERS'
    );
  }

  // Delete all role permissions
  await RolePermission.deleteMany({ role_id: roleId });

  // Delete the role
  const beforeState = { ...role.toObject() };
  await Role.deleteOne({ _id: roleId });

  // Audit log
  await auditLogger.log({
    req,
    action: 'roles.deleted',
    module: 'roles',
    object_type: 'Role',
    object_id: role._id.toString(),
    object_label: role.name,
    before_state: beforeState,
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
  const companyId = req.user!.company_id;
  const roleId = req.params.id;

  const role = await Role.findOne({
    _id: roleId,
    company_id: companyId,
  });

  if (!role) {
    throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  }

  const permissions = await fetchRolePermissions(
    new Types.ObjectId(role._id),
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
  const companyId = req.user!.company_id;
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
  const beforePermissions = await RolePermission.find({ role_id: roleId }).lean();

  // Convert string IDs to ObjectIds
  const updates = validated.permissions.map((p) => ({
    permission_id: new Types.ObjectId(p.permission_id),
    granted: p.granted,
  }));

  // Batch update
  const updatedCount = await batchUpdateRolePermissions(
    new Types.ObjectId(role._id),
    new Types.ObjectId(companyId),
    updates
  );

  // Get after state for audit
  const afterPermissions = await RolePermission.find({ role_id: roleId }).lean();

  // Audit log
  await auditLogger.log({
    req,
    action: 'roles.permissions_updated',
    module: 'roles',
    object_type: 'Role',
    object_id: role._id.toString(),
    object_label: role.name,
    before_state: beforePermissions,
    after_state: afterPermissions,
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
  const companyId = req.user!.company_id;
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
  const companyId = req.user!.company_id;
  const roleId = req.params.id;

  const role = await Role.findOne({
    _id: roleId,
    company_id: companyId,
  });

  if (!role) {
    throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  }

  // Get user IDs assigned to this role
  const userRoles = await UserRole.find({ role_id: roleId }).lean();
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
