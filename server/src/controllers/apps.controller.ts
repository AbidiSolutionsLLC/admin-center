// server/src/controllers/apps.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { auditLogger } from '../lib/auditLogger';
import { escapeRegExp } from '../utils/regex';
import { App, IApp } from '../models/App.model';
import { PERMISSION_GROUPS } from '../constants/roles';
import { AppAssignment, IAppAssignment } from '../models/AppAssignment.model';
import { User } from '../models/User.model';
import { Role } from '../models/Role.model';
import { Department } from '../models/Department.model';
import { UserRole } from '../models/UserRole.model';
import { Group } from '../models/Group.model';
import { GroupMember } from '../models/GroupMember.model';
import { Types } from 'mongoose';

/**
 * Whitelist of allowed attribute names for attribute-based app assignments.
 * Prevents prototype pollution and NoSQL operator injection via dynamic keys.
 */
const ALLOWED_ATTRIBUTE_NAMES = [
  'department_id',
  'lifecycle_state',
  'domain',
  'job_title',
  'employment_type',
  'location_id',
] as const;

const getUserAccessibleAppIds = async (userId: string, companyId: string): Promise<Types.ObjectId[]> => {
  const user = await User.findById(userId).lean();
  if (!user) return [];

  const userRoles = await UserRole.find({ user_id: userId, company_id: companyId }).lean();
  const directRoleIds = userRoles.map(ur => ur.role_id);

  // 1. Recursive traversal for roles (no array mutation during iteration)
  const allRoleIds = new Set<string>();
  let currentRoleIds = directRoleIds.map(id => id.toString());

  while (currentRoleIds.length > 0) {
    const roles = await Role.find({
      _id: { $in: currentRoleIds.map(id => new Types.ObjectId(id)) },
      company_id: companyId
    }).lean();

    const nextRoleIds: string[] = [];
    for (const role of roles) {
      allRoleIds.add(role._id.toString());
      if (role.parent_role_id && !allRoleIds.has(role.parent_role_id.toString())) {
        nextRoleIds.push(role.parent_role_id.toString());
      }
    }
    currentRoleIds = nextRoleIds;
  }

  // 2. Recursive traversal for departments (no array mutation during iteration)
  const allDeptIds = new Set<string>();
  let currentDeptIds = user.department_id ? [user.department_id.toString()] : [];

  while (currentDeptIds.length > 0) {
    const depts = await Department.find({
      _id: { $in: currentDeptIds.map(id => new Types.ObjectId(id)) },
      company_id: companyId
    }).lean();

    const nextDeptIds: string[] = [];
    for (const dept of depts) {
      allDeptIds.add(dept._id.toString());
      if (dept.parent_id && !allDeptIds.has(dept.parent_id.toString())) {
        nextDeptIds.push(dept.parent_id.toString());
      }
    }
    currentDeptIds = nextDeptIds;
  }

  const userGroups = await GroupMember.find({ user_id: userId }).lean();
  const groupIds = userGroups.map(ug => ug.group_id);

  const targets: any[] = [
    { target_type: 'user', target_id: user._id },
    ...Array.from(allRoleIds).map(id => ({ target_type: 'role', target_id: new Types.ObjectId(id) })),
    ...Array.from(allDeptIds).map(id => ({ target_type: 'department', target_id: new Types.ObjectId(id) })),
    ...groupIds.map(id => ({ target_type: 'group', target_id: id }))
  ];

  // Find attribute-based assignments
  const attributeAssignments = await AppAssignment.find({
    company_id: companyId,
    is_active: true,
    target_type: 'attribute'
  }).lean();

  const userDomain = user.email ? user.email.split('@')[1]?.toLowerCase() : '';

  const matchedAttributeIds = attributeAssignments
    .filter(a => {
       if (a.attribute_name === 'domain') {
          return userDomain === String(a.attribute_value).toLowerCase();
       }
       const userVal = String(user[a.attribute_name as keyof typeof user] || (user as any).custom_fields?.[a.attribute_name as string]);
       return userVal === String(a.attribute_value);
    })
    .map(a => a._id);

  if (matchedAttributeIds.length > 0) {
    targets.push({ _id: { $in: matchedAttributeIds } });
  }

  const assignments = await AppAssignment.find({
    company_id: companyId,
    is_active: true,
    $or: targets
  }).select('app_id').lean();

  return assignments.map(a => a.app_id as Types.ObjectId);
};

/**
 * Zod schema for creating an app
 */
const createAppSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(100),
  slug: z.string().trim().min(1, 'Required').max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().optional(),
  icon_url: z.string().trim().url().optional(),
  category: z.string().trim().min(1, 'Required'),
  provider: z.string().trim().optional(),
  dependencies: z.array(z.string().trim()).optional(),
  owner_id: z.string().trim().optional(),
});

/**
 * Zod schema for updating an app
 */
const updateAppSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().optional(),
  icon_url: z.string().trim().url().optional(),
  category: z.string().trim().min(1).optional(),
  provider: z.string().trim().optional(),
  status: z.enum(['active', 'inactive', 'maintenance']).optional(),
  dependencies: z.array(z.string().trim()).optional(),
  owner_id: z.string().trim().optional(),
  is_active: z.boolean().optional(),
});

/**
 * Zod schema for assigning an app
 */
const assignAppSchema = z.object({
  target_type: z.enum(['role', 'department', 'group', 'user', 'attribute']),
  target_id: z.string().trim().optional(),
  attribute_name: z.string().trim().optional(),
  attribute_value: z.string().trim().optional(),
  reason: z.string().trim().optional(),
}).refine(data => {
  if (data.target_type === 'attribute') {
    return !!data.attribute_name && !!data.attribute_value;
  }
  return !!data.target_id;
}, "Missing required fields for target type");

/**
 * Zod schema for revoking an app assignment
 */
const revokeAppSchema = z.object({
  assignment_id: z.string().trim().min(1, 'Required'),
});

/**
 * GET /api/v1/apps
 * Get all apps for the current company with assignment counts
 */
export const getApps = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;

  const search = req.query.search as string;
  const status = req.query.status as string;
  const category = req.query.category as string;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 12;
  const skip = (page - 1) * limit;

  // Justification: user_role is populated by auth middleware but types might mismatch with ROLES
  const isItAdmin = PERMISSION_GROUPS.IT_ADMINS.includes((req.user as any)?.user_role);
  const isOpsAdmin = PERMISSION_GROUPS.OPS_ADMINS.includes((req.user as any)?.user_role);

  // Find system apps (no company_id) and company-specific apps
  const query: any = {
    $or: [{ company_id: companyId }, { company_id: { $exists: false } }],
  };

  if (!isItAdmin) {
    query.is_active = true;
    query.status = { $ne: 'inactive' };
  }

  if (!isItAdmin && !isOpsAdmin) {
    const accessibleAppIds = await getUserAccessibleAppIds(req.user!.userId, companyId);
    if (query.$and) {
      query.$and.push({ _id: { $in: accessibleAppIds } });
    } else {
      query._id = { $in: accessibleAppIds };
    }
  }

  if (search) {
    const sanitizedSearch = escapeRegExp(search);
    query.$and = [
      {
        $or: [
          { name: { $regex: sanitizedSearch, $options: 'i' } },
          { category: { $regex: sanitizedSearch, $options: 'i' } },
          { description: { $regex: sanitizedSearch, $options: 'i' } },
        ],
      },
    ];
  }

  if (status) {
    if (query.$and) {
      query.$and.push({ status });
    } else {
      query.status = status;
    }
  }

  if (category) {
    if (query.$and) {
      query.$and.push({ category });
    } else {
      query.category = category;
    }
  }

  const total = await App.countDocuments(query);

  const apps = await App.find(query)
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Batch-fetch assignment counts in a single aggregation (prevents N+1)
  const appIds = apps.map((a) => a._id);
  const countAgg = await AppAssignment.aggregate([
    { $match: { company_id: new Types.ObjectId(companyId), app_id: { $in: appIds }, is_active: true } },
    { $group: { _id: '$app_id', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(countAgg.map((c) => [c._id.toString(), c.count as number]));

  // Batch-fetch owner info for apps that have an owner_id
  const ownerIds = apps.filter((a) => a.owner_id).map((a) => a.owner_id!);
  const owners = ownerIds.length > 0
    ? await User.find({ _id: { $in: ownerIds } }).select('full_name email').lean()
    : [];
  const ownerMap = new Map(owners.map((o) => [o._id.toString(), o]));

  const appsWithCounts = apps.map((app) => ({
    ...app,
    assignment_count: countMap.get(app._id.toString()) ?? 0,
    owner_info: app.owner_id ? (ownerMap.get(app.owner_id.toString()) ?? null) : null,
  }));

  res.status(200).json({
    success: true,
    data: appsWithCounts,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
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
    $or: [{ company_id: companyId }, { company_id: { $exists: false } }],
  }).lean();

  if (!app) {
    throw new AppError('App not found', 404, 'APP_NOT_FOUND');
  }

  // Justification: user_role is populated by auth middleware but types might mismatch with ROLES
  const isItAdmin = PERMISSION_GROUPS.IT_ADMINS.includes((req.user as any)?.user_role);
  const isOpsAdmin = PERMISSION_GROUPS.OPS_ADMINS.includes((req.user as any)?.user_role);

  if ((!app.is_active || app.status === 'inactive') && !isItAdmin) {
    throw new AppError('App is disabled', 403, 'APP_DISABLED');
  }

  if (!isItAdmin && !isOpsAdmin) {
    const accessibleAppIds = await getUserAccessibleAppIds(req.user!.userId, companyId);
    const hasAccess = accessibleAppIds.some(id => id.equals(app._id as Types.ObjectId));
    if (!hasAccess) {
      throw new AppError('You do not have access to this app', 403, 'APP_FORBIDDEN');
    }
  }

  // Get active assignments
  const assignments = await AppAssignment.find({
    company_id: companyId,
    app_id: app._id,
    is_active: true,
  }).lean();

  // Enrich assignments with target names
  const enrichedAssignments = await Promise.all(
    assignments.map(async (assignment) => {
      let target_name = '';
      if (assignment.target_type === 'role') {
        const role = await Role.findById(assignment.target_id).select('name').lean();
        target_name = role ? role.name : 'Unknown Role';
      } else if (assignment.target_type === 'department') {
        const dept = await Department.findById(assignment.target_id).select('name').lean();
        target_name = dept ? dept.name : 'Unknown Department';
      } else if (assignment.target_type === 'user') {
        const user = await User.findById(assignment.target_id).select('full_name').lean();
        target_name = user ? user.full_name : 'Unknown User';
      } else if (assignment.target_type === 'group') {
        const group = await Group.findById(assignment.target_id).select('name').lean();
        target_name = group ? group.name : 'Unknown Group';
      }
      return {
        ...assignment,
        target_name,
      };
    })
  );

  let owner_info = null;
  if (app.owner_id) {
    owner_info = await User.findById(app.owner_id)
      .select('full_name email')
      .lean();
  }

  res.status(200).json({
    success: true,
    data: {
      ...app,
      owner_info,
      assignments: enrichedAssignments,
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

  // Check for duplicate slug or name
  const existingApp = await App.findOne({
    company_id: companyId,
    $or: [
      { slug: validated.slug },
      { name: { $regex: `^${escapeRegExp(validated.name)}$`, $options: 'i' } }
    ]
  });

  if (existingApp) {
    throw new AppError('An app with this name or slug already exists', 409, 'APP_EXISTS');
  }

  const app = await App.create({
    ...validated,
    company_id: companyId,
    is_system_app: false,
    is_active: true,
  });

  // Audit log — only include non-sensitive, non-internal fields
  await auditLogger.log({
    req,
    action: 'apps.created',
    module: 'apps',
    object_type: 'App',
    object_id: app._id.toString(),
    object_label: app.name,
    after_state: {
      name: app.name,
      slug: app.slug,
      category: app.category,
      provider: app.provider,
      status: app.status,
      is_active: app.is_active,
    },
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
    $or: [{ company_id: companyId }, { company_id: { $exists: false } }],
  });

  if (!app) {
    throw new AppError('App not found', 404, 'APP_NOT_FOUND');
  }

  const beforeState = { ...app.toObject() };

  const deactivating = 
    (validated.is_active === false && app.is_active !== false) ||
    (validated.status === 'inactive' && app.status !== 'inactive');

  if (deactivating) {
    // Check if any other active app depends on this app (by slug)
    const dependentApps = await App.find({
      company_id: companyId,
      is_active: true,
      status: { $ne: 'inactive' },
      _id: { $ne: app._id },
      dependencies: app.slug,
    }).select('name').lean();

    if (dependentApps.length > 0) {
      const dependentNames = dependentApps.map(a => a.name).join(', ');
      throw new AppError(
        `Cannot disable app "${app.name}" because the following active app(s) depend on it: ${dependentNames}`,
        400,
        'DEPENDENCY_CONFLICT'
      );
    }
  }

  Object.assign(app, validated);
  await app.save();

  const afterState = { ...app.toObject() };

  let action = 'apps.updated';
  if (validated.is_active === true && beforeState.is_active === false) {
    action = 'apps.enabled';
  } else if (validated.is_active === false && beforeState.is_active === true) {
    action = 'apps.disabled';
  } else if (validated.status === 'inactive' && beforeState.status !== 'inactive') {
    action = 'apps.disabled';
  } else if (validated.status !== 'inactive' && beforeState.status === 'inactive') {
    action = 'apps.enabled';
  }

  // Audit log
  await auditLogger.log({
    req,
    action,
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
      `Cannot delete: ${activeAssignments} active assignment(s) still assigned`,
      400,
      'HAS_DEPENDENTS'
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

  if (!app.is_active || app.status === 'inactive') {
    throw new AppError('Cannot assign a disabled app. Enable it first.', 400, 'APP_DISABLED');
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
    // Bug fix (similar to SOWAYE-7-C): also enforce is_active so terminated users cannot receive new assignments
    const user = await User.findOne({
      _id: new Types.ObjectId(validated.target_id),
      company_id: companyId,
      is_active: true,
    });
    if (!user) {
      throw new AppError('Target user not found or account is inactive', 404, 'TARGET_NOT_FOUND');
    }
  } else if (validated.target_type === 'group') {
    const group = await Group.findOne({
      _id: new Types.ObjectId(validated.target_id),
      company_id: companyId,
    });
    if (!group) {
      throw new AppError('Target group not found', 404, 'TARGET_NOT_FOUND');
    }
  } else if (validated.target_type === 'attribute') {
    // Bug fix: whitelist attribute_name to prevent prototype pollution / NoSQL operator injection
    if (!ALLOWED_ATTRIBUTE_NAMES.includes(validated.attribute_name as any)) {
      throw new AppError(
        `Invalid attribute_name "${validated.attribute_name}". Allowed values: ${ALLOWED_ATTRIBUTE_NAMES.join(', ')}`,
        400,
        'INVALID_ATTRIBUTE_NAME'
      );
    }
  }

  // Check for duplicate active assignment
  const existingAssignment = await AppAssignment.findOne({
    company_id: companyId,
    app_id: appId,
    target_type: validated.target_type,
    ...(validated.target_type === 'attribute' ? {
      attribute_name: validated.attribute_name,
      attribute_value: validated.attribute_value
    } : {
      target_id: new Types.ObjectId(validated.target_id)
    }),
    is_active: true,
  });

  if (existingAssignment) {
    throw new AppError('App is already assigned to this target', 409, 'ASSIGNMENT_EXISTS');
  }

  // --- Check Dependencies ---
  if (app.dependencies && app.dependencies.length > 0) {
    const dependencyApps = await App.find({
      company_id: companyId,
      slug: { $in: app.dependencies },
    }).lean();

    const assignedDeps = await AppAssignment.find({
      company_id: companyId,
      app_id: { $in: dependencyApps.map((d) => d._id) },
      target_type: validated.target_type,
      ...(validated.target_type === 'attribute' ? {
        attribute_name: validated.attribute_name,
        attribute_value: validated.attribute_value
      } : {
        target_id: new Types.ObjectId(validated.target_id)
      }),
      is_active: true,
    }).lean();

    const assignedSlugs = assignedDeps
      .map((a) => dependencyApps.find((d) => d._id.equals(a.app_id))?.slug)
      .filter(Boolean);

    const unmetDependencies = app.dependencies.filter(
      (dep) => !assignedSlugs.includes(dep)
    );

    if (unmetDependencies.length > 0) {
      throw new AppError(`Missing dependencies: ${unmetDependencies.join(', ')}`, 400, 'DEPENDENCY_VIOLATION');
    }
  }

  // --- Check Conflicts ---
  const targetAssignments = await AppAssignment.find({
    company_id: companyId,
    target_type: validated.target_type,
    ...(validated.target_type === 'attribute' ? {
      attribute_name: validated.attribute_name,
      attribute_value: validated.attribute_value
    } : {
      target_id: new Types.ObjectId(validated.target_id)
    }),
    is_active: true,
  }).lean();

  const assignedAppIds = targetAssignments.map((a) => a.app_id);
  const existingAssignedApps = await App.find({
    _id: { $in: assignedAppIds }
  }).lean();

  const existingAssignedAppSlugs = existingAssignedApps.map((a) => a.slug);
  const conflictingApps = new Set<string>();

  if (app.mutually_exclusive && app.mutually_exclusive.length > 0) {
    app.mutually_exclusive.forEach((slug) => {
      if (existingAssignedAppSlugs.includes(slug)) conflictingApps.add(slug);
    });
  }

  for (const assignedApp of existingAssignedApps) {
    if (assignedApp.mutually_exclusive && assignedApp.mutually_exclusive.includes(app.slug)) {
      conflictingApps.add(assignedApp.slug);
    }
  }

  if (conflictingApps.size > 0) {
    throw new AppError(`Conflicting app assignments: ${Array.from(conflictingApps).join(', ')}`, 409, 'CONFLICTING_APP');
  }

  // Create assignment
  const assignmentData = {
    company_id: companyId,
    app_id: appId,
    target_type: validated.target_type,
    ...(validated.target_type === 'attribute' ? {
      attribute_name: validated.attribute_name,
      attribute_value: validated.attribute_value
    } : {
      target_id: validated.target_id
    }),
    granted_by: req.user!.userId,
    granted_at: new Date(),
    is_active: true,
    reason: validated.reason,
  };
  
  const assignment = await AppAssignment.create(assignmentData) as IAppAssignment;

  // Calculate affected users count
  let affectedUsers = 0;
  
  if (validated.target_type === 'role') {
    const targetIdObj = new Types.ObjectId(validated.target_id!);
    affectedUsers = await UserRole.countDocuments({
      role_id: targetIdObj,
      company_id: new Types.ObjectId(companyId),
    });
  } else if (validated.target_type === 'department') {
    const targetIdObj = new Types.ObjectId(validated.target_id!);
    affectedUsers = await User.countDocuments({
      company_id: companyId,
      department_id: targetIdObj,
      is_active: true,
    });
  } else if (validated.target_type === 'user') {
    affectedUsers = 1;
  } else if (validated.target_type === 'group') {
    const targetIdObj = new Types.ObjectId(validated.target_id!);
    affectedUsers = await GroupMember.countDocuments({
      group_id: targetIdObj,
    });
  } else if (validated.target_type === 'attribute') {
    if (validated.attribute_name === 'domain') {
      const users = await User.find({ company_id: companyId, is_active: true }).select('email').lean();
      affectedUsers = users.filter(u => u.email?.split('@')[1]?.toLowerCase() === validated.attribute_value?.toLowerCase()).length;
    } else {
      affectedUsers = await User.countDocuments({
        company_id: companyId,
        [validated.attribute_name!]: validated.attribute_value,
        is_active: true,
      });
    }
  }

  const targetLabel = validated.target_type === 'attribute' 
    ? `${validated.attribute_name}=${validated.attribute_value}`
    : `${validated.target_type}:${validated.target_id}`;

  // Audit log
  await auditLogger.log({
    req,
    action: 'apps.assigned',
    module: 'apps',
    object_type: 'AppAssignment',
    object_id: (assignment as IAppAssignment)._id.toString(),
    object_label: `${app.name} -> ${targetLabel}`,
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

  const targetLabel = assignment.target_type === 'attribute' 
    ? `${assignment.attribute_name}=${assignment.attribute_value}`
    : `${assignment.target_type}:${assignment.target_id}`;

  // Audit log
  await auditLogger.log({
    req,
    action: 'apps.revoked',
    module: 'apps',
    object_type: 'AppAssignment',
    object_id: assignment._id.toString(),
    object_label: `${app.name} <- ${targetLabel}`,
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

  // Verify app exists (support company-scoped and system-scoped apps)
  const app = await App.findOne({
    _id: appId,
    $or: [{ company_id: companyId }, { company_id: { $exists: false } }],
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

  // Batch-fetch grantor and revoker info to eliminate N+1 queries
  const grantorIds = assignments.map((a) => a.granted_by).filter(Boolean);
  const revokerIds = assignments.map((a) => a.revoked_by).filter(Boolean) as Types.ObjectId[];
  const allUserIds = [...new Set([...grantorIds.map(String), ...revokerIds.map(String)])];

  const allUsers = allUserIds.length > 0
    ? await User.find({ _id: { $in: allUserIds } }).select('full_name email').lean()
    : [];
  const userInfoMap = new Map(allUsers.map((u) => [u._id.toString(), u]));

  const enrichedAssignments = assignments.map((assignment) => ({
    ...assignment,
    granted_by_info: assignment.granted_by ? (userInfoMap.get(assignment.granted_by.toString()) ?? null) : null,
    revoked_by_info: assignment.revoked_by ? (userInfoMap.get(assignment.revoked_by.toString()) ?? null) : null,
  }));

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
  const attributeName = req.query.attribute_name as string;
  const attributeValue = req.query.attribute_value as string;

  if (!targetType) {
    throw new AppError('target_type query parameter is required', 400, 'MISSING_PARAMS');
  }
  if (targetType !== 'attribute' && !targetId) {
    throw new AppError('target_id query parameter is required', 400, 'MISSING_PARAMS');
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

  // Get dependency apps — include system apps (no company_id) to avoid false "missing dependency" results
  const dependencyApps = await App.find({
    $or: [{ company_id: companyId }, { company_id: { $exists: false } }],
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
    ...(targetType === 'attribute' ? {
      attribute_name: attributeName,
      attribute_value: attributeValue
    } : {
      target_id: new Types.ObjectId(targetId)
    }),
    is_active: true,
  }).lean();

  const assignedSlugs = assignedDeps
    .map((a) => dependencyApps.find((d) => d._id.equals(a.app_id))?.slug)
    .filter(Boolean);

  const unmetDependencies = app.dependencies ? app.dependencies.filter(
    (dep) => !assignedSlugs.includes(dep)
  ) : [];

  // Check for conflicts
  const targetAssignments = await AppAssignment.find({
    company_id: companyId,
    target_type: targetType,
    ...(targetType === 'attribute' ? {
      attribute_name: attributeName,
      attribute_value: attributeValue
    } : {
      target_id: new Types.ObjectId(targetId)
    }),
    is_active: true,
  }).lean();

  const assignedAppIds = targetAssignments.map((a) => a.app_id);
  const existingAssignedApps = await App.find({
    _id: { $in: assignedAppIds }
  }).lean();

  const existingAssignedAppSlugs = existingAssignedApps.map((a) => a.slug);
  const conflictingApps = new Set<string>();

  if (app.mutually_exclusive && app.mutually_exclusive.length > 0) {
    app.mutually_exclusive.forEach((slug) => {
      if (existingAssignedAppSlugs.includes(slug)) conflictingApps.add(slug);
    });
  }

  for (const assignedApp of existingAssignedApps) {
    if (assignedApp.mutually_exclusive && assignedApp.mutually_exclusive.includes(app.slug)) {
      conflictingApps.add(assignedApp.slug);
    }
  }

  const conflictsArray = Array.from(conflictingApps);

  res.status(200).json({
    success: true,
    data: {
      has_dependencies: !!app.dependencies && app.dependencies.length > 0,
      dependencies_met: unmetDependencies.length === 0,
      required: app.dependencies || [],
      assigned: assignedSlugs,
      missing: [...unmetDependencies, ...missingSlugs],
      has_conflicts: conflictsArray.length > 0,
      conflicting_apps: conflictsArray,
    },
  });
});

/**
 * GET /api/v1/apps/target/:target_type/:target_id
 * Get all apps assigned to a specific target
 */
export const getAppAssignmentsByTarget = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const { target_type, target_id } = req.params;

  if (!['role', 'department', 'group', 'user'].includes(target_type)) {
    throw new AppError('Invalid target_type', 400, 'INVALID_PARAMS');
  }

  const assignments = await AppAssignment.find({
    company_id: companyId,
    target_type,
    target_id: new Types.ObjectId(target_id),
    is_active: true,
  }).lean();

  // Batch-fetch app and user info to eliminate N+1 queries
  const assignedAppIds = assignments.map((a) => a.app_id);
  const grantorUserIds = assignments.map((a) => a.granted_by).filter(Boolean);

  const [appsList, grantorsList] = await Promise.all([
    App.find({ _id: { $in: assignedAppIds } }).select('name icon_url slug status is_active category').lean(),
    grantorUserIds.length > 0
      ? User.find({ _id: { $in: grantorUserIds } }).select('full_name email').lean()
      : Promise.resolve([]),
  ]);

  const appMap = new Map(appsList.map((a) => [a._id.toString(), a]));
  const grantorMap = new Map(grantorsList.map((u) => [u._id.toString(), u]));

  const enrichedAssignments = assignments.map((assignment) => ({
    ...assignment,
    app_info: appMap.get(assignment.app_id.toString()) ?? null,
    granted_by_info: assignment.granted_by ? (grantorMap.get(assignment.granted_by.toString()) ?? null) : null,
  }));

  res.status(200).json({
    success: true,
    data: enrichedAssignments,
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

  // Collect user IDs from assignments — bug fix: added missing 'group' case
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
    } else if (assignment.target_type === 'group') {
      // Bug fix: group-based assignments were silently ignored, leaving group members without coverage
      const groupMembers = await GroupMember.find({ group_id: assignment.target_id }).lean();
      groupMembers.forEach((gm) => userIds.add(gm.user_id.toString()));
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
