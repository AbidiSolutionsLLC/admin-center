import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { WorkflowTemplate, Workflow, WorkflowStep } from '../models';
import { Types } from 'mongoose';
import { auditLogger } from '../lib/auditLogger';

const TriggerConfigSchema = z.object({
  lifecycle_from: z.array(z.string()).optional(),
  lifecycle_to: z.array(z.string()).optional(),
  role_from: z.array(z.string()).optional(),
  role_to: z.array(z.string()).optional(),
  department_from: z.array(z.string()).optional(),
  department_to: z.array(z.string()).optional(),
});

const SlaConfigSchema = z.object({
  threshold_minutes: z.number().int().min(1).optional(),
  notify_on_breach: z.boolean().default(false),
});

const StepSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional(),
  action_type: z.enum([
    'send_email',
    'assign_role',
    'revoke_access',
    'notify_manager',
    'update_field',
    'create_task',
    'webhook',
    'require_approval'
  ]),
  action_config: z.record(z.string(), z.unknown()).default({}),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than']),
    value: z.unknown()
  })).optional().default([]),
  step_order: z.number().int().min(0),
  sla_config: SlaConfigSchema.optional(),
});

const CreateWorkflowTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  trigger: z.enum(['user.lifecycle_changed', 'user.created', 'user.role_changed', 'user.department_changed']),
  trigger_config: TriggerConfigSchema.optional(),
  steps: z.array(StepSchema).default([]),
});

const UpdateWorkflowTemplateSchema = CreateWorkflowTemplateSchema.partial();

const CreateFromTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

export const getTemplates = asyncHandler(async (req: Request, res: Response) => {
  const company_id = req.user.company_id;
  const templates = await WorkflowTemplate.find({ 
    $or: [{ company_id: null }, { company_id: new Types.ObjectId(company_id) }] 
  }).sort({ created_at: -1 });
  
  res.status(200).json({ success: true, data: templates });
});

export const getTemplateById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const company_id = req.user.company_id;

  const template = await WorkflowTemplate.findOne({ 
    _id: id,
    $or: [{ company_id: null }, { company_id: new Types.ObjectId(company_id) }] 
  });
  
  if (!template) {
    throw new AppError('Template not found', 404, 'TEMPLATE_NOT_FOUND');
  }

  res.status(200).json({ success: true, data: template });
});

export const createTemplate = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateWorkflowTemplateSchema.parse(req.body);
  const company_id = req.user.company_id;

  const exists = await WorkflowTemplate.findOne({ 
    company_id: new Types.ObjectId(company_id), 
    name: input.name 
  });
  
  if (exists) {
    throw new AppError('Template with this name already exists', 400, 'DUPLICATE_NAME');
  }

  const template = await WorkflowTemplate.create({
    ...input,
    company_id: new Types.ObjectId(company_id)
  });

  res.status(201).json({ success: true, data: template });
});

export const updateTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const company_id = req.user.company_id;
  const input = UpdateWorkflowTemplateSchema.parse(req.body);

  const template = await WorkflowTemplate.findOneAndUpdate(
    { _id: id, company_id: new Types.ObjectId(company_id) }, // Cannot update system templates (company_id: null)
    { $set: input },
    { new: true, runValidators: true }
  );

  if (!template) {
    throw new AppError('Template not found or you do not have permission', 404, 'TEMPLATE_NOT_FOUND');
  }

  res.status(200).json({ success: true, data: template });
});

export const deleteTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const company_id = req.user.company_id;

  const template = await WorkflowTemplate.findOneAndDelete({ 
    _id: id, 
    company_id: new Types.ObjectId(company_id) 
  });
  
  if (!template) {
    throw new AppError('Template not found or you do not have permission', 404, 'TEMPLATE_NOT_FOUND');
  }

  res.status(200).json({ success: true, message: 'Template deleted' });
});

export const createWorkflowFromTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const company_id = req.user.company_id;
  const { name } = CreateFromTemplateSchema.parse(req.body);

  const template = await WorkflowTemplate.findOne({ 
    _id: id,
    $or: [{ company_id: null }, { company_id: new Types.ObjectId(company_id) }] 
  });

  if (!template) {
    throw new AppError('Template not found', 404, 'TEMPLATE_NOT_FOUND');
  }

  const existing = await Workflow.findOne({
    name: { $regex: `^${name}$`, $options: 'i' },
    company_id: new Types.ObjectId(company_id),
  });

  if (existing) {
    throw new AppError('Workflow with this name already exists', 400, 'DUPLICATE_NAME');
  }

  const workflowKey = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  const workflow = await Workflow.create({
    company_id: new Types.ObjectId(company_id),
    workflow_key: workflowKey,
    version_number: 1,
    name,
    description: template.description,
    trigger: template.trigger,
    trigger_config: template.trigger_config,
    status: 'draft',
    is_active: true,
    created_by: new Types.ObjectId(req.user.userId),
  });

  // Clone steps from template
  if (template.steps && template.steps.length > 0) {
    const newSteps = template.steps.map(s => ({
      company_id: new Types.ObjectId(company_id),
      workflow_id: workflow._id,
      name: s.name,
      description: s.description,
      action_type: s.action_type,
      action_config: s.action_config,
      conditions: s.conditions,
      step_order: s.step_order,
      is_active: true,
      sla_config: s.sla_config,
    }));
    await WorkflowStep.insertMany(newSteps);
  }

  await auditLogger.log({
    req,
    action: 'workflow.created_from_template',
    module: 'workflows',
    object_type: 'Workflow',
    object_id: workflow._id.toString(),
    object_label: workflow.name,
    before_state: null,
    after_state: {
      template_id: template._id.toString(),
      name: workflow.name,
      trigger: workflow.trigger,
      steps_count: template.steps.length,
    },
  });

  const populated = await Workflow.findById(workflow._id).populate(
    'created_by',
    'full_name email'
  );

  res.status(201).json({ success: true, data: populated });
});

export const saveWorkflowAsTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const company_id = req.user.company_id;
  const input = CreateFromTemplateSchema.parse(req.body); // Just expecting { name } for the new template

  const workflow = await Workflow.findOne({
    _id: id,
    company_id: new Types.ObjectId(company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  const existingTemplate = await WorkflowTemplate.findOne({ 
    company_id: new Types.ObjectId(company_id), 
    name: input.name 
  });
  
  if (existingTemplate) {
    throw new AppError('Template with this name already exists', 400, 'DUPLICATE_NAME');
  }

  const steps = await WorkflowStep.find({
    workflow_id: workflow._id,
    company_id: new Types.ObjectId(company_id),
  }).sort({ step_order: 1 });

  const templateSteps = steps.map(s => ({
    name: s.name,
    description: s.description,
    action_type: s.action_type,
    action_config: s.action_config,
    conditions: s.conditions,
    step_order: s.step_order,
    sla_config: s.sla_config,
  }));

  const template = await WorkflowTemplate.create({
    company_id: new Types.ObjectId(company_id),
    name: input.name,
    description: workflow.description,
    trigger: workflow.trigger,
    trigger_config: workflow.trigger_config,
    steps: templateSteps,
  });

  res.status(201).json({ success: true, data: template });
});
