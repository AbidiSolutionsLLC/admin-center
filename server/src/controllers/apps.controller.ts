// server/src/controllers/apps.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { auditLogger } from '../lib/auditLogger';
import { App, IApp } from '../models/App.model';
import { AppAssignment, IAppAssignment } from '../models/AppAssignment.model';
import { User } from '../models/User.model';
import { Role } from '../models/Role.model';
import { Department } from '../models/Department.model';
import { UserRole } from '../models/UserRole.model';
import { Types } from 'mongoose';

/**
 * Zod schema for creating an app
 */
const createAppSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  icon_url: z.string().url().optional(),
  category: z.string().min(1),
  provider: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
});

/**
 * Zod schema for updating an app
 */
const updateAppSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  icon_url: z.string().url().optional(),
  category: z.string().min(1).optional(),
  provider: z.string().optional(),
  status: z.enum(['active', 'inactive', 'maintenance']).optional(),
  dependencies: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

/**
 * Zod schema for assigning an app
 */
const assignAppSchema = z.object({
  target_type: z.enum(['role', 'department', 'group', 'user']),
  target_id: z.string(),
  reason: z.string().optional(),
});

/**
 * Zod schema for revoking an app assignment
 */
const revokeAppSchema = z.object({
  assignment_id: z.string(),
});

/**
 * GET /api/v1/apps
 * Get all apps for the current company with assignment counts
 */
export const getApps = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;

  const apps = await App.find({ company_id: companyId }).sort({ name: 1 }).lean();

  // Enrich with assignment counts
  const appsWithCounts = await Promise.all(
    apps.map(async (app) => {
      const assignmentCount = await AppAssignment.countDocuments({
        company_id: companyId,
        app_id: app._id,
        is_active: true,
      });

      return {
        ...app,
        assignment_count: assignmentCount,
      };
    })
  );

  res.status(200).json({
    success: true,
    data: appsWithCounts,
  });
});

/**
 * GET /api/v1/apps/:id
 * Get a specific app with its assignments
 */
export const getAppById = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const appId = req.params.id;

  const app = await App.findOne({
    _id: appId,
    company_id: companyId,
  }).lean();

  if (!app) {
    throw new AppError('App not found', 404, 'APP_NOT_FOUND');
  }

  // Get active assignments
  const assignments = await AppAssignment.find({
    company_id: companyId,
    app_id: app._id,
    is_active: true,
  }).lean();

  res.status(200).json({
    success: true,
    data: {
      ...app,
      assignments,
    },
  });
});

/**
 * POST /api/v1/apps
 * Create a new app
 */
export const createApp = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;

  const validated = createAppSchema.parse(req.body);

  // Check for duplicate slug
  const existingApp = await App.findOne({
    company_id: companyId,
    slug: validated.slug,
  });

  if (existingApp) {
    throw new AppError('An app with this slug already exists', 409, 'APP_EXISTS');
  }

  const app = await App.create({
    ...validated,
    company_id: companyId,
    is_system_app: false,
    is_active: true,
  });

  // Audit log
  await auditLogger.log({
    req,
    action: 'apps.created',
    module: 'apps',
    object_type: 'App',
    object_id: app._id.toString(),
    object_label: app.name,
    after_state: app,
  });

  res.status(201).json({
    success: true,
    data: app,
  });
});

/**
 * PUT /api/v1/apps/:id
 * Update an app
 */
export const updateApp = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const appId = req.params.id;

  const validated = updateAppSchema.parse(req.body);

  const app = await App.findOne({
    _id: appId,
    company_id: companyId,
  });

  if (!app) {
    throw new AppError('App not found', 404, 'APP_NOT_FOUND');
  }

  const beforeState = { ...app.toObject() };

  Object.assign(app, validated);
  await app.save();

  const afterState = { ...app.toObject() };

  // Audit log
  await auditLogger.log({
    req,
    action: 'apps.updated',
    module: 'apps',
    object_type: 'App',
    object_id: app._id.toString(),
    object_label: app.name,
    before_state: beforeState,
    after_state: afterState,
  });

  res.status(200).json({
    success: true,
    data: app,
  });
});

/**
 * DELETE /api/v1/apps/:id
 * Delete an app (only if no active assignments)
 */
export const deleteApp = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const appId = req.params.id;

  const app = await App.findOne({
    _id: appId,
    company_id: companyId,
  });

  if (!app) {
    throw new AppError('App not found', 404, 'APP_NOT_FOUND');
  }

  // Check for active assignments
  const activeAssignments = await AppAssignment.countDocuments({
    company_id: companyId,
    app_id: appId,
    is_active: true,
  });

  if (activeAssignments > 0) {
    throw new AppError(
      `Cannot delete app: ${activeAssignments} active assignment(s) exist. Revoke all assignments first.`,
      409,
      'APP_HAS_ASSIGNMENTS'
    );
  }

  const beforeState = { ...app.toObject() };
  await App.deleteOne({ _id: appId });

  // Audit log
  await auditLogger.log({
    req,
    action: 'apps.deleted',
    module: 'apps',
    object_type: 'App',
    object_id: app._id.toString(),
    object_label: app.name,
    before_state: beforeState,
  });

  res.status(200).json({
    success: true,
    data: null,
  });
});

/**
 * POST /api/v1/apps/:id/assign
 * Assign an app to a role, department, group, or user.
 * Propagates access to all users with the target role/dept/group.
 */
export const assignApp = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const appId = req.params.id;

  const validated = assignAppSchema.parse(req.body);

  // Verify app exists
  const app = await App.findOne({
    _id: appId,
    company_id: companyId,
  });

  if (!app) {
    throw new AppError('App not found', 404, 'APP_NOT_FOUND');
  }

  // Verify target exists
  if (validated.target_type === 'role') {
    const role = await Role.findOne({
      _id: new Types.ObjectId(validated.target_id),
      company_id: companyId,
    });
    if (!role) {
      throw new AppError('Target role not found', 404, 'TARGET_NOT_FOUND');
    }
  } else if (validated.target_type === 'department') {
    const dept = await Department.findOne({
      _id: new Types.ObjectId(validated.target_id),
      company_id: companyId,
    });
    if (!dept) {
      throw new AppError('Target department not found', 404, 'TARGET_NOT_FOUND');
    }
  } else if (validated.target_type === 'user') {
    const user = await User.findOne({
      _id: new Types.ObjectId(validated.target_id),
      company_id: companyId,
    });
    if (!user) {
      throw new AppError('Target user not found', 404, 'TARGET_NOT_FOUND');
    }
  }

  // Check for duplicate active assignment
  const existingAssignment = await AppAssignment.findOne({
    company_id: companyId,
    app_id: appId,
    target_type: validated.target_type,
    target_id: new Types.ObjectId(validated.target_id),
    is_active: true,
  });

  if (existingAssignment) {
    throw new AppError('App is already assigned to this target', 409, 'ASSIGNMENT_EXISTS');
  }

  // Create assignment
  const assignmentData = {
    company_id: companyId,
    app_id: appId,
    target_type: validated.target_type,
    target_id: validated.target_id,
    granted_by: req.user!.userId,
    granted_at: new Date(),
    is_active: true,
    reason: validated.reason,
  };
  
  const assignment = await AppAssignment.create(assignmentData) as IAppAssignment;

  // Calculate affected users count
  let affectedUsers = 0;
  const targetIdObj = new Types.ObjectId(validated.target_id);
  
  if (validated.target_type === 'role') {
    affectedUsers = await UserRole.countDocuments({
      role_id: targetIdObj,
      company_id: new Types.ObjectId(companyId),
    });
  } else if (validated.target_type === 'department') {
    affectedUsers = await User.countDocuments({
      company_id: companyId,
      department_id: targetIdObj,
      is_active: true,
    });
  } else if (validated.target_type === 'user') {
    affectedUsers = 1;
  }

  // Audit log
  await auditLogger.log({
    req,
    action: 'apps.assigned',
    module: 'apps',
    object_type: 'AppAssignment',
    object_id: (assignment as IAppAssignment)._id.toString(),
    object_label: `${app.name} -> ${validated.target_type}:${validated.target_id}`,
    after_state: {
      assignment: (assignment as IAppAssignment).toObject(),
      affected_users: affectedUsers,
    },
  });

  res.status(201).json({
    success: true,
    data: {
      assignment: assignment as IAppAssignment,
      affected_users: affectedUsers,
    },
  });
});

/**
 * POST /api/v1/apps/:id/revoke
 * Revoke an app assignment
 */
export const revokeApp = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const appId = req.params.id;

  const validated = revokeAppSchema.parse(req.body);

  // Verify app exists
  const app = await App.findOne({
    _id: appId,
    company_id: companyId,
  });

  if (!app) {
    throw new AppError('App not found', 404, 'APP_NOT_FOUND');
  }

  // Find assignment
  const assignment = await AppAssignment.findOne({
    _id: validated.assignment_id,
    company_id: companyId,
    app_id: appId,
    is_active: true,
  });

  if (!assignment) {
    throw new AppError('Active assignment not found', 404, 'ASSIGNMENT_NOT_FOUND');
  }

  const beforeState = { ...assignment.toObject() };

  // Revoke (soft delete)
  assignment.is_active = false;
  assignment.revoked_by = new Types.ObjectId(req.user!.userId);
  assignment.revoked_at = new Date();
  await assignment.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'apps.revoked',
    module: 'apps',
    object_type: 'AppAssignment',
    object_id: assignment._id.toString(),
    object_label: `${app.name} <- ${assignment.target_type}:${assignment.target_id}`,
    before_state: beforeState,
    after_state: { ...assignment.toObject() },
  });

  res.status(200).json({
    success: true,
    data: assignment,
  });
});

/**
 * GET /api/v1/apps/:id/timeline
 * Get full grant/revoke history for an app
 */
export const getAppAssignmentTimeline = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const appId = req.params.id;

  // Verify app exists
  const app = await App.findOne({
    _id: appId,
    company_id: companyId,
  });

  if (!app) {
    throw new AppError('App not found', 404, 'APP_NOT_FOUND');
  }

  // Get all assignments (active and inactive) with pagination
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;

  const assignments = await AppAssignment.find({
    company_id: companyId,
    app_id: appId,
  })
    .sort({ granted_at: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await AppAssignment.countDocuments({
    company_id: companyId,
    app_id: appId,
  });

  // Enrich with grantor/revoker info
  const enrichedAssignments = await Promise.all(
    assignments.map(async (assignment) => {
      const grantedBy = await User.findById(assignment.granted_by)
        .select('full_name email')
        .lean();

      let revokedBy = null;
      if (assignment.revoked_by) {
        revokedBy = await User.findById(assignment.revoked_by)
          .select('full_name email')
          .lean();
      }

      return {
        ...assignment,
        granted_by_info: grantedBy,
        revoked_by_info: revokedBy,
      };
    })
  );

  res.status(200).json({
    success: true,
    data: {
      assignments: enrichedAssignments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * GET /api/v1/apps/:id/dependencies
 * Check if app dependencies are met for a target
 */
export const checkAppDependencies = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const appId = req.params.id;
  const targetType = req.query.target_type as string;
  const targetId = req.query.target_id as string;

  if (!targetType || !targetId) {
    throw new AppError('target_type and target_id query parameters are required', 400, 'MISSING_PARAMS');
  }

  // Get app with dependencies
  const app = await App.findOne({
    _id: appId,
    company_id: companyId,
  }).lean();

  if (!app) {
    throw new AppError('App not found', 404, 'APP_NOT_FOUND');
  }

  if (!app.dependencies || app.dependencies.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        has_dependencies: false,
        dependencies_met: true,
        missing_dependencies: [],
      },
    });
  }

  // Get dependency apps
  const dependencyApps = await App.find({
    company_id: companyId,
    slug: { $in: app.dependencies },
  }).lean();

  const dependencySlugs = dependencyApps.map((d) => d.slug);
  const missingSlugs = app.dependencies.filter(
    (dep) => !dependencySlugs.includes(dep)
  );

  // Check which dependencies are assigned to the target
  const assignedDeps = await AppAssignment.find({
    company_id: companyId,
    app_id: { $in: dependencyApps.map((d) => d._id) },
    target_type: targetType,
    target_id: targetId,
    is_active: true,
  }).lean();

  const assignedSlugs = assignedDeps
    .map((a) => dependencyApps.find((d) => d._id.equals(a.app_id))?.slug)
    .filter(Boolean);

  const unmetDependencies = app.dependencies.filter(
    (dep) => !assignedSlugs.includes(dep)
  );

  res.status(200).json({
    success: true,
    data: {
      has_dependencies: true,
      dependencies_met: unmetDependencies.length === 0,
      required: app.dependencies,
      assigned: assignedSlugs,
      missing: [...unmetDependencies, ...missingSlugs],
    },
  });
});

/**
 * GET /api/v1/apps/:id/users
 * Get all users who have access to an app (directly or via role/dept)
 */
export const getAppUsers = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const appId = req.params.id;

  // Get active assignments
  const assignments = await AppAssignment.find({
    company_id: companyId,
    app_id: appId,
    is_active: true,
  }).lean();

  const userIds = new Set<string>();

  // Collect user IDs from assignments
  for (const assignment of assignments) {
    if (assignment.target_type === 'user') {
      userIds.add(assignment.target_id.toString());
    } else if (assignment.target_type === 'role') {
      const userRoles = await UserRole.find({ role_id: assignment.target_id, company_id: companyId }).lean();
      userRoles.forEach((ur) => userIds.add(ur.user_id.toString()));
    } else if (assignment.target_type === 'department') {
      const users = await User.find({
        company_id: companyId,
        department_id: assignment.target_id,
        is_active: true,
      })
        .select('_id')
        .lean();
      users.forEach((u) => userIds.add(u._id.toString()));
    }
  }

  // Get user details
  const users = await User.find({
    _id: { $in: Array.from(userIds) },
    company_id: companyId,
  })
    .select('full_name email employee_id department_id lifecycle_state')
    .lean();

  res.status(200).json({
    success: true,
    data: users,
  });
});
