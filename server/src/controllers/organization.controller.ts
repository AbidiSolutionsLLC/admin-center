// server/src/controllers/organization.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { Department } from '../models/Department.model';
import { User } from '../models/User.model';
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
