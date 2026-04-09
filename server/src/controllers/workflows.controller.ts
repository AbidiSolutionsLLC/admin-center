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
import { executeWorkflow, handleLifecycleEvent } from '../lib/workflowEngine';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const CreateWorkflowSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional(),
  trigger: z.enum(['user.lifecycle_changed']),
  trigger_config: z.object({
    lifecycle_from: z.array(z.string()).min(1, 'At least one source state required'),
    lifecycle_to: z.array(z.string()).min(1, 'At least one target state required'),
  }),
});

const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  trigger_config: z
    .object({
      lifecycle_from: z.array(z.string()).min(1),
      lifecycle_to: z.array(z.string()).min(1),
    })
    .optional(),
});

const CreateStepSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  action_type: z.enum([
    'send_email',
    'assign_role',
    'revoke_access',
    'notify_manager',
    'update_field',
    'create_task',
    'webhook',
  ]),
  action_config: z.record(z.string(), z.unknown()).default({}),
  step_order: z.number().int().min(0),
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
  lifecycle_from: z.string().min(1, 'lifecycle_from is required'),
  lifecycle_to: z.string().min(1, 'lifecycle_to is required'),
});

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /workflows
 * Returns all workflows for the current company with optional status filter.
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

  const workflows = await Workflow.find(filter)
    .populate('created_by', 'full_name email')
    .populate('updated_by', 'full_name email')
    .sort({ created_at: -1 });

  res.status(200).json({ success: true, data: workflows });
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

  const workflow = await Workflow.create({
    ...input,
    company_id: new Types.ObjectId(req.user.company_id),
    created_by: new Types.ObjectId(req.user.userId),
    status: 'draft',
    is_active: true,
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

  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  if (workflow.status !== 'draft') {
    throw new AppError('Cannot update non-draft workflows. Disable first.', 400, 'CANNOT_MODIFY_ENABLED');
  }

  const beforeState = {
    name: workflow.name,
    description: workflow.description,
    trigger_config: workflow.trigger_config,
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
    },
  });

  const populated = await Workflow.findById(workflow._id).populate(
    'created_by',
    'full_name email'
  );

  res.status(200).json({ success: true, data: populated });
});

/**
 * POST /workflows/:id/enable
 * Enables a draft workflow.
 * Produces audit event: workflow.enabled
 */
export const enableWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  if (workflow.status !== 'draft') {
    throw new AppError('Only draft workflows can be enabled', 400, 'INVALID_STATUS');
  }

  const beforeState = { status: workflow.status };

  workflow.status = 'enabled';
  await workflow.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'workflow.enabled',
    module: 'workflows',
    object_type: 'Workflow',
    object_id: workflow._id.toString(),
    object_label: workflow.name,
    before_state: beforeState,
    after_state: { status: 'enabled' },
  });

  res.status(200).json({ success: true, data: workflow });
});

/**
 * POST /workflows/:id/disable
 * Disables an enabled workflow.
 * Produces audit event: workflow.disabled
 */
export const disableWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await Workflow.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404, 'WORKFLOW_NOT_FOUND');
  }

  if (workflow.status === 'draft') {
    throw new AppError('Draft workflows cannot be disabled. Delete instead.', 400, 'INVALID_STATUS');
  }

  const beforeState = { status: workflow.status };

  workflow.status = 'disabled';
  await workflow.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'workflow.disabled',
    module: 'workflows',
    object_type: 'Workflow',
    object_id: workflow._id.toString(),
    object_label: workflow.name,
    before_state: beforeState,
    after_state: { status: 'disabled' },
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
    throw new AppError('Can only delete draft workflows. Disable first.', 400, 'CANNOT_DELETE_ENABLED');
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

  if (workflow.status === 'enabled') {
    throw new AppError('Cannot add steps to an enabled workflow. Disable first.', 400, 'CANNOT_MODIFY_ENABLED');
  }

  const step = await WorkflowStep.create({
    ...input,
    company_id: new Types.ObjectId(req.user.company_id),
    workflow_id: workflow._id,
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
      step_order: step.step_order,
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

  if (workflow.status === 'enabled') {
    throw new AppError('Cannot update steps of an enabled workflow. Disable first.', 400, 'CANNOT_MODIFY_ENABLED');
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
    step_order: step.step_order,
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
      step_order: step.step_order,
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

  if (workflow.status === 'enabled') {
    throw new AppError('Cannot delete steps from an enabled workflow. Disable first.', 400, 'CANNOT_MODIFY_ENABLED');
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

  if (workflow.status === 'enabled') {
    throw new AppError('Cannot reorder steps of an enabled workflow. Disable first.', 400, 'CANNOT_MODIFY_ENABLED');
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
    lifecycleFrom: input.lifecycle_from,
    lifecycleTo: input.lifecycle_to,
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
