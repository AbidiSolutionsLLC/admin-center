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
import { User } from '../models/User.model';
import { Company } from '../models/Company.model';
import { ApprovalRequest } from '../models/ApprovalRequest.model';
import { deliverNotification, sendWorkflowFailureNotification } from './notificationEngine';
import { Types } from 'mongoose';

export interface LifecycleEvent {
  companyId: string;
  userId: string;
  userName: string;
  userEmail: string;
  trigger: string;
  lifecycleFrom?: string;
  lifecycleTo?: string;
  roleFrom?: string;
  roleTo?: string;
  departmentFrom?: string;
  departmentTo?: string;
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
  slaStatus?: 'ok' | 'breached' | 'pending';
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
      case 'send_email': {
        const templateKey = (step.action_config.template_key as string) || 'default_lifecycle_notification';
        const company = await Company.findById(event.companyId);
        
        const results = await deliverNotification({
          companyId: event.companyId,
          templateKey,
          user_id: event.userId,
          user_name: event.userName.split(' ')[0],
          user_full_name: event.userName,
          user_email: event.userEmail,
          company_name: company?.name,
          detail: `Lifecycle change: ${event.lifecycleFrom} → ${event.lifecycleTo}`,
          triggered_by_event: 'user.lifecycle_changed',
        });

        const failed = results.find(r => r.status === 'failed');
        if (failed) {
          stepResult.success = false;
          stepResult.error = `Email delivery failed: ${failed.error}`;
        } else {
          stepResult.output = { results };
        }
        break;
      }

      case 'notify_manager': {
        const user = await User.findById(event.userId).select('manager_id');
        if (!user || !user.manager_id) {
          stepResult.success = true; // Skip if no manager, but don't fail the workflow
          stepResult.output = { note: 'No manager to notify' };
          break;
        }

        const manager = await User.findById(user.manager_id).select('email full_name');
        if (!manager) {
          stepResult.success = false;
          stepResult.error = 'Manager record not found';
          break;
        }

        const company = await Company.findById(event.companyId);
        const templateKey = (step.action_config.template_key as string) || 'manager_lifecycle_alert';

        const results = await deliverNotification({
          companyId: event.companyId,
          templateKey,
          user_id: manager._id.toString(),
          user_name: manager.full_name.split(' ')[0],
          user_full_name: manager.full_name,
          user_email: manager.email,
          company_name: company?.name,
          detail: `Team member ${event.userName} transitioned from ${event.lifecycleFrom} to ${event.lifecycleTo}`,
          triggered_by_event: 'user.lifecycle_changed',
        });

        const failed = results.find(r => r.status === 'failed');
        if (failed) {
          stepResult.success = false;
          stepResult.error = `Manager notification failed: ${failed.error}`;
        } else {
          stepResult.output = { results };
        }
        break;
      }

      case 'assign_role':
        // TODO: Integrate with RBAC in Phase 2
        stepResult.output = { note: 'Role assignment (to be implemented with RBAC module)', config: step.action_config };
        break;
      case 'revoke_access':
        // TODO: Integrate with session management in Phase 2
        stepResult.output = { note: 'Access revocation (to be implemented with Auth module)', config: step.action_config };
        break;
      case 'update_field':
        // TODO: Integrate with user model in Phase 2
        stepResult.output = { note: 'Field update (to be implemented with User Management)', config: step.action_config };
        break;
      case 'create_task':
        // TODO: Integrate with task system in Phase 2
        stepResult.output = { note: 'Task creation (to be implemented with Task Management)', config: step.action_config };
        break;
      case 'webhook':
        // TODO: Execute webhook URL in Phase 2
        stepResult.output = { note: 'Webhook (to be implemented with Integration Engine)', config: step.action_config };
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

export async function executeWorkflow(
  workflow: typeof Workflow.prototype,
  event: LifecycleEvent,
  existingRunId?: string
): Promise<WorkflowExecutionResult> {
  const startTime = Date.now();
  const stepResults: StepExecutionResult[] = [];
  let stepsExecuted = 0;
  let stepsSucceeded = 0;
  let stepsFailed = 0;
  let errorMessage: string | undefined;
  let status: WorkflowRunStatus = 'success';
  let run: typeof WorkflowRun.prototype | null = null;

  try {
    if (existingRunId) {
      run = await WorkflowRun.findById(existingRunId);
      if (!run) throw new Error('WorkflowRun not found');
      stepsExecuted = run.steps_executed;
      stepsSucceeded = run.steps_succeeded;
      stepsFailed = run.steps_failed;
    } else {
      run = await WorkflowRun.create({
        company_id: new Types.ObjectId(event.companyId),
        workflow_id: workflow._id,
        triggered_by: event.trigger,
        triggered_by_object_id: event.userId,
        triggered_by_label: event.userName,
        status: 'success',
        steps_executed: 0,
        steps_succeeded: 0,
        steps_failed: 0,
        event_payload: { ...event } as Record<string, unknown>,
        execution_time_ms: 0,
        step_results: [],
        sla_status: 'pending',
      });
    }

    // Fetch steps ordered by step_order
    const steps = await WorkflowStep.find({
      company_id: new Types.ObjectId(event.companyId),
      workflow_id: workflow._id,
      is_active: true,
    }).sort({ step_order: 1 });

    // Execute steps sequentially
    for (let i = stepsExecuted; i < steps.length; i++) {
      const step = steps[i];
      
      // Evaluate conditions if any
      let conditionsMet = true;
      if (step.conditions && step.conditions.length > 0) {
        // Resolve field against event payload
        const getNestedValue = (obj: any, path: string) => path.split('.').reduce((acc, part) => acc && acc[part], obj);
        
        for (const condition of step.conditions) {
          const actualValue = getNestedValue(event, condition.field);
          
          let matches = false;
          switch (condition.operator) {
            case 'equals':
              matches = String(actualValue) === String(condition.value);
              break;
            case 'not_equals':
              matches = String(actualValue) !== String(condition.value);
              break;
            case 'contains':
              matches = String(actualValue).includes(String(condition.value));
              break;
            case 'greater_than':
              matches = Number(actualValue) > Number(condition.value);
              break;
            case 'less_than':
              matches = Number(actualValue) < Number(condition.value);
              break;
          }
          
          if (!matches) {
            conditionsMet = false;
            break;
          }
        }
      }

      if (!conditionsMet) {
        stepResults.push({
          stepId: step._id.toString(),
          stepName: step.name,
          actionType: step.action_type,
          success: true, // skipped is technically not a failure
          output: { note: 'Step skipped due to unmatched conditions' },
        });
        
        run?.step_results?.push({
          step_id: step._id,
          step_name: step.name,
          action_type: step.action_type,
          status: 'skipped',
          execution_time_ms: 0,
          started_at: new Date(),
          completed_at: new Date(),
          sla_breached: false,
        });

        stepsExecuted++;
        stepsSucceeded++;
        continue;
      }
      
      const stepStartTime = Date.now();
      
      if (step.action_type === 'require_approval') {
        // Pause here
        const approverUserIds = (step.action_config.approver_user_ids as string[]) || [];
        const approvalCondition = (step.action_config.approval_condition as 'any' | 'all') || 'any';
        const approval = await ApprovalRequest.create({
          company_id: step.company_id,
          workflow_run_id: run._id,
          workflow_step_id: step._id,
          approver_user_ids: approverUserIds,
          approval_condition: approvalCondition,
          status: 'pending',
          decisions: []
        });
        
        // Notify approvers on task assignment
        const company = await Company.findById(event.companyId);
        for (const approverId of approverUserIds) {
           const user = await User.findById(approverId);
           if (user) {
              await deliverNotification({
                 companyId: event.companyId,
                 templateKey: 'task_assignment_alert',
                 user_id: user._id.toString(),
                 user_name: user.full_name.split(' ')[0],
                 user_full_name: user.full_name,
                 user_email: user.email,
                 company_name: company?.name,
                 detail: `You have been assigned a new task: "${step.name}". Please review and approve.`,
                 triggered_by_event: 'workflow.task_assigned',
                 forceEmail: true,
              }).catch(err => console.error('[NotificationEngine] Task assignment notification failed:', err));
           }
        }
        
        run?.step_results?.push({
          step_id: step._id,
          step_name: step.name,
          action_type: step.action_type,
          status: 'pending',
          execution_time_ms: 0,
          started_at: new Date(),
          sla_breached: false,
        });
        
        status = 'pending_approval';
        break;
      }

      stepsExecuted++;
      const result = await executeStep(step, event);
      stepResults.push(result);
      
      const stepExecutionTimeMs = Date.now() - stepStartTime;
      const stepSlaBreached = step.sla_config?.threshold_minutes 
        ? stepExecutionTimeMs > step.sla_config.threshold_minutes * 60000 
        : false;

      run?.step_results?.push({
        step_id: step._id,
        step_name: step.name,
        action_type: step.action_type,
        status: result.success ? 'success' : 'failure',
        execution_time_ms: stepExecutionTimeMs,
        started_at: new Date(stepStartTime),
        completed_at: new Date(),
        sla_breached: stepSlaBreached,
      });

      if (result.success) {
        stepsSucceeded++;
      } else {
        stepsFailed++;
        errorMessage = `Step "${step.name}" failed: ${result.error}`;
        status = 'failure';
        break; // Fail fast: stop on first failure
      }
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Unknown execution error';
    status = 'failure';
  }

  const executionTimeMs = Date.now() - startTime;
  
  if (status !== 'pending_approval') {
    status = stepsFailed > 0 && stepsSucceeded > 0
      ? 'partial'
      : stepsFailed > 0
        ? 'failure'
        : 'success';
  }

  let slaStatus: 'ok' | 'breached' | 'pending' = 'pending';
  const totalExecutionTimeMs = (run?.execution_time_ms || 0) + executionTimeMs;
  if (status !== 'pending_approval') {
    if (workflow.sla_config?.threshold_minutes && totalExecutionTimeMs > workflow.sla_config.threshold_minutes * 60000) {
      slaStatus = 'breached';
    } else {
      slaStatus = 'ok';
    }
  }

  // Update the workflow run
  if (run) {
    run.status = status;
    run.steps_executed = stepsExecuted;
    run.steps_succeeded = stepsSucceeded;
    run.steps_failed = stepsFailed;
    run.error_message = errorMessage;
    if (errorMessage) {
      run.error_details = { last_failed_step: stepResults.find((r) => !r.success) };
    }
    run.execution_time_ms = totalExecutionTimeMs;
    run.sla_status = slaStatus;
    await run.save();
  }

  // Create intelligence insight on failure
  if (status === 'failure' && run) {
    await Insight.create({
      company_id: new Types.ObjectId(event.companyId),
      category: 'health',
      severity: 'critical',
      title: `Workflow "${workflow.name}" failed`,
      description: `Workflow execution failed for user ${event.userName} on event ${event.trigger}.`,
      reasoning: errorMessage || 'Unknown error during workflow execution.',
      affected_object_type: 'Workflow',
      affected_object_id: workflow._id.toString(),
      affected_object_label: workflow.name,
      remediation_url: `/workflows/${workflow._id}`,
      remediation_action: 'review_workflow_steps',
      is_resolved: false,
      detected_at: new Date(),
    });

    // Send critical notification via email for workflow failure
    sendWorkflowFailureNotification(
      event.companyId,
      workflow.name,
      workflow._id.toString(),
      event.userName,
      event.userEmail,
      errorMessage || 'Unknown error'
    ).catch((notifError) => {
      console.error('[NotificationEngine] Workflow failure notification failed:', notifError);
    });
  } else if (status === 'success' && run) {
    // Notify on successful workflow completion
    const company = await Company.findById(event.companyId);
    const user = await User.findById(event.userId);
    if (user) {
       await deliverNotification({
           companyId: event.companyId,
           templateKey: 'workflow_completion_alert',
           user_id: user._id.toString(),
           user_name: user.full_name.split(' ')[0],
           user_full_name: user.full_name,
           user_email: user.email,
           company_name: company?.name,
           detail: `The workflow "${workflow.name}" has been completed successfully.`,
           triggered_by_event: 'workflow.completed',
           forceEmail: true,
       }).catch(err => console.error('[NotificationEngine] Workflow completion notification failed:', err));
    }
  }

  return {
    runId: run ? run._id.toString() : '',
    status,
    stepsExecuted,
    stepsSucceeded,
    stepsFailed,
    stepResults,
    executionTimeMs,
    slaStatus,
    errorMessage,
  };
}

/**
 * Resumes a paused workflow (pending approval)
 */
export async function resumeWorkflow(runId: string, approved: boolean, decidedBy: string): Promise<void> {
  const run = await WorkflowRun.findById(runId);
  if (!run) throw new Error('Run not found');
  const workflow = await Workflow.findById(run.workflow_id);
  if (!workflow) throw new Error('Workflow not found');

  if (!approved) {
    run.status = 'failure';
    run.error_message = 'Workflow execution was rejected by an approver.';
    await run.save();
    
    // Log failure
    await Insight.create({
      company_id: run.company_id,
      category: 'health',
      severity: 'warning',
      title: `Workflow "${workflow.name}" rejected`,
      description: `Workflow execution was rejected for user ${run.triggered_by_label}.`,
      reasoning: run.error_message,
      affected_object_type: 'Workflow',
      affected_object_id: workflow._id.toString(),
      affected_object_label: workflow.name,
      remediation_url: `/workflows/${workflow._id}`,
      remediation_action: 'review_rejection',
      is_resolved: false,
      detected_at: new Date(),
    });
    return;
  }

  const event = run.event_payload as unknown as LifecycleEvent;
  if (!event) throw new Error('Event payload missing from WorkflowRun, cannot resume');

  // Update the pending step result
  const pendingStep = run.step_results?.find(s => s.status === 'pending');
  if (pendingStep) {
    const completedAt = new Date();
    const executionTimeMs = completedAt.getTime() - pendingStep.started_at.getTime();
    
    const step = await WorkflowStep.findById(pendingStep.step_id);
    const stepSlaBreached = step?.sla_config?.threshold_minutes 
        ? executionTimeMs > step.sla_config.threshold_minutes * 60000 
        : false;

    pendingStep.status = 'success';
    pendingStep.completed_at = completedAt;
    pendingStep.execution_time_ms = executionTimeMs;
    pendingStep.sla_breached = stepSlaBreached;
    run.execution_time_ms = (run.execution_time_ms || 0) + executionTimeMs;
  }

  // Increment stepsExecuted because the approval step was successful.
  run.steps_executed += 1;
  run.steps_succeeded += 1;
  await run.save();

  await executeWorkflow(workflow, event, run._id.toString());
}

/**
 * Handle a lifecycle_changed event.
 * Finds all enabled workflows matching the trigger config and executes them.
 */
export async function handleLifecycleEvent(event: LifecycleEvent): Promise<WorkflowExecutionResult[]> {
  // Find all enabled workflows that match this trigger
  const matchQuery: any = {
    company_id: new Types.ObjectId(event.companyId),
    trigger: event.trigger,
    status: 'published' as WorkflowStatus,
    is_active: true,
  };

  if (event.trigger === 'user.lifecycle_changed') {
    matchQuery['trigger_config.lifecycle_from'] = event.lifecycleFrom;
    matchQuery['trigger_config.lifecycle_to'] = event.lifecycleTo;
  } else if (event.trigger === 'user.role_changed') {
    if (event.roleFrom) matchQuery['trigger_config.role_from'] = event.roleFrom;
    if (event.roleTo) matchQuery['trigger_config.role_to'] = event.roleTo;
  } else if (event.trigger === 'user.department_changed') {
    if (event.departmentFrom) matchQuery['trigger_config.department_from'] = event.departmentFrom;
    if (event.departmentTo) matchQuery['trigger_config.department_to'] = event.departmentTo;
  }
  // For user.created, no config needed

  const workflows = await Workflow.find(matchQuery);

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
        triggered_by: event.trigger,
        triggered_by_object_id: event.userId,
        triggered_by_label: event.userName,
        status: 'failure' as WorkflowRunStatus,
        steps_executed: 0,
        steps_succeeded: 0,
        steps_failed: 0,
        error_message: errorMessage,
        execution_time_ms: 0,
        step_results: [],
        sla_status: 'pending'
      });

      // Create insight for failed workflow
      await Insight.create({
        company_id: new Types.ObjectId(event.companyId),
        category: 'health',
        severity: 'critical',
        title: `Workflow "${workflow.name}" failed to execute`,
        description: `Workflow failed for user ${event.userName} on event ${event.trigger}.`,
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
        slaStatus: 'pending',
        errorMessage,
      });
    }
  }

  return results;
}

export interface SimulationResult {
  stepId: string;
  stepName: string;
  actionType: string;
  conditionsMet: boolean;
  executed: boolean;
  reason?: string;
  simulatedOutput?: Record<string, unknown>;
}

export interface WorkflowSimulationResult {
  status: 'simulated';
  stepsEvaluated: number;
  stepsTriggered: number;
  stepsSkipped: number;
  stepResults: SimulationResult[];
}

/**
 * Simulates a workflow execution.
 * Evaluates conditions and steps but does NOT affect real data or execute external services.
 */
export async function simulateWorkflow(
  workflow: typeof Workflow.prototype,
  event: LifecycleEvent
): Promise<WorkflowSimulationResult> {
  const stepResults: SimulationResult[] = [];
  let stepsEvaluated = 0;
  let stepsTriggered = 0;
  let stepsSkipped = 0;

  // Fetch steps ordered by step_order
  const steps = await WorkflowStep.find({
    company_id: new Types.ObjectId(event.companyId),
    workflow_id: workflow._id,
    is_active: true,
  }).sort({ step_order: 1 });

  const getNestedValue = (obj: any, path: string) => {
    if (!path || !obj) return undefined;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  };

  for (const step of steps) {
    stepsEvaluated++;
    
    // Evaluate conditions if any
    let conditionsMet = true;
    let failedCondition = null;
    
    if (step.conditions && step.conditions.length > 0) {
      for (const condition of step.conditions) {
        const actualValue = getNestedValue(event, condition.field);
        
        let matches = false;
        switch (condition.operator) {
          case 'equals':
            matches = String(actualValue) === String(condition.value);
            break;
          case 'not_equals':
            matches = String(actualValue) !== String(condition.value);
            break;
          case 'contains':
            matches = String(actualValue).includes(String(condition.value));
            break;
          case 'greater_than':
            matches = Number(actualValue) > Number(condition.value);
            break;
          case 'less_than':
            matches = Number(actualValue) < Number(condition.value);
            break;
        }
        
        if (!matches) {
          conditionsMet = false;
          failedCondition = condition;
          break;
        }
      }
    }

    if (!conditionsMet) {
      stepsSkipped++;
      stepResults.push({
        stepId: step._id.toString(),
        stepName: step.name,
        actionType: step.action_type,
        conditionsMet: false,
        executed: false,
        reason: `Skipped: condition '${failedCondition?.field} ${failedCondition?.operator} ${failedCondition?.value}' not met (was '${getNestedValue(event, failedCondition?.field!)}')`,
      });
      continue;
    }
    
    stepsTriggered++;
    stepResults.push({
      stepId: step._id.toString(),
      stepName: step.name,
      actionType: step.action_type,
      conditionsMet: true,
      executed: true,
      reason: 'Conditions met, action would be executed',
      simulatedOutput: {
        note: `Action ${step.action_type} execution simulated`,
        config: step.action_config
      }
    });
  }

  return {
    status: 'simulated',
    stepsEvaluated,
    stepsTriggered,
    stepsSkipped,
    stepResults,
  };
}
