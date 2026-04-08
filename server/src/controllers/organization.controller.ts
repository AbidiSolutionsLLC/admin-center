// server/src/controllers/organization.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { Department } from '../models/Department.model';
import { User } from '../models/User.model';
import { Team } from '../models/Team.model';
import { auditLogger } from '../lib/auditLogger';
import { runIntelligenceRules } from '../lib/intelligence';
import { AppError } from '../utils/AppError';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const CreateDepartmentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(['business_unit', 'division', 'department', 'team', 'cost_center']),
  parent_id: z.string().optional().nullable(),
  primary_manager_id: z.string().optional().nullable(),
  secondary_manager_id: z.string().optional().nullable(),
});

const UpdateDepartmentSchema = CreateDepartmentSchema.partial();

// Move department schema (only parent_id can change)
const MoveDepartmentSchema = z.object({
  parent_id: z.string().optional().nullable(),
});

// BU-specific schema (type is locked to 'business_unit')
const CreateBUSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  primary_manager_id: z.string().optional().nullable(),
  secondary_manager_id: z.string().optional().nullable(),
});

// User org assignment schema
const AssignUserOrgSchema = z.object({
  department_id: z.string().optional().nullable(),
  team_ids: z.array(z.string()).optional().nullable(),
});

// ── Intelligence helpers ─────────────────────────────────────────────────────

/**
 * Enriches a department list with:
 * - headcount: count of active users in that department
 * - has_intelligence_flag: true if a department has active members but no primary manager
 */
async function enrichDepartments(
  departments: ReturnType<(typeof Department.prototype.toObject)>[]
): Promise<typeof departments> {
  const deptIds = departments.map((d) => d._id);

  // Count active users per department in one aggregation
  const headcounts = await User.aggregate([
    { $match: { department_id: { $in: deptIds }, is_active: true } },
    { $group: { _id: '$department_id', count: { $sum: 1 } } },
  ]);
  const headcountMap = new Map<string, number>(
    headcounts.map((h) => [h._id.toString(), h.count])
  );

  return departments.map((dept) => {
    const headcount = headcountMap.get(dept._id.toString()) ?? 0;
    const has_intelligence_flag = headcount > 0 && !dept.primary_manager_id;
    return { ...dept, headcount, has_intelligence_flag };
  });
}

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /organization
 * Returns all active departments for the requesting company,
 * enriched with headcount and intelligence flags.
 */
export const getDepartments = asyncHandler(async (req: Request, res: Response) => {
  const raw = await Department.find({
    company_id: req.user.company_id,
    is_active: true,
  } as any)
    .populate('primary_manager_id', 'full_name avatar_url')
    .sort({ created_at: 1 })
    .lean();

  const enriched = await enrichDepartments(raw);
  res.status(200).json({ success: true, data: enriched });
});

/**
 * GET /organization/:id
 * Returns a single department by ID, scoped to the company.
 */
export const getDepartmentById = asyncHandler(async (req: Request, res: Response) => {
  const dept = await Department.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  } as any).populate('primary_manager_id', 'full_name avatar_url');

  if (!dept) {
    throw new AppError('Department not found', 404, 'NOT_FOUND');
  }

  res.status(200).json({ success: true, data: dept });
});

/**
 * POST /organization
 * Creates a new department scoped to the requesting company's tenant.
 */
export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateDepartmentSchema.parse(req.body);

  const dept = await Department.create({
    ...input,
    // Normalize empty strings → undefined so Mongoose doesn't store ''
    parent_id: input.parent_id || undefined,
    primary_manager_id: input.primary_manager_id || undefined,
    secondary_manager_id: input.secondary_manager_id || undefined,
    company_id: req.user.company_id,
  } as any);

  await auditLogger.log({
    req,
    action: 'department.created',
    module: 'organization',
    object_type: 'Department',
    object_id: dept._id.toString(),
    object_label: dept.name,
    before_state: null,
    after_state: dept.toObject(),
  });

  // Trigger intelligence rules after department creation
  runIntelligenceRules(req.user.company_id).catch(err => {
    console.error('Intelligence rules failed:', err);
  });

  res.status(201).json({ success: true, data: dept });
});

/**
 * PUT /organization/:id
 * Updates an existing department, scoped to the company tenant.
 */
export const updateDepartment = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateDepartmentSchema.parse(req.body);

  const dept = await Department.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  } as any);

  if (!dept) {
    throw new AppError('Department not found', 404, 'NOT_FOUND');
  }

  const beforeState = dept.toObject();

  // Normalize empty strings → undefined (to allow clearing optional refs)
  const updates: Record<string, unknown> = { ...input };
  if (updates.parent_id === '') updates.parent_id = null;
  if (updates.primary_manager_id === '') updates.primary_manager_id = null;
  if (updates.secondary_manager_id === '') updates.secondary_manager_id = null;

  Object.assign(dept, updates);
  await dept.save();

  await auditLogger.log({
    req,
    action: 'department.updated',
    module: 'organization',
    object_type: 'Department',
    object_id: dept._id.toString(),
    object_label: dept.name,
    before_state: beforeState,
    after_state: dept.toObject(),
  });

  // Trigger intelligence rules after department update
  runIntelligenceRules(req.user.company_id).catch(err => {
    console.error('Intelligence rules failed:', err);
  });

  res.status(200).json({ success: true, data: dept });
});

/**
 * DELETE /organization/:id
 * Soft-deletes (archives) a department. Sets is_active = false.
 */
export const deleteDepartment = asyncHandler(async (req: Request, res: Response) => {
  const dept = await Department.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  } as any);

  if (!dept) {
    throw new AppError('Department not found', 404, 'NOT_FOUND');
  }

  const beforeState = dept.toObject();

  dept.is_active = false;
  await dept.save();

  await auditLogger.log({
    req,
    action: 'department.archived',
    module: 'organization',
    object_type: 'Department',
    object_id: dept._id.toString(),
    object_label: dept.name,
    before_state: beforeState,
    after_state: dept.toObject(),
  });

  // Trigger intelligence rules after department deletion
  runIntelligenceRules(req.user.company_id).catch(err => {
    console.error('Intelligence rules failed:', err);
  });

  res.status(200).json({ success: true, data: {} });
});

/**
 * GET /organization/tree
 * Returns the org tree as a nested structure, with manager populated and
 * intelligence flags included.
 */
export const getOrgTree = asyncHandler(async (req: Request, res: Response) => {
  const raw = await Department.find({
    company_id: req.user.company_id,
    is_active: true,
  } as any)
    .populate('primary_manager_id', 'full_name avatar_url')
    .lean();

  const enriched = await enrichDepartments(raw);

  // Build tree
  const map = new Map<string, typeof enriched[number] & { children: unknown[] }>();
  const tree: (typeof enriched[number] & { children: unknown[] })[] = [];

  enriched.forEach((dept) => {
    map.set(dept._id.toString(), { ...dept, children: [] });
  });

  enriched.forEach((dept) => {
    const node = map.get(dept._id.toString())!;
    if (dept.parent_id && map.has(dept.parent_id.toString())) {
      map.get(dept.parent_id.toString())!.children.push(node);
    } else {
      tree.push(node);
    }
  });

  res.status(200).json({ success: true, data: tree });
});

/**
 * PUT /organization/:id/move
 * Moves a department to a new parent in the hierarchy.
 * Validates:
 * - Cannot move onto own descendant (prevents circular hierarchy)
 * - Produces audit event: department.moved
 */
export const moveDepartment = asyncHandler(async (req: Request, res: Response) => {
  const input = MoveDepartmentSchema.parse(req.body);

  const dept = await Department.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  } as any);

  if (!dept) {
    throw new AppError('Department not found', 404, 'NOT_FOUND');
  }

  const beforeState = dept.toObject();
  const oldParentId = dept.parent_id;

  // If parent_id is changing, validate no circular reference
  if (input.parent_id !== undefined && input.parent_id !== oldParentId?.toString()) {
    // Check for circular reference: new parent cannot be a descendant of this department
    if (input.parent_id) {
      const isDescendant = await isDescendantOf(dept._id.toString(), input.parent_id);
      if (isDescendant) {
        throw new AppError(
          'Cannot move department to one of its own descendants. This would create a circular hierarchy.',
          400,
          'CIRCULAR_HIERARCHY'
        );
      }
    }

    dept.parent_id = input.parent_id || undefined;
  }

  await dept.save();

  await auditLogger.log({
    req,
    action: 'department.moved',
    module: 'organization',
    object_type: 'Department',
    object_id: dept._id.toString(),
    object_label: dept.name,
    before_state: { parent_id: oldParentId?.toString() ?? null },
    after_state: { parent_id: dept.parent_id?.toString() ?? null },
  });

  runIntelligenceRules(req.user.company_id).catch(err => {
    console.error('Intelligence rules failed:', err);
  });

  res.status(200).json({ success: true, data: dept });
});

/**
 * Helper: Checks if targetId is a descendant of deptId.
 * Traverses all children recursively to prevent circular hierarchy.
 */
async function isDescendantOf(deptId: string, targetId: string): Promise<boolean> {
  // Get direct children of deptId
  const children = await Department.find({
    parent_id: deptId,
    is_active: true,
  } as any).lean();

  for (const child of children) {
    if (child._id.toString() === targetId) return true;
    // Recursively check grandchildren
    if (await isDescendantOf(child._id.toString(), targetId)) return true;
  }

  return false;
}

/**
 * GET /organization/bu-tree
 * Returns full hierarchy tree for all Business Units: BU → Departments → Teams
 */
export const getBUTree = asyncHandler(async (req: Request, res: Response) => {
  // Get all active BUs
  const bus = await Department.find({
    company_id: req.user.company_id,
    type: 'business_unit',
    is_active: true,
  } as any)
    .populate('primary_manager_id', 'full_name avatar_url')
    .sort({ created_at: 1 })
    .lean();

  // Get all active departments (excluding BUs)
  const departments = await Department.find({
    company_id: req.user.company_id,
    type: { $in: ['division', 'department', 'cost_center'] },
    is_active: true,
  } as any)
    .populate('primary_manager_id', 'full_name avatar_url')
    .sort({ created_at: 1 })
    .lean();

  // Get all active teams
  const teams = await Team.find({
    company_id: req.user.company_id,
    is_active: true,
  } as any)
    .populate('team_lead_id', 'full_name avatar_url')
    .sort({ created_at: 1 })
    .lean();

  // Enrich departments with headcount and flags
  const enrichedDepts = await enrichDepartments(departments);

  // Build hierarchy: BU → Departments → Teams
  const buTree = bus.map((bu) => {
    // Find direct children and all descendants
    const allDescendants = enrichedDepts.filter((d) => {
      // Check if this dept is under this BU (direct or indirect)
      let current = d;
      while (current.parent_id) {
        if (current.parent_id.toString() === bu._id.toString()) return true;
        const parent = enrichedDepts.find((p) => p._id.toString() === current.parent_id?.toString());
        if (!parent) break;
        current = parent;
      }
      return false;
    });

    // Build nested structure
    interface DeptTreeNode {
      _id: string;
      name: string;
      slug: string;
      type: string;
      parent_id?: string;
      primary_manager?: { full_name: string; avatar_url?: string };
      headcount?: number;
      has_intelligence_flag?: boolean;
      teams: typeof teams;
      team_count: number;
      children: DeptTreeNode[];
    }

    const buildDeptTree = (parentId: string): DeptTreeNode[] => {
      const children = allDescendants.filter(
        (d) => d.parent_id?.toString() === parentId
      );
      return children.map((child): DeptTreeNode => {
        const deptTeams = teams.filter(
          (t) => t.department_id?.toString() === child._id.toString()
        );
        return {
          ...child,
          teams: deptTeams,
          team_count: deptTeams.length,
          children: buildDeptTree(child._id.toString()),
        };
      });
    };

    // Get direct children of BU
    const directChildren = allDescendants.filter(
      (d) => d.parent_id?.toString() === bu._id.toString()
    );

    const children = directChildren.map((child) => {
      const deptTeams = teams.filter(
        (t) => t.department_id?.toString() === child._id.toString()
      );
      return {
        ...child,
        teams: deptTeams,
        team_count: deptTeams.length,
        children: buildDeptTree(child._id.toString()),
      };
    });

    const deptCount = allDescendants.length;
    const teamCount = teams.filter((t) =>
      allDescendants.some((d) => d._id.toString() === t.department_id?.toString())
    ).length;

    return {
      ...bu,
      children,
      dept_count: deptCount,
      team_count: teamCount,
    };
  });

  res.status(200).json({ success: true, data: buTree });
});

/**
 * GET /organization/business-units
 * Returns all BUs with dept + team counts
 */
export const getBusinessUnits = asyncHandler(async (req: Request, res: Response) => {
  const bus = await Department.find({
    company_id: req.user.company_id,
    type: 'business_unit',
    is_active: true,
  } as any)
    .populate('primary_manager_id', 'full_name avatar_url')
    .sort({ created_at: 1 })
    .lean();

  // Get all departments under these BUs
  const buIds = bus.map((bu) => bu._id.toString());
  const allDepts = await Department.find({
    company_id: req.user.company_id,
    is_active: true,
  } as any).lean();

  // Get all teams
  const allTeams = await Team.find({
    company_id: req.user.company_id,
    is_active: true,
  } as any).lean();

  // Count descendants and teams for each BU
  const buWithCounts = bus.map((bu) => {
    const findDescendants = (parentId: string): string[] => {
      const children = allDepts.filter(
        (d) => d.parent_id?.toString() === parentId
      );
      let descendants: string[] = children.map((c) => c._id.toString());
      children.forEach((child) => {
        descendants = descendants.concat(findDescendants(child._id.toString()));
      });
      return descendants;
    };

    const descendantIds = findDescendants(bu._id.toString());
    const deptCount = descendantIds.length;
    const teamCount = allTeams.filter((t) => {
      const teamDeptId = t.department_id?.toString();
      return teamDeptId && descendantIds.includes(teamDeptId);
    }).length;

    return {
      ...bu,
      dept_count: deptCount,
      team_count: teamCount,
    };
  });

  res.status(200).json({ success: true, data: buWithCounts });
});

/**
 * DELETE /organization/business-units/:id
 * Deletes a BU. Blocked if it has child departments (409).
 */
export const deleteBusinessUnit = asyncHandler(async (req: Request, res: Response) => {
  const bu = await Department.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    type: 'business_unit',
    is_active: true,
  } as any);

  if (!bu) {
    throw new AppError('Business Unit not found', 404, 'NOT_FOUND');
  }

  // Check for child departments
  const childCount = await Department.countDocuments({
    company_id: req.user.company_id,
    parent_id: bu._id,
    is_active: true,
  } as any);

  if (childCount > 0) {
    throw new AppError(
      `Cannot delete Business Unit "${bu.name}" — it has ${childCount} child department${childCount > 1 ? 's' : ''}. Remove or reassign all child departments first.`,
      409,
      'BU_HAS_CHILD_DEPARTMENTS'
    );
  }

  const beforeState = bu.toObject();

  bu.is_active = false;
  await bu.save();

  await auditLogger.log({
    req,
    action: 'business_unit.archived',
    module: 'organization',
    object_type: 'Department',
    object_id: bu._id.toString(),
    object_label: bu.name,
    before_state: beforeState,
    after_state: bu.toObject(),
  });

  runIntelligenceRules(req.user.company_id).catch(err => {
    console.error('Intelligence rules failed:', err);
  });

  res.status(200).json({ success: true, data: {} });
});

/**
 * POST /people/:id/assign-org
 * Assigns a user to a department and teams in one request.
 */
export const assignUserOrg = asyncHandler(async (req: Request, res: Response) => {
  const input = AssignUserOrgSchema.parse(req.body);

  const user = await User.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  } as any);

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const beforeState = user.toObject();

  // Update department
  if (input.department_id !== undefined) {
    (user as any).department_id = input.department_id || undefined;
  }

  // Note: Team memberships are managed via TeamMember join table,
  // not on the User document. This endpoint just updates the primary department.
  // Team assignments should be managed via the Teams API.

  await user.save();

  await auditLogger.log({
    req,
    action: 'user.org_assigned',
    module: 'people',
    object_type: 'User',
    object_id: user._id.toString(),
    object_label: user.full_name,
    before_state: beforeState,
    after_state: user.toObject(),
  });

  res.status(200).json({ success: true, data: user });
});
