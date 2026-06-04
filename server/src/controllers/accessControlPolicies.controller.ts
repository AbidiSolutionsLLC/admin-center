import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { AccessControlPolicy } from '../models';

const CreateAccessControlPolicySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  effect: z.enum(['allow', 'deny']),
  subjects: z.object({
    users: z.array(z.string()).optional(),
    roles: z.array(z.string()).optional(),
    departments: z.array(z.string()).optional(),
  }).optional(),
  resources: z.array(z.string()),
  actions: z.array(z.string()),
  conditions: z.record(z.any()).optional(),
  priority: z.number().optional()
});

const UpdateAccessControlPolicySchema = CreateAccessControlPolicySchema.partial();

export const createPolicy = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateAccessControlPolicySchema.parse(req.body);
  const company_id = req.user.company_id;

  const exists = await AccessControlPolicy.findOne({ company_id, name: input.name });
  if (exists) {
    throw new AppError('Policy with this name already exists', 400);
  }

  const policy = await AccessControlPolicy.create({
    ...input,
    company_id
  });

  res.status(201).json({ success: true, data: policy });
});

export const getPolicies = asyncHandler(async (req: Request, res: Response) => {
  const company_id = req.user.company_id;
  const policies = await AccessControlPolicy.find({ company_id }).sort({ priority: -1, created_at: -1 });
  
  res.status(200).json({ success: true, data: policies });
});

export const getPolicyById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const company_id = req.user.company_id;

  const policy = await AccessControlPolicy.findOne({ _id: id, company_id });
  if (!policy) {
    throw new AppError('Policy not found', 404);
  }

  res.status(200).json({ success: true, data: policy });
});

export const updatePolicy = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const company_id = req.user.company_id;
  const input = UpdateAccessControlPolicySchema.parse(req.body);

  const policy = await AccessControlPolicy.findOneAndUpdate(
    { _id: id, company_id },
    { $set: input },
    { new: true, runValidators: true }
  );

  if (!policy) {
    throw new AppError('Policy not found', 404);
  }

  res.status(200).json({ success: true, data: policy });
});

export const deletePolicy = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const company_id = req.user.company_id;

  const policy = await AccessControlPolicy.findOneAndDelete({ _id: id, company_id });
  if (!policy) {
    throw new AppError('Policy not found', 404);
  }

  res.status(200).json({ success: true, message: 'Policy deleted' });
});
