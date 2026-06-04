import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { DataGovernancePolicy } from '../models';

const RuleSchema = z.object({
  fields: z.array(z.string()).optional(),
  condition: z.record(z.any()).optional(),
  action: z.enum(['mask', 'hide', 'encrypt']),
  mask_pattern: z.string().optional()
});

const CreateDataGovernancePolicySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  resource: z.string(),
  granularity: z.enum(['row', 'column']),
  rules: z.array(RuleSchema),
  applied_to: z.object({
    roles: z.array(z.string()).optional(),
    departments: z.array(z.string()).optional()
  }).optional()
});

const UpdateDataGovernancePolicySchema = CreateDataGovernancePolicySchema.partial();

export const createGovernancePolicy = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateDataGovernancePolicySchema.parse(req.body);
  const company_id = req.user.company_id;

  const exists = await DataGovernancePolicy.findOne({ company_id, name: input.name });
  if (exists) {
    throw new AppError('Policy with this name already exists', 400);
  }

  const policy = await DataGovernancePolicy.create({
    ...input,
    company_id
  });

  res.status(201).json({ success: true, data: policy });
});

export const getGovernancePolicies = asyncHandler(async (req: Request, res: Response) => {
  const company_id = req.user.company_id;
  const policies = await DataGovernancePolicy.find({ company_id }).sort({ created_at: -1 });
  
  res.status(200).json({ success: true, data: policies });
});

export const getGovernancePolicyById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const company_id = req.user.company_id;

  const policy = await DataGovernancePolicy.findOne({ _id: id, company_id });
  if (!policy) {
    throw new AppError('Policy not found', 404);
  }

  res.status(200).json({ success: true, data: policy });
});

export const updateGovernancePolicy = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const company_id = req.user.company_id;
  const input = UpdateDataGovernancePolicySchema.parse(req.body);

  const policy = await DataGovernancePolicy.findOneAndUpdate(
    { _id: id, company_id },
    { $set: input },
    { new: true, runValidators: true }
  );

  if (!policy) {
    throw new AppError('Policy not found', 404);
  }

  res.status(200).json({ success: true, data: policy });
});

export const deleteGovernancePolicy = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const company_id = req.user.company_id;

  const policy = await DataGovernancePolicy.findOneAndDelete({ _id: id, company_id });
  if (!policy) {
    throw new AppError('Policy not found', 404);
  }

  res.status(200).json({ success: true, message: 'Policy deleted' });
});
