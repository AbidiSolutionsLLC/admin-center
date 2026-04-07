import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { Department } from '../models/Department.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';

// Zod Schemas for Validation
const CreateDepartmentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['business_unit', 'division', 'department', 'team', 'cost_center']),
  parent_id: z.string().optional().nullable(),
  primary_manager_id: z.string().optional().nullable(),
  secondary_manager_id: z.string().optional().nullable(),
});

const UpdateDepartmentSchema = CreateDepartmentSchema.partial();

export const getDepartments = asyncHandler(async (req: Request, res: Response) => {
  const departments = await Department.find({
    company_id: req.user.company_id,
    is_active: true,
  } as any)
    .populate('primary_manager_id', 'full_name avatar_url')
    .sort({ created_at: 1 });

  res.status(200).json({ success: true, data: departments });
});

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

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  // 1. Validate body
  const parsedBody = CreateDepartmentSchema.parse(req.body);

  // 2. Create department scoped to company
  const dept = await Department.create({
    ...parsedBody,
    company_id: req.user.company_id,
  } as any);

  // 3. Audit log
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

  res.status(201).json({ success: true, data: dept });
});

export const updateDepartment = asyncHandler(async (req: Request, res: Response) => {
  const parsedBody = UpdateDepartmentSchema.parse(req.body);

  const dept = await Department.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  } as any);

  if (!dept) {
    throw new AppError('Department not found', 404, 'NOT_FOUND');
  }

  const beforeState = dept.toObject();

  // Apply updates
  Object.assign(dept, parsedBody);
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

  res.status(200).json({ success: true, data: dept });
});

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

  // Soft delete
  dept.is_active = false;
  await dept.save();

  await auditLogger.log({
    req,
    action: 'department.deleted', // or 'department.archived' depending on semantics
    module: 'organization',
    object_type: 'Department',
    object_id: dept._id.toString(),
    object_label: dept.name,
    before_state: beforeState,
    after_state: dept.toObject(),
  });

  res.status(200).json({ success: true, data: {} });
});

export const getOrgTree = asyncHandler(async (req: Request, res: Response) => {
  const departments = await Department.find({
    company_id: req.user.company_id,
    is_active: true,
  } as any).lean(); // .lean() for faster processing since we don't need mongoose docs

  // Build tree
  const map = new Map<string, any>();
  const tree: any[] = [];

  // Initialize map
  departments.forEach(dept => {
    map.set(dept._id.toString(), { ...dept, children: [] });
  });

  // Connect children
  departments.forEach(dept => {
    const node = map.get(dept._id.toString());
    if (dept.parent_id && map.has(dept.parent_id.toString())) {
      map.get(dept.parent_id.toString()).children.push(node);
    } else {
      tree.push(node);
    }
  });

  res.status(200).json({ success: true, data: tree });
});
