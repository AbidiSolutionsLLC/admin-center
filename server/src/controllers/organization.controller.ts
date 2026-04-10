// server/src/controllers/organization.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { Department } from '../models/Department.model';
import { User } from '../models/User.model';
import { Team } from '../models/Team.model';
import { TeamMember } from '../models/TeamMember.model';
import { AuditEvent } from '../models/AuditEvent.model';
import { Insight } from '../models/Insight.model';
import { auditLogger } from '../lib/auditLogger';
import { runIntelligenceRules } from '../lib/intelligence';
import { AppError } from '../utils/AppError';
import { slugify } from '../utils/slugify';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const DepartmentBaseSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(['business_unit', 'division', 'department', 'team', 'cost_center']),
  parent_id: z.string().optional().nullable(),
  primary_manager_id: z.string().optional().nullable(),
  secondary_manager_id: z.string().optional().nullable(),
  custom_fields: z.record(z.string(), z.unknown()).optional().default({}),
});

const CreateDepartmentSchema = DepartmentBaseSchema.refine(data => {
  // Only Business Units are allowed to be top-level (no parent_id)
  if (data.type !== 'business_unit' && !data.parent_id) {
    return false;
  }
  return true;
}, {
  message: 'Only Business Units can be top-level. All other units must have a parent.',
  path: ['parent_id'],
});

const UpdateDepartmentSchema = DepartmentBaseSchema.partial().refine(data => {
  // If type is defined and not business_unit, then either parent_id must be provided 
  // or we assume it already has one. For a partial update, we only check if both are present in this slice.
  if (data.type && data.type !== 'business_unit' && data.parent_id === null) {
    return false;
  }
  return true;
}, {
  message: 'Non-business units cannot have their parent removed.',
  path: ['parent_id'],
});

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
  departments: ReturnType<(typeof Department.prototype.toObject)>[],
  companyId: string
): Promise<typeof departments> {
  const deptIds = departments.map((d) => d._id);

  // Count active users per department in one aggregation
  const headcounts = await User.aggregate([
    { $match: { company_id: new Types.ObjectId(companyId), department_id: { $in: deptIds }, is_active: true } },
    { $group: { _id: '$department_id', count: { $sum: 1 } } },
  ]);
  const headcountMap = new Map<string, number>(
    headcounts.map((h) => [h._id.toString(), h.count])
  );

  return departments.map((dept) => {
    const data = { ...dept };
    const headcount = headcountMap.get(dept._id.toString()) ?? 0;
    const has_intelligence_flag = headcount > 0 && !dept.primary_manager_id;
    
    // Map populated objects to the names expected by the frontend
    if (data.primary_manager_id && typeof data.primary_manager_id === 'object') {
      data.primary_manager = data.primary_manager_id as any;
    }

    return { ...data, headcount, has_intelligence_flag };
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

  const enriched = await enrichDepartments(raw, req.user.company_id);
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

  const [enriched] = await enrichDepartments([dept.toObject()], req.user.company_id);
  res.status(200).json({ success: true, data: enriched });
});

/**
 * POST /organization
 * Creates a new department scoped to the requesting company's tenant.
 */
export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateDepartmentSchema.parse(req.body);

  // Check for duplicate slug within the same company
  const slug = slugify(input.name);
  const existing = await Department.findOne({
    company_id: req.user.company_id,
    slug,
    is_active: true,
  } as any);

  if (existing) {
    throw new AppError(
      `A department with the name "${input.name}" already exists.`,
      400,
      'DUPLICATE_DEPARTMENT_NAME'
    );
  }

  const dept = await Department.create({
    ...input,
    // Normalize empty strings → undefined so Mongoose doesn't store ''
    parent_id: input.parent_id || undefined,
    primary_manager_id: input.primary_manager_id || undefined,
    secondary_manager_id: input.secondary_manager_id || undefined,
    custom_fields: input.custom_fields || {},
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
  console.log("Update Department Request Body:", req.body);
  const input = UpdateDepartmentSchema.parse(req.body);

  // If name is being changed, check for duplicate slug
  if (input.name) {
    const slug = slugify(input.name);
    const existing = await Department.findOne({
      company_id: req.user.company_id,
      slug,
      _id: { $ne: req.params.id },
      is_active: true,
    } as any);

    if (existing) {
      throw new AppError(
        `Another department with the name "${input.name}" already exists.`,
        400,
        'DUPLICATE_DEPARTMENT_NAME'
      );
    }
  }

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

  // Merge custom_fields if provided
  if (input.custom_fields !== undefined) {
    dept.custom_fields = input.custom_fields;
  }

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

  const enriched = await enrichDepartments(raw, req.user.company_id);

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
      const isDescendant = await isDescendantOf(dept._id.toString(), input.parent_id, req.user.company_id as string);
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
async function isDescendantOf(deptId: string, targetId: string, companyId: string): Promise<boolean> {
  // Get direct children of deptId
  const children = await Department.find({
    company_id: companyId,
    parent_id: deptId,
    is_active: true,
  } as any).lean();

  for (const child of children) {
    if (child._id.toString() === targetId) return true;
    // Recursively check grandchildren
    if (await isDescendantOf(child._id.toString(), targetId, companyId)) return true;
  }

  return false;
}

/**
 * GET /organization/bu-tree
 * Returns full hierarchy tree for all Business Units: BU → Departments → Teams
 */
export const getBUTree = asyncHandler(async (req: Request, res: Response) => {
  // Get all active Business Units
  const allBUs = await Department.find({
    company_id: req.user.company_id,
    type: 'business_unit',
    is_active: true,
  } as any)
    .populate('primary_manager_id', 'full_name avatar_url')
    .sort({ created_at: 1 })
    .lean();

  // Get Root BUs (those with no parent or whose parent is not found/not a BU - though usually just parent_id: null)
  const rootBUs = allBUs.filter(bu => !bu.parent_id);

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
  
  // Combine all organization units (BUs + enriched Departments) for recursive lookup
  const allOrgUnits = [...allBUs, ...enrichedDepts];

  // Build hierarchy recursively
  interface OrgTreeNode {
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
    children: OrgTreeNode[];
    dept_count: number;
  }

  const buildTree = (parentId: string): OrgTreeNode[] => {
    // Find children (could be BUs or Departments)
    const children = allOrgUnits.filter(
      (u) => u.parent_id?.toString() === parentId
    );

    return children.map((child): OrgTreeNode => {
      const childId = child._id.toString();
      
      // Teams directly under this unit
      const unitTeams = teams.filter(
        (t) => t.department_id?.toString() === childId
      );

      // Recursive children
      const nestedChildren = buildTree(childId);

      // Count all non-BU descendants in this branch
      const countDepts = (nodes: OrgTreeNode[]): number => {
        return nodes.reduce((acc, node) => {
          const isDept = node.type !== 'business_unit';
          return acc + (isDept ? 1 : 0) + countDepts(node.children);
        }, 0);
      };

      // Count all teams in this branch
      const countTeams = (nodes: OrgTreeNode[], directTeamsCount: number): number => {
        return nodes.reduce((acc, node) => acc + node.team_count + countTeams(node.children, 0), directTeamsCount);
      };

      const branchChildren = nestedChildren;
      const branchDeptCount = countDepts(branchChildren) + (child.type !== 'business_unit' ? 1 : 0);
      const branchTeamCount = countTeams(branchChildren, unitTeams.length);

      return {
        ...child,
        teams: unitTeams,
        team_count: unitTeams.length,
        children: branchChildren,
        dept_count: branchDeptCount,
        // We override team_count in the return to represent total branch teams for UI needs if necessary,
        // but typically the UI shows direct count + indicator. Let's keep direct for now and add total.
        total_team_count: branchTeamCount,
      } as any;
    });
  };

  const buTree = rootBUs.map((bu) => {
    const buId = bu._id.toString();
    const children = buildTree(buId);
    
    // Total counts for the root BU
    const totalDepts = children.reduce((acc, child) => {
       const isDept = child.type !== 'business_unit';
       return acc + (isDept ? 1 : 0) + (child as any).dept_count;
    }, 0);

    const totalTeams = children.reduce((acc, child) => {
       return acc + child.team_count + (child as any).total_team_count;
    }, 0);

    return {
      ...bu,
      children,
      dept_count: totalDepts,
      team_count: totalTeams,
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
 * Assigns a user to a department and multiple teams in one request.
 * Enforces "at least one department" rule and validates team-department alignment.
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

  // Enforce mandatory department
  if (!input.department_id) {
    throw new AppError('A user must belong to at least one department', 400, 'DEPARTMENT_REQUIRED');
  }

  const beforeState = user.toObject();

  // 1. Update primary department on User document
  user.department_id = input.department_id as any;
  
  // Also clear legacy team_id if it's there, as we use TeamMember now
  (user as any).team_id = undefined;

  await user.save();

  // 2. Handle Team Memberships
  // If team_ids is null/empty, we remove all memberships.
  // If provided, we validate and then reset memberships.
  if (input.team_ids !== undefined) {
    const teamIds = input.team_ids || [];

    if (teamIds.length > 0) {
      // Validate that all teams exist and belong to the selected department
      const validTeams = await Team.find({
        _id: { $in: teamIds },
        company_id: req.user.company_id,
        department_id: input.department_id,
        is_active: true,
      } as any);

      if (validTeams.length !== teamIds.length) {
        throw new AppError(
          'One or more teams are invalid or do not belong to the selected department',
          400,
          'INVALID_TEAM_ASSIGNMENT'
        );
      }
    }

    // Remove existing memberships
    await TeamMember.deleteMany({
      company_id: req.user.company_id,
      user_id: user._id,
    } as any);

    // Create new memberships
    if (teamIds.length > 0) {
      const memberships = teamIds.map((teamId) => ({
        company_id: req.user.company_id,
        team_id: teamId,
        user_id: user._id,
        role: 'member' as const,
      }));
      await TeamMember.insertMany(memberships);
    }
  }

  await auditLogger.log({
    req,
    action: 'user.org_assigned',
    module: 'people',
    object_type: 'User',
    object_id: user._id.toString(),
    object_label: user.full_name,
    before_state: beforeState,
    after_state: {
      department_id: user.department_id,
      team_ids: input.team_ids || [],
    },
  });

  res.status(200).json({ 
    success: true, 
    data: {
      ...user.toObject(),
      team_ids: input.team_ids || [],
    } 
  });
});

/**
 * GET /organization/health
 * Returns insights grouped by severity for the organization module.
 */
export const getOrgHealth = asyncHandler(async (req: Request, res: Response) => {
  const insights = await Insight.find({
    company_id: req.user.company_id,
    is_resolved: false,
  }).sort({ severity: 1, detected_at: -1 }).lean();

  // Group by severity
  const grouped = {
    critical: insights.filter((i) => i.severity === 'critical'),
    warning: insights.filter((i) => i.severity === 'warning'),
    info: insights.filter((i) => i.severity === 'info'),
  };

  res.status(200).json({
    success: true,
    data: {
      insights: grouped,
      counts: {
        critical: grouped.critical.length,
        warning: grouped.warning.length,
        info: grouped.info.length,
        total: insights.length,
      },
    },
  });
});

/**
 * GET /organization/history
 * Returns audit events for organization module (departments, teams, BUs).
 * Supports filters: object_type, date_from, date_to
 */
export const getOrgHistory = asyncHandler(async (req: Request, res: Response) => {
  const { object_type, date_from, date_to } = req.query;

  const query: Record<string, unknown> = {
    company_id: req.user.company_id,
    module: 'organization',
  };

  if (object_type) {
    query.object_type = object_type;
  }

  if (date_from || date_to) {
    query.created_at = {};
    if (date_from) {
      (query.created_at as Record<string, unknown>).$gte = new Date(date_from as string);
    }
    if (date_to) {
      (query.created_at as Record<string, unknown>).$lte = new Date(date_to as string);
    }
  }

  const events = await AuditEvent.find(query)
    .sort({ created_at: -1 })
    .limit(100)
    .lean();

  res.status(200).json({ success: true, data: events });
});
