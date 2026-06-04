import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { PolicyTemplate } from '../models';

const CreatePolicyTemplateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  category: z.enum(['hr', 'it', 'security', 'compliance', 'operations', 'other']),
  default_content: z.string(),
  variables: z.array(z.string()).optional()
});

const UpdatePolicyTemplateSchema = CreatePolicyTemplateSchema.partial();

export const createTemplate = asyncHandler(async (req: Request, res: Response) => {
  const input = CreatePolicyTemplateSchema.parse(req.body);
  const company_id = req.user.company_id;

  const exists = await PolicyTemplate.findOne({ company_id, name: input.name });
  if (exists) {
    throw new AppError('Template with this name already exists', 400);
  }

  const template = await PolicyTemplate.create({
    ...input,
    company_id
  });

  res.status(201).json({ success: true, data: template });
});

export const getTemplates = asyncHandler(async (req: Request, res: Response) => {
  const company_id = req.user.company_id;
  // Get both system templates (company_id: null) and company templates
  const templates = await PolicyTemplate.find({ 
    $or: [{ company_id: null }, { company_id }] 
  }).sort({ created_at: -1 });
  
  res.status(200).json({ success: true, data: templates });
});

export const getTemplateById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const company_id = req.user.company_id;

  const template = await PolicyTemplate.findOne({ 
    _id: id,
    $or: [{ company_id: null }, { company_id }] 
  });
  
  if (!template) {
    throw new AppError('Template not found', 404);
  }

  res.status(200).json({ success: true, data: template });
});

export const updateTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const company_id = req.user.company_id;
  const input = UpdatePolicyTemplateSchema.parse(req.body);

  const template = await PolicyTemplate.findOneAndUpdate(
    { _id: id, company_id }, // Cannot update system templates (company_id: null)
    { $set: input },
    { new: true, runValidators: true }
  );

  if (!template) {
    throw new AppError('Template not found or you do not have permission', 404);
  }

  res.status(200).json({ success: true, data: template });
});

export const deleteTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const company_id = req.user.company_id;

  const template = await PolicyTemplate.findOneAndDelete({ _id: id, company_id });
  if (!template) {
    throw new AppError('Template not found or you do not have permission', 404);
  }

  res.status(200).json({ success: true, message: 'Template deleted' });
});
