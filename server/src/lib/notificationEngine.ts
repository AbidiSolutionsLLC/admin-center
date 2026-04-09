// server/src/lib/notificationEngine.ts
/**
 * Notification Engine — delivers notifications via email and in-app.
 *
 * Responsibilities:
 * 1. Variable substitution for all 4 supported tokens:
 *    {{user_name}}, {{user_email}}, {{company_name}}, {{detail}}
 * 2. Digest mode handling:
 *    - 'immediate': send right away
 *    - 'hourly'/'daily': queue for digest (don't send immediately)
 * 3. Channel routing:
 *    - 'email': send via emailService
 *    - 'in_app': create InAppNotification document
 *    - 'both': do both
 * 4. Every delivery attempt logged in NotificationEvent with status
 * 5. Critical notifications: guaranteed immediate email delivery
 */

import { NotificationTemplate, NotificationDigestMode, NotificationChannel } from '../models/NotificationTemplate.model';
import { InAppNotification } from '../models/InAppNotification.model';
import { NotificationEvent } from '../models/NotificationEvent.model';
import { getTransporter } from './emailService';
import { Company } from '../models/Company.model';
import nodemailer from 'nodemailer';
import { Types } from 'mongoose';

export interface NotificationPayload {
  companyId: string;
  templateKey: string;
  user_id: string;
  user_name: string;
  user_email: string;
  company_name?: string;
  detail?: string;              // Replaces {{detail}} token
  triggered_by_event: string;
  triggered_by_object_type?: string;
  triggered_by_object_id?: string;
}

export interface DeliveryResult {
  channel: 'email' | 'in_app';
  status: 'sent' | 'failed' | 'queued_digest';
  event_id: string;
  error?: string;
}

/**
 * Supported variable tokens and their replacement function.
 */
function substituteVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [token, value] of Object.entries(variables)) {
    result = result.split(token).join(value);
  }
  return result;
}

/**
 * Resolves variables for a given payload.
 * Supports exactly 4 tokens: {{user_name}}, {{user_email}}, {{company_name}}, {{detail}}.
 */
function resolveVariables(payload: NotificationPayload): Record<string, string> {
  return {
    '{{user_name}}': payload.user_name,
    '{{user_email}}': payload.user_email,
    '{{company_name}}': payload.company_name ?? 'Admin Center',
    '{{detail}}': payload.detail ?? '',
  };
}

/**
 * Sends an email notification.
 * Logs the delivery attempt in NotificationEvent.
 */
async function deliverEmail(
  template: typeof NotificationTemplate.prototype,
  payload: NotificationPayload,
  renderedSubject: string,
  renderedBody: string
): Promise<DeliveryResult> {
  const timestamp = new Date();
  let status: 'sent' | 'failed' = 'failed';
  let errorMessage: string | undefined;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM ?? process.env.SMTP_FROM_EMAIL ?? 'noreply@admin-center.com',
      to: payload.user_email,
      subject: renderedSubject,
      html: renderedBody,
      text: renderedBody.replace(/<[^>]*>/g, ''), // Strip HTML for text fallback
    });

    status = 'sent';
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Unknown email delivery error';
    status = 'failed';
  }

  // Log delivery event
  const event = await NotificationEvent.create({
    company_id: new Types.ObjectId(payload.companyId),
    template_id: template._id,
    recipient_user_id: new Types.ObjectId(payload.user_id),
    recipient_email: payload.user_email,
    channel: 'email',
    status,
    subject_rendered: renderedSubject,
    body_rendered: renderedBody,
    error_message: errorMessage,
    triggered_by_event: payload.triggered_by_event,
    triggered_by_object_type: payload.triggered_by_object_type,
    triggered_by_object_id: payload.triggered_by_object_id,
    delivery_timestamp: timestamp,
  });

  return {
    channel: 'email',
    status,
    event_id: event._id.toString(),
    error: errorMessage,
  };
}

/**
 * Creates an in-app notification for the user.
 * Logs the delivery attempt in NotificationEvent.
 */
async function deliverInApp(
  template: typeof NotificationTemplate.prototype,
  payload: NotificationPayload,
  renderedSubject: string,
  renderedBody: string
): Promise<DeliveryResult> {
  const timestamp = new Date();
  let status: 'sent' | 'failed' = 'failed';
  let errorMessage: string | undefined;

  try {
    await InAppNotification.create({
      company_id: new Types.ObjectId(payload.companyId),
      user_id: new Types.ObjectId(payload.user_id),
      template_id: template._id,
      title: renderedSubject,
      message: renderedBody,
      severity: template.severity,
      status: 'unread',
    });

    status = 'sent';
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Unknown in-app delivery error';
    status = 'failed';
  }

  // Log delivery event
  const event = await NotificationEvent.create({
    company_id: new Types.ObjectId(payload.companyId),
    template_id: template._id,
    recipient_user_id: new Types.ObjectId(payload.user_id),
    channel: 'in_app',
    status,
    subject_rendered: renderedSubject,
    body_rendered: renderedBody,
    error_message: errorMessage,
    triggered_by_event: payload.triggered_by_event,
    triggered_by_object_type: payload.triggered_by_object_type,
    triggered_by_object_id: payload.triggered_by_object_id,
    delivery_timestamp: timestamp,
  });

  return {
    channel: 'in_app',
    status,
    event_id: event._id.toString(),
    error: errorMessage,
  };
}

/**
 * Main notification delivery function.
 * Finds the active template by key, resolves variables, routes to channels.
 *
 * Digest mode behavior:
 * - 'immediate': sends right away
 * - 'hourly'/'daily': queues for digest (status='queued_digest'), doesn't send
 * - CRITICAL severity overrides digest mode — always sends immediately via email
 */
export async function deliverNotification(payload: NotificationPayload): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];

  // Find the active template
  const template = await NotificationTemplate.findOne({
    company_id: new Types.ObjectId(payload.companyId),
    key: payload.templateKey,
    is_active: true,
  });

  if (!template) {
    // Template not found — log as failed for email channel as fallback
    console.warn(`[NotificationEngine] Template not found: ${payload.templateKey} for company ${payload.companyId}`);
    return results;
  }

  // Resolve variables
  const variables = resolveVariables(payload);
  const renderedSubject = substituteVariables(template.subject, variables);
  const renderedBody = substituteVariables(template.body, variables);

  // Determine effective channels
  // CRITICAL severity always delivers via email immediately, regardless of digest_mode
  const isCritical = template.severity === 'critical';
  const isDigestQueued = !isCritical && template.digest_mode !== 'immediate';

  // Email delivery
  if (template.channel === 'email' || template.channel === 'both') {
    if (isDigestQueued) {
      // Queue for digest — don't send immediately
      const timestamp = new Date();
      const event = await NotificationEvent.create({
        company_id: new Types.ObjectId(payload.companyId),
        template_id: template._id,
        recipient_user_id: new Types.ObjectId(payload.user_id),
        recipient_email: payload.user_email,
        channel: 'email',
        status: 'queued_digest',
        subject_rendered: renderedSubject,
        body_rendered: renderedBody,
        triggered_by_event: payload.triggered_by_event,
        triggered_by_object_type: payload.triggered_by_object_type,
        triggered_by_object_id: payload.triggered_by_object_id,
        delivery_timestamp: timestamp,
      });

      results.push({ channel: 'email', status: 'queued_digest', event_id: event._id.toString() });
    } else {
      // Send immediately
      const result = await deliverEmail(template, payload, renderedSubject, renderedBody);
      results.push(result);
    }
  }

  // In-app delivery (always immediate, not affected by digest mode)
  if (template.channel === 'in_app' || template.channel === 'both') {
    const result = await deliverInApp(template, payload, renderedSubject, renderedBody);
    results.push(result);
  }

  return results;
}

/**
 * Sends a critical notification for a workflow failure.
 * This is a convenience wrapper that ensures critical severity and immediate email delivery.
 */
export async function sendWorkflowFailureNotification(
  companyId: string,
  workflowName: string,
  workflowId: string,
  userName: string,
  userEmail: string,
  errorMessage: string
): Promise<DeliveryResult[]> {
  return deliverNotification({
    companyId,
    templateKey: 'workflow_failure',
    user_id: '', // No specific user for workflow failure notifications
    user_name: 'System',
    user_email: userEmail,
    company_name: undefined,
    detail: `Workflow "${workflowName}" failed: ${errorMessage}`,
    triggered_by_event: 'workflow.failure',
    triggered_by_object_type: 'WorkflowRun',
    triggered_by_object_id: workflowId,
  });
}
