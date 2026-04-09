// server/src/lib/workflowEngine.ts
/**
 * Workflow Engine — executes enabled workflows on lifecycle events.
 *
 * Responsibilities:
 * 1. Match lifecycle events to enabled workflows via trigger_config
 * 2. Execute workflow steps sequentially in order of step_order
 * 3. Log every execution as a WorkflowRun (success or failure)
 * 4. Create intelligence insight on failure
 * 5. Return execution result for test endpoint
 */

import { Workflow, WorkflowStatus } from '../models/Workflow.model';
import { WorkflowStep } from '../models/WorkflowStep.model';
import { WorkflowRun, WorkflowRunStatus } from '../models/WorkflowRun.model';
import { Insight } from '../models/Insight.model';
import { Types } from 'mongoose';

export interface LifecycleEvent {
  companyId: string;
  userId: string;
  userName: string;
  userEmail: string;
  lifecycleFrom: string;
  lifecycleTo: string;
}

export interface StepExecutionResult {
  stepId: string;
  stepName: string;
  actionType: string;
  success: boolean;
  error?: string;
  output?: Record<string, unknown>;
}

export interface WorkflowExecutionResult {
  runId: string;
  status: WorkflowRunStatus;
  stepsExecuted: number;
  stepsSucceeded: number;
  stepsFailed: number;
  stepResults: StepExecutionResult[];
  executionTimeMs: number;
  errorMessage?: string;
}

/**
 * Execute a single workflow step.
 * In Phase 1, steps are simulated with audit-style logging.
 * In Phase 2, each action_type connects to a real service (email, RBAC, etc.).
 */
async function executeStep(
  step: typeof WorkflowStep.prototype,
  event: LifecycleEvent
): Promise<StepExecutionResult> {
  const stepResult: StepExecutionResult = {
    stepId: step._id.toString(),
    stepName: step.name,
    actionType: step.action_type,
    success: true,
    output: { event, config: step.action_config },
  };

  try {
    // Phase 1: Simulate step execution with logging
    // Phase 2: Connect to real services
    switch (step.action_type) {
      case 'send_email':
        // TODO: Integrate with emailService in Phase 2
        stepResult.output = { note: 'Email would be sent', config: step.action_config };
        break;
      case 'assign_role':
        // TODO: Integrate with RBAC in Phase 2
        stepResult.output = { note: 'Role would be assigned', config: step.action_config };
        break;
      case 'revoke_access':
        // TODO: Integrate with session management in Phase 2
        stepResult.output = { note: 'Access would be revoked', config: step.action_config };
        break;
      case 'notify_manager':
        // TODO: Integrate with notification service in Phase 2
        stepResult.output = { note: 'Manager would be notified', config: step.action_config };
        break;
      case 'update_field':
        // TODO: Integrate with user model in Phase 2
        stepResult.output = { note: 'Field would be updated', config: step.action_config };
        break;
      case 'create_task':
        // TODO: Integrate with task system in Phase 2
        stepResult.output = { note: 'Task would be created', config: step.action_config };
        break;
      case 'webhook':
        // TODO: Execute webhook URL in Phase 2
        stepResult.output = { note: 'Webhook would be called', config: step.action_config };
        break;
      default:
        stepResult.success = false;
        stepResult.error = `Unknown action type: ${step.action_type}`;
    }

    return stepResult;
  } catch (error) {
    stepResult.success = false;
    stepResult.error = error instanceof Error ? error.message : 'Unknown step execution error';
    return stepResult;
  }
}

/**
 * Execute a workflow for a given lifecycle event.
 * Returns a WorkflowExecutionResult with step-by-step results.
 */
export async function executeWorkflow(
  workflow: typeof Workflow.prototype,
  event: LifecycleEvent
): Promise<WorkflowExecutionResult> {
  const startTime = Date.now();
  const stepResults: StepExecutionResult[] = [];
  let stepsExecuted = 0;
  let stepsSucceeded = 0;
  let stepsFailed = 0;
  let errorMessage: string | undefined;

  try {
    // Fetch steps ordered by step_order
    const steps = await WorkflowStep.find({
      company_id: new Types.ObjectId(event.companyId),
      workflow_id: workflow._id,
      is_active: true,
    }).sort({ step_order: 1 });

    // Execute steps sequentially
    for (const step of steps) {
      stepsExecuted++;
      const result = await executeStep(step, event);
      stepResults.push(result);

      if (result.success) {
        stepsSucceeded++;
      } else {
        stepsFailed++;
      }

      // Fail fast: stop on first failure
      if (!result.success) {
        errorMessage = `Step "${step.name}" failed: ${result.error}`;
        break;
      }
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Unknown execution error';
  }

  const executionTimeMs = Date.now() - startTime;
  const status: WorkflowRunStatus =
    stepsFailed > 0 && stepsSucceeded > 0
      ? 'partial'
      : stepsFailed > 0
        ? 'failure'
        : 'success';

  // Log the workflow run
  const run = await WorkflowRun.create({
    company_id: new Types.ObjectId(event.companyId),
    workflow_id: workflow._id,
    triggered_by: event.lifecycleTo ? 'user.lifecycle_changed' : 'test',
    triggered_by_object_id: event.userId,
    triggered_by_label: event.userName,
    status,
    steps_executed: stepsExecuted,
    steps_succeeded: stepsSucceeded,
    steps_failed: stepsFailed,
    error_message: errorMessage,
    error_details: errorMessage ? { last_failed_step: stepResults.find((r) => !r.success) } : undefined,
    execution_time_ms: executionTimeMs,
  });

  // Create intelligence insight on failure
  if (status === 'failure') {
    await Insight.create({
      company_id: new Types.ObjectId(event.companyId),
      category: 'health',
      severity: 'critical',
      title: `Workflow "${workflow.name}" failed`,
      description: `Workflow execution failed for user ${event.userName} on lifecycle change ${event.lifecycleFrom} → ${event.lifecycleTo}.`,
      reasoning: errorMessage || 'Unknown error during workflow execution.',
      affected_object_type: 'Workflow',
      affected_object_id: workflow._id.toString(),
      affected_object_label: workflow.name,
      remediation_url: `/workflows/${workflow._id}`,
      remediation_action: 'review_workflow_steps',
      is_resolved: false,
      detected_at: new Date(),
    });
  }

  return {
    runId: run._id.toString(),
    status,
    stepsExecuted,
    stepsSucceeded,
    stepsFailed,
    stepResults,
    executionTimeMs,
    errorMessage,
  };
}

/**
 * Handle a lifecycle_changed event.
 * Finds all enabled workflows matching the trigger config and executes them.
 */
export async function handleLifecycleEvent(event: LifecycleEvent): Promise<WorkflowExecutionResult[]> {
  // Find all enabled workflows that match this lifecycle transition
  const workflows = await Workflow.find({
    company_id: new Types.ObjectId(event.companyId),
    trigger: 'user.lifecycle_changed',
    status: 'enabled' as WorkflowStatus,
    is_active: true,
    'trigger_config.lifecycle_from': event.lifecycleFrom,
    'trigger_config.lifecycle_to': event.lifecycleTo,
  });

  const results: WorkflowExecutionResult[] = [];

  for (const workflow of workflows) {
    try {
      const result = await executeWorkflow(workflow, event);
      results.push(result);
    } catch (error) {
      // Log a failed run even if the workflow engine throws
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const run = await WorkflowRun.create({
        company_id: new Types.ObjectId(event.companyId),
        workflow_id: workflow._id,
        triggered_by: 'user.lifecycle_changed',
        triggered_by_object_id: event.userId,
        triggered_by_label: event.userName,
        status: 'failure' as WorkflowRunStatus,
        steps_executed: 0,
        steps_succeeded: 0,
        steps_failed: 0,
        error_message: errorMessage,
        execution_time_ms: 0,
      });

      // Create insight for failed workflow
      await Insight.create({
        company_id: new Types.ObjectId(event.companyId),
        category: 'health',
        severity: 'critical',
        title: `Workflow "${workflow.name}" failed to execute`,
        description: `Workflow failed for user ${event.userName} on ${event.lifecycleFrom} → ${event.lifecycleTo}.`,
        reasoning: errorMessage,
        affected_object_type: 'Workflow',
        affected_object_id: workflow._id.toString(),
        affected_object_label: workflow.name,
        remediation_url: `/workflows/${workflow._id}`,
        remediation_action: 'review_workflow_steps',
        is_resolved: false,
        detected_at: new Date(),
      });

      results.push({
        runId: run._id.toString(),
        status: 'failure',
        stepsExecuted: 0,
        stepsSucceeded: 0,
        stepsFailed: 0,
        stepResults: [],
        executionTimeMs: 0,
        errorMessage,
      });
    }
  }

  return results;
}
