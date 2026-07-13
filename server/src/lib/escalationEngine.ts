import { ApprovalRequest } from '../models/ApprovalRequest.model';
import { WorkflowStep } from '../models/WorkflowStep.model';
import { Insight } from '../models/Insight.model';
import { auditLogger } from './auditLogger';
import { deliverNotification } from './notificationEngine';
import { Company } from '../models/Company.model';
import { User } from '../models/User.model';
import { Types } from 'mongoose';

/**
 * processEscalations
 * Periodically called to find pending ApprovalRequests that have exceeded their timeout
 * and triggers fallback assignment/notifications.
 */
export async function processEscalations() {
  try {
    // 1. Find all pending ApprovalRequests
    const pendingApprovals = await ApprovalRequest.find({ status: 'pending' }).populate('workflow_step_id');

    for (const approval of pendingApprovals) {
      const step = approval.workflow_step_id as any; // populated step document
      
      // 2. Check SLA Breach
      if (step && step.sla_config && step.sla_config.threshold_minutes && !approval.sla_alert_sent) {
        const slaThresholdMs = step.sla_config.threshold_minutes * 60 * 1000;
        const now = new Date().getTime();
        const createdTime = new Date(approval.created_at).getTime();

        if (now - createdTime > slaThresholdMs) {
          // SLA Breached
          approval.sla_alert_sent = true;
          await approval.save();

          await Insight.create({
            company_id: approval.company_id,
            category: 'health',
            severity: 'critical',
            title: `SLA Breached: Step "${step.name}"`,
            description: `Approval request in step "${step.name}" has breached its SLA of ${step.sla_config.threshold_minutes} minutes.`,
            reasoning: 'The step execution time exceeded the defined SLA threshold.',
            affected_object_type: 'ApprovalRequest',
            affected_object_id: approval._id.toString(),
            affected_object_label: 'SLA Breach',
            remediation_url: `/workflows`,
            remediation_action: 'review_approvals',
            is_resolved: false,
            detected_at: new Date(),
          });

          if (step.sla_config.notify_on_breach) {
             const company = await Company.findById(approval.company_id);
             // Notify current approvers about the breach
             for (const approverId of approval.approver_user_ids) {
               const user = await User.findById(approverId);
               if (user) {
                  await deliverNotification({
                    companyId: approval.company_id.toString(),
                    templateKey: 'sla_breach_alert',
                    user_id: user._id.toString(),
                    user_name: user.full_name.split(' ')[0],
                    user_full_name: user.full_name,
                    user_email: user.email,
                    company_name: company?.name,
                    detail: `An approval request has breached its SLA threshold.`,
                    triggered_by_event: 'workflow.sla_breach',
                  });
               }
             }
          }

          console.log(`[EscalationEngine] SLA breached for approval ${approval._id}.`);
        }
      }
      
      // 3. Check if this step has an escalation policy
      if (!step || !step.action_config || !step.action_config.escalations) {
        continue;
      }
      
      const escalations: any[] = step.action_config.escalations;
      
      for (const escalation of escalations) {
        const timeoutHours = escalation.timeout_hours;
        if (!timeoutHours || typeof timeoutHours !== 'number') continue;

        const timeoutMs = timeoutHours * 60 * 60 * 1000;
        const now = new Date().getTime();
        const createdTime = new Date(approval.created_at).getTime();

        // 3. If exceeded timeout, escalate
        if (now - createdTime > timeoutMs) {
          // Check if we already escalated this (we need a way to track if this escalation fired).
          // For MVP, we can check if the current approvers exactly match the fallback.
          const fallbackIds: string[] = escalation.fallback_approver_ids || [];
          
          const currentApproverIds = approval.approver_user_ids.map(id => id.toString());
          const alreadyEscalated = fallbackIds.length > 0 && fallbackIds.every(id => currentApproverIds.includes(id));
          
          if (alreadyEscalated) {
            continue; // We already added them
          }

          // 4. Reassign/Add fallback approvers
          const newApproverIds = Array.from(new Set([...currentApproverIds, ...fallbackIds]));
          approval.approver_user_ids = newApproverIds.map(id => new Types.ObjectId(id));
          await approval.save();

          // 5. Notify fallback approver
          if (escalation.notify_fallback) {
             const company = await Company.findById(approval.company_id);
             for (const fallbackId of fallbackIds) {
               const user = await User.findById(fallbackId);
               if (user) {
                  await deliverNotification({
                    companyId: approval.company_id.toString(),
                    templateKey: 'escalated_approval_alert',
                    user_id: user._id.toString(),
                    user_name: user.full_name.split(' ')[0],
                    user_full_name: user.full_name,
                    user_email: user.email,
                    company_name: company?.name,
                    detail: `An approval request has been escalated to you due to timeout.`,
                    triggered_by_event: 'workflow.escalated',
                  });
               }
             }
          }

          // 6. Log the escalation
          await Insight.create({
            company_id: approval.company_id,
            category: 'health',
            severity: 'warning',
            title: `Approval Request Escalated`,
            description: `Approval request in step "${step.name}" was escalated after ${timeoutHours} hours.`,
            reasoning: 'Fallback approvers have been notified and assigned.',
            affected_object_type: 'ApprovalRequest',
            affected_object_id: approval._id.toString(),
            affected_object_label: 'Pending Approval',
            remediation_url: `/workflows`,
            remediation_action: 'review_approvals',
            is_resolved: false,
            detected_at: new Date(),
          });
          
          await auditLogger.log({
            req: {
              ip: '127.0.0.1',
              headers: { 'user-agent': 'system-escalation-engine' }
            } as any,
            action: 'approval.escalated',
            module: 'workflows',
            object_type: 'ApprovalRequest',
            object_id: approval._id.toString(),
            object_label: 'Approval Request',
            before_state: { approver_user_ids: currentApproverIds },
            after_state: { approver_user_ids: newApproverIds },
            actor_override: {
              userId: 'system',
              email: 'system@admin-center.com',
              company_id: approval.company_id
            }
          });
          
          console.log(`[EscalationEngine] Escalated approval ${approval._id} to fallbacks.`);
        }
      }
    }
  } catch (error) {
    console.error('[EscalationEngine] Error processing escalations:', error);
  }
}
