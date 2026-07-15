// server/src/controllers/workflows.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { Workflow } from '../models/Workflow.model';
import { WorkflowStep } from '../models/WorkflowStep.model';
import { WorkflowRun } from '../models/WorkflowRun.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
import { Types } from 'mongoose';
import { executeWorkflow, handleLifecycleEvent, simulateWorkflow } from '../lib/workflowEngine';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const SlaConfigSchema = z.object({
  threshold_minutes: z.number().int().min(1).optional(),
  notify_on_breach: z.boolean().default(false),
});

const CreateWorkflowSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z.string().trim().max(1000).optional(),
  trigger: z.enum(['user.lifecycle_changed', 'user.created', 'user.role_changed', 'user.department_changed']),
  trigger_config: z.object({
    lifecycle_from: z.array(z.string()).optional(),
    lifecycle_to: z.array(z.string()).optional(),
    role_from: z.array(z.string()).optional(),
    role_to: z.array(z.string()).optional(),
    department_from: z.array(z.string()).optional(),
    department_to: z.array(z.string()).optional(),
  }).optional(),
  sla_config: SlaConfigSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.trigger === 'user.lifecycle_changed') {
    if (!data.trigger_config?.lifecycle_from?.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one 'Trigger From' state is required", path: ['trigger_config', 'lifecycle_from'] });
    }
    if (!data.trigger_config?.lifecycle_to?.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one 'Trigger To' state is required", path: ['trigger_config', 'lifecycle_to'] });
    }
  }
});

const UpdateWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  trigger_config: z
    .object({
      lifecycle_from: z.array(z.string()).optional(),
      lifecycle_to: z.array(z.string()).optional(),
      role_from: z.array(z.string()).optional(),
      role_to: z.array(z.string()).optional(),
      department_from: z.array(z.string()).optional(),
      department_to: z.array(z.string()).optional(),
    })
    .optional(),
  sla_config: SlaConfigSchema.optional(),
}).superRefine((data, ctx) => {
  // If it's a partial update we might not have all fields, but if trigger_config is present for lifecycle we should validate
  // We can't strictly enforce it here because trigger type is not in UpdateWorkflowSchema, 
  // but we can ensure arrays are not empty if they are provided
  if (data.trigger_config?.lifecycle_from !== undefined && data.trigger_config.lifecycle_from.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one 'Trigger From' state is required", path: ['trigger_config', 'lifecycle_from'] });
  }
  if (data.trigger_config?.lifecycle_to !== undefined && data.trigger_config.lifecycle_to.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one 'Trigger To' state is required", path: ['trigger_config', 'lifecycle_to'] });
  }
});

const CreateStepSchema = z.object({
  name: z.string().trim().min(1, 'Step Name is required').max(200),
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
}).superRefine((data, ctx) => {
  if (data.action_type === 'require_approval') {
    if (data.action_config.timeout_hours !== undefined && data.action_config.timeout_hours !== "") {
      const timeout = Number(data.action_config.timeout_hours);
      if (isNaN(timeout) || timeout <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Timeout must be greater than 0", path: ['action_config', 'timeout_hours'] });
      }
    }
    if (!data.action_config.approver_user_ids || !Array.isArray(data.action_config.approver_user_ids) || data.action_config.approver_user_ids.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one approver must be selected", path: ['action_config', 'approver_user_ids'] });
    } else {
        const uniqueApprovers = new Set(data.action_config.approver_user_ids as string[]);
        if (uniqueApprovers.size !== data.action_config.approver_user_ids.length) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate approvers are not allowed", path: ['action_config', 'approver_user_ids'] });
        }
    }
  }
});

const ReorderStepsSchema = z.object({
  steps: z.array(
    z.object({
      step_id: z.string(),
      step_order: z.number().int().min(0),
    })
  ),
});

const TestWorkflowSchema = z.object({
  user_id: z.string().min(1, 'user_id is required'),
  user_name: z.string().min(1, 'user_name is required'),
  user_email: z.string().email('Invalid email'),
  trigger: z.string().min(1, 'trigger is required'),
  lifecycle_from: z.string().optional(),
  lifecycle_to: z.string().optional(),
  role_from: z.string().optional(),
  role_to: z.string().optional(),
  department_from: z.string().optional(),
  department_to: z.string().optional(),
});

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /workflows
 * Returns all workflow keys with their latest version for the current company.
 */
export const getWorkflows = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query;

  const filter: Record<string, unknown> = {
    company_id: new Types.ObjectId(req.user.company_id),
    is_active: true,
  };

  if (status) {
    filter.status = status;
  }

  const workflows = await Workflow.aggregate([
    { $match: filter },
    { $sort: { workflow_key: 1, version_number: -1 } },
    {
      $group: {
        _id: '$workflow_key',
        latest_version: { $first: '$$ROOT' },
        version_count: { $sum: 1 },
      },
    },
    { $sort: { 'latest_version.created_at': -1 } },
  ]);

  // Populate created_by and updated_by using Mongoose populate
  const populatedWorkflows = await Workflow.populate(
    workflows.map(w => w.latest_version),
    [
      { path: 'created_by', select: 'full_name email' },
      { path: 'updated_by', select: 'full_name email' }
    ]
  );

  res.status(200).json({ 
    success: true, 
    data: populatedWorkflows.map((pw, i) => ({
      ...pw.toObject ? pw.toObject() : pw,
      version_count: workflows[i].version_count
    }))
  });
});

/**
 * GET /workflows/versions
 * Returns all versions of a specific workflow for the current company.
 */
export const getWorkflowVersions = asyncHandler(async (req: Request, res: Response) => {
  const { workflow_key } = req.query;

  if (!workflow_key || typeof workflow_key !== 'string') {
    throw new AppError('workflow_key query parameter is required', 400, 'MISSING_WORKFLOW_KEY');
  }

  const versions = await Workflow.find({
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_key,
  })
    .populate('created_by', 'full_name email avatar_url')
    .populate('updated_by', 'full_name email avatar_url')
    .sort({ version_number: -1 });

  if (!versions.length) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  res.status(200).json({ success: true, data: versions });
});

/**
 * GET /workflows/:id
 * Returns a single workflow with its steps.
 */
export const getWorkflowById = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  }).populate('created_by', 'full_name email');

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  const steps = await WorkflowStep.find({
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_id: workflow._id,
  }).sort({ step_order: 1 });

  res.status(200).json({ success: true, data: { ...workflow.toObject(), steps } });
});

/**
 * POST /workflows
 * Creates a new workflow in draft status.
 * Produces audit event: workflow.created
 */
export const createWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateWorkflowSchema.parse(req.body);

  const existing = await Workflow.findOne({
    name: { $regex: `^${input.name}$`, $options: 'i' },
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (existing) {
    throw new AppError('Workflow with this name already exists', 400, 'DUPLICATE_NAME');
  }

  const workflowKey = input.name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  const workflow = await Workflow.create({
    ...input,
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_key: workflowKey,
    version_number: 1,
    created_by: new Types.ObjectId(req.user.userId),
    status: 'draft',
    is_active: true,
    sla_config: input.sla_config,
  });

  // Audit log
  await auditLogger.log({
    req,
    action: 'workflow.created',
    module: 'workflows',
    object_type: 'Workflow',
    object_id: workflow._id.toString(),
    object_label: workflow.name,
    before_state: null,
    after_state: {
      name: workflow.name,
      description: workflow.description,
      trigger: workflow.trigger,
      trigger_config: workflow.trigger_config,
      status: workflow.status,
      sla_config: workflow.sla_config,
    },
  });

  const populated = await Workflow.findById(workflow._id).populate(
    'created_by',
    'full_name email'
  );

  res.status(201).json({ success: true, data: populated });
});

/**
 * PUT /workflows/:id
 * Updates a draft workflow. Cannot update enabled/disabled workflows.
 * Produces audit event: workflow.updated
 */
export const updateWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateWorkflowSchema.parse(req.body);

  if (input.name) {
    const existing = await Workflow.findOne({
      name: { $regex: `^${input.name}$`, $options: 'i' },
      company_id: new Types.ObjectId(req.user.company_id),
    });
    if (existing && existing._id.toString() !== req.params.id) {
      throw new AppError('Workflow with this name already exists', 400, 'DUPLICATE_NAME');
    }
  }

  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  if (workflow.status !== 'draft') {
    throw new AppError('Cannot update non-draft workflows. Create a new draft instead.', 400, 'CANNOT_MODIFY_PUBLISHED');
  }

  const beforeState = {
    name: workflow.name,
    description: workflow.description,
    trigger_config: workflow.trigger_config,
    sla_config: workflow.sla_config,
  };

  Object.assign(workflow, input);
  workflow.updated_by = new Types.ObjectId(req.user.userId);
  await workflow.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'workflow.updated',
    module: 'workflows',
    object_type: 'Workflow',
    object_id: workflow._id.toString(),
    object_label: workflow.name,
    before_state: beforeState,
    after_state: {
      name: workflow.name,
      description: workflow.description,
      trigger_config: workflow.trigger_config,
      sla_config: workflow.sla_config,
    },
  });

  const populated = await Workflow.findById(workflow._id).populate(
    'created_by',
    'full_name email'
  );

  res.status(200).json({ success: true, data: populated });
});

/**
 * POST /workflows/:id/publish
 * Publishes a draft workflow and archives the previously published version.
 * Produces audit event: workflow.published
 */
export const publishWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  if (workflow.status !== 'draft') {
    throw new AppError('Only draft workflows can be published', 400, 'INVALID_STATUS');
  }

  // Check if workflow has steps
  const stepCount = await WorkflowStep.countDocuments({
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_id: workflow._id,
  });

  if (stepCount === 0) {
    throw new AppError('Cannot publish workflow with no steps', 400, 'EMPTY_WORKFLOW');
  }

  // Archive currently published version for this key
  await Workflow.updateMany(
    { 
      company_id: new Types.ObjectId(req.user.company_id),
      workflow_key: workflow.workflow_key,
      status: 'published'
    },
    { $set: { status: 'archived', is_active: false } }
  );

  const beforeState = { status: workflow.status };

  workflow.status = 'published';
  await workflow.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'workflow.published',
    module: 'workflows',
    object_type: 'Workflow',
    object_id: workflow._id.toString(),
    object_label: `${workflow.name} v${workflow.version_number}`,
    before_state: beforeState,
    after_state: { status: 'published', version_number: workflow.version_number },
  });

  res.status(200).json({ success: true, data: workflow });
});

/**
 * POST /workflows/:id/draft
 * Creates a new draft from an existing published or archived workflow.
 * Clones all steps.
 */
export const createDraftWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  // Check if a draft already exists for this workflow key
  const existingDraft = await Workflow.findOne({
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_key: workflow.workflow_key,
    status: 'draft',
  });

  if (existingDraft) {
    throw new AppError('A draft version already exists. Please edit or delete it first.', 400, 'DRAFT_EXISTS');
  }

  // Find latest version number
  const latestVersion = await Workflow.findOne({
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_key: workflow.workflow_key,
  }).sort({ version_number: -1 });

  const nextVersion = latestVersion ? latestVersion.version_number + 1 : 1;

  // Create new draft
  const newDraft = await Workflow.create({
    company_id: workflow.company_id,
    workflow_key: workflow.workflow_key,
    version_number: nextVersion,
    name: workflow.name,
    description: workflow.description,
    trigger: workflow.trigger,
    trigger_config: workflow.trigger_config,
    status: 'draft',
    is_active: true,
    sla_config: workflow.sla_config,
    created_by: new Types.ObjectId(req.user.userId),
  });

  // Clone steps
  const steps = await WorkflowStep.find({
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_id: workflow._id,
  });

  if (steps.length > 0) {
    const newSteps = steps.map(s => ({
      company_id: s.company_id,
      workflow_id: newDraft._id,
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
    action: 'workflow.draft_created',
    module: 'workflows',
    object_type: 'Workflow',
    object_id: newDraft._id.toString(),
    object_label: `${newDraft.name} v${newDraft.version_number}`,
    before_state: null,
    after_state: { version_number: newDraft.version_number, cloned_from: workflow._id.toString() },
  });

  res.status(201).json({ success: true, data: newDraft });
});

/**
 * POST /workflows/:id/rollback
 * Reverts to a previous version by publishing it (and archiving current).
 */
export const rollbackWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  if (workflow.status === 'draft') {
    throw new AppError('Cannot rollback to a draft. Delete the draft instead.', 400, 'INVALID_STATUS');
  }

  // Find latest version number to create a new version for the rollback
  const latestVersion = await Workflow.findOne({
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_key: workflow.workflow_key,
  }).sort({ version_number: -1 });

  const nextVersion = latestVersion ? latestVersion.version_number + 1 : 1;

  // Create new published version identical to the target rollback version
  const newRollbackVersion = await Workflow.create({
    company_id: workflow.company_id,
    workflow_key: workflow.workflow_key,
    version_number: nextVersion,
    name: workflow.name,
    description: workflow.description,
    trigger: workflow.trigger,
    trigger_config: workflow.trigger_config,
    status: 'published',
    is_active: true,
    sla_config: workflow.sla_config,
    created_by: new Types.ObjectId(req.user.userId),
  });

  // Clone steps
  const steps = await WorkflowStep.find({
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_id: workflow._id,
  });

  if (steps.length > 0) {
    const newSteps = steps.map(s => ({
      company_id: s.company_id,
      workflow_id: newRollbackVersion._id,
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

  // Archive any previously published versions
  await Workflow.updateMany(
    { 
      company_id: new Types.ObjectId(req.user.company_id),
      workflow_key: workflow.workflow_key,
      status: 'published',
      _id: { $ne: newRollbackVersion._id }
    },
    { $set: { status: 'archived', is_active: false } }
  );

  await auditLogger.log({
    req,
    action: 'workflow.rolled_back',
    module: 'workflows',
    object_type: 'Workflow',
    object_id: newRollbackVersion._id.toString(),
    object_label: `${newRollbackVersion.name} v${newRollbackVersion.version_number}`,
    before_state: null,
    after_state: { version_number: newRollbackVersion.version_number, rolled_back_from: workflow._id.toString() },
  });

  res.status(201).json({ success: true, data: newRollbackVersion });
});

/**
 * POST /workflows/:id/archive
 * Archives a workflow.
 * Produces audit event: workflow.archived
 */
export const archiveWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  const beforeState = { status: workflow.status };

  workflow.status = 'archived';
  workflow.is_active = false;
  await workflow.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'workflow.archived',
    module: 'workflows',
    object_type: 'Workflow',
    object_id: workflow._id.toString(),
    object_label: workflow.name,
    before_state: beforeState,
    after_state: { status: 'archived' },
  });

  res.status(200).json({ success: true, data: workflow });
});

/**
 * DELETE /workflows/:id
 * Deletes a draft workflow (hard delete). Cannot delete enabled/disabled workflows.
 * Produces audit event: workflow.deleted
 */
export const deleteWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  if (workflow.status !== 'draft') {
    throw new AppError('Can only delete draft workflows. Archive or delete versions via history.', 400, 'CANNOT_DELETE_PUBLISHED');
  }

  const runsCount = await WorkflowRun.countDocuments({
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_id: workflow._id,
  });

  if (runsCount > 0) {
    throw new AppError('Cannot delete: Workflow still assigned to runs', 400, 'HAS_DEPENDENTS');
  }

  // Delete all associated steps
  await WorkflowStep.deleteMany({
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_id: workflow._id,
  });

  // Audit log before deletion
  await auditLogger.log({
    req,
    action: 'workflow.deleted',
    module: 'workflows',
    object_type: 'Workflow',
    object_id: workflow._id.toString(),
    object_label: workflow.name,
    before_state: {
      name: workflow.name,
      status: workflow.status,
      trigger: workflow.trigger,
    },
    after_state: null,
  });

  // Hard delete the workflow
  await Workflow.deleteOne({ _id: workflow._id });

  res.status(200).json({ success: true, message: 'Workflow deleted' });
});

/**
 * POST /workflows/:id/steps
 * Adds a step to a workflow (draft or disabled only).
 * Produces audit event: workflow.step_added
 */
export const addWorkflowStep = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateStepSchema.parse(req.body);

  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  if (workflow.status !== 'draft') {
    throw new AppError('Cannot add steps to a non-draft workflow. Create a new draft first.', 400, 'CANNOT_MODIFY_PUBLISHED');
  }

  const step = await WorkflowStep.create({
    ...input,
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_id: workflow._id,
    sla_config: input.sla_config,
  });

  // Audit log
  await auditLogger.log({
    req,
    action: 'workflow.step_added',
    module: 'workflows',
    object_type: 'WorkflowStep',
    object_id: step._id.toString(),
    object_label: step.name,
    before_state: null,
    after_state: {
      workflow_id: workflow._id.toString(),
      name: step.name,
      action_type: step.action_type,
      conditions: step.conditions,
      step_order: step.step_order,
      sla_config: step.sla_config,
    },
  });

  res.status(201).json({ success: true, data: step });
});

/**
 * PUT /workflows/:id/steps/:stepId
 * Updates an existing step (draft or disabled workflow only).
 * Produces audit event: workflow.step_updated
 */
export const updateWorkflowStep = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateStepSchema.partial().parse(req.body);

  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  if (workflow.status !== 'draft') {
    throw new AppError('Cannot update steps of a non-draft workflow. Create a new draft first.', 400, 'CANNOT_MODIFY_PUBLISHED');
  }

  const step = await WorkflowStep.findOne({
    _id: req.params.stepId,
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_id: workflow._id,
  });

  if (!step) {
    throw new AppError('Step not found', 404, 'WORKFLOW_STEP_NOT_FOUND');
  }

  const beforeState = {
    name: step.name,
    action_type: step.action_type,
    action_config: step.action_config,
    conditions: step.conditions,
    step_order: step.step_order,
    sla_config: step.sla_config,
  };

  Object.assign(step, input);
  await step.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'workflow.step_updated',
    module: 'workflows',
    object_type: 'WorkflowStep',
    object_id: step._id.toString(),
    object_label: step.name,
    before_state: beforeState,
    after_state: {
      name: step.name,
      action_type: step.action_type,
      action_config: step.action_config,
      conditions: step.conditions,
      step_order: step.step_order,
      sla_config: step.sla_config,
    },
  });

  res.status(200).json({ success: true, data: step });
});

/**
 * DELETE /workflows/:id/steps/:stepId
 * Deletes a step from a workflow (draft or disabled only).
 * Produces audit event: workflow.step_deleted
 */
export const deleteWorkflowStep = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  if (workflow.status !== 'draft') {
    throw new AppError('Cannot delete steps from a non-draft workflow. Create a new draft first.', 400, 'CANNOT_MODIFY_PUBLISHED');
  }

  const step = await WorkflowStep.findOne({
    _id: req.params.stepId,
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_id: workflow._id,
  });

  if (!step) {
    throw new AppError('Step not found', 404, 'WORKFLOW_STEP_NOT_FOUND');
  }

  const beforeState = {
    name: step.name,
    action_type: step.action_type,
    step_order: step.step_order,
  };

  await WorkflowStep.deleteOne({ _id: step._id });

  // Audit log
  await auditLogger.log({
    req,
    action: 'workflow.step_deleted',
    module: 'workflows',
    object_type: 'WorkflowStep',
    object_id: step._id.toString(),
    object_label: step.name,
    before_state: beforeState,
    after_state: null,
  });

  res.status(200).json({ success: true, message: 'Step deleted' });
});

/**
 * POST /workflows/:id/steps/reorder
 * Updates step_order for multiple steps (drag-and-drop reordering).
 * Produces audit event: workflow.steps_reordered
 */
export const reorderWorkflowSteps = asyncHandler(async (req: Request, res: Response) => {
  const input = ReorderStepsSchema.parse(req.body);

  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  if (workflow.status !== 'draft') {
    throw new AppError('Cannot reorder steps of a non-draft workflow. Create a new draft first.', 400, 'CANNOT_MODIFY_PUBLISHED');
  }

  // Capture current order before update (for audit trail)
  const currentSteps = await WorkflowStep.find({
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_id: workflow._id,
  }).sort({ step_order: 1 }).select('step_order name');

  // Update each step's step_order
  const updatePromises = input.steps.map((s) =>
    WorkflowStep.updateOne(
      {
        _id: new Types.ObjectId(s.step_id),
        company_id: new Types.ObjectId(req.user.company_id),
        workflow_id: workflow._id,
      },
      { $set: { step_order: s.step_order } }
    )
  );

  await Promise.all(updatePromises);

  // Audit log
  await auditLogger.log({
    req,
    action: 'workflow.steps_reordered',
    module: 'workflows',
    object_type: 'Workflow',
    object_id: workflow._id.toString(),
    object_label: workflow.name,
    before_state: currentSteps.map((s) => ({
      step_id: s._id.toString(),
      step_order: s.step_order,
      name: s.name,
    })),
    after_state: {
      reordered_steps: input.steps.map((s) => ({
        step_id: s.step_id,
        step_order: s.step_order,
      })),
    },
  });

  // Fetch updated steps
  const updatedSteps = await WorkflowStep.find({
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_id: workflow._id,
  }).sort({ step_order: 1 });

  res.status(200).json({ success: true, data: updatedSteps });
});

/**
 * GET /workflows/:id/runs
 * Returns execution history for a workflow.
 */
export const getWorkflowRuns = asyncHandler(async (req: Request, res: Response) => {
  const { status, limit } = req.query;

  const filter: Record<string, unknown> = {
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_id: new Types.ObjectId(req.params.id as string),
  };

  if (status) {
    filter.status = status;
  }

  const limitNum = limit ? parseInt(limit as string, 10) : 50;

  const runs = await WorkflowRun.find(filter)
    .sort({ created_at: -1 })
    .limit(limitNum);

  res.status(200).json({ success: true, data: runs });
});

/**
 * POST /workflows/:id/test
 * Executes a workflow with a mock payload and returns the result.
 * Does NOT change workflow status. Produces audit event: workflow.tested
 */
export const testWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const input = TestWorkflowSchema.parse(req.body);

  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  const event = {
    companyId: req.user.company_id,
    userId: input.user_id,
    userName: input.user_name,
    userEmail: input.user_email,
    trigger: input.trigger,
    lifecycleFrom: input.lifecycle_from,
    lifecycleTo: input.lifecycle_to,
    roleFrom: input.role_from,
    roleTo: input.role_to,
    departmentFrom: input.department_from,
    departmentTo: input.department_to,
  };

  const result = await executeWorkflow(workflow, event);

  // Audit log
  await auditLogger.log({
    req,
    action: 'workflow.tested',
    module: 'workflows',
    object_type: 'Workflow',
    object_id: workflow._id.toString(),
    object_label: workflow.name,
    before_state: null,
    after_state: {
      test_result: {
        status: result.status,
        steps_executed: result.stepsExecuted,
        steps_succeeded: result.stepsSucceeded,
        steps_failed: result.stepsFailed,
        execution_time_ms: result.executionTimeMs,
        error_message: result.errorMessage,
      },
    },
  });

  res.status(200).json({ success: true, data: result });
});

/**
 * POST /workflows/trigger/lifecycle_changed
 * Internal endpoint called when a user's lifecycle state changes.
 * Finds and executes all matching enabled workflows.
 */
export const handleLifecycleTrigger = asyncHandler(async (req: Request, res: Response) => {
  const { user_id, user_name, user_email, lifecycle_from, lifecycle_to } = req.body;

  if (!user_id || !user_name || !lifecycle_from || !lifecycle_to) {
    throw new AppError('Missing required fields', 400, 'MISSING_FIELDS');
  }

  const event = {
    companyId: req.user.company_id,
    userId: user_id,
    userName: user_name,
    userEmail: user_email || '',
    trigger: 'user.lifecycle_changed' as const,
    lifecycleFrom: lifecycle_from,
    lifecycleTo: lifecycle_to,
  };

  const results = await handleLifecycleEvent(event);

  // Audit log — the trigger event itself (individual runs logged by workflowEngine)
  await auditLogger.log({
    req,
    action: 'workflows.lifecycle_triggered',
    module: 'workflows',
    object_type: 'User',
    object_id: user_id,
    object_label: user_name,
    before_state: { lifecycle_from: lifecycle_from },
    after_state: {
      lifecycle_to: lifecycle_to,
      workflows_fired: results.length,
      results: results.map((r) => ({
        workflow_run_id: r.runId,
        status: r.status,
        steps_executed: r.stepsExecuted,
        steps_failed: r.stepsFailed,
      })),
    },
  });

  res.status(200).json({ success: true, data: results });
});

/**
 * POST /workflows/:id/simulate
 * Simulates a workflow with a mock payload to verify conditions and execution path.
 * Does NOT affect real data.
 */
export const simulateWorkflowHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = TestWorkflowSchema.parse(req.body);

  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  const stepCount = await WorkflowStep.countDocuments({
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_id: workflow._id,
  });

  if (stepCount === 0) {
    throw new AppError('Workflow has no steps to simulate', 400, 'EMPTY_WORKFLOW');
  }

  const event = {
    companyId: req.user.company_id,
    userId: input.user_id,
    userName: input.user_name,
    userEmail: input.user_email,
    trigger: input.trigger,
    lifecycleFrom: input.lifecycle_from,
    lifecycleTo: input.lifecycle_to,
    roleFrom: input.role_from,
    roleTo: input.role_to,
    departmentFrom: input.department_from,
    departmentTo: input.department_to,
  };

  const result = await simulateWorkflow(workflow, event);

  res.status(200).json({ success: true, data: result });
});
