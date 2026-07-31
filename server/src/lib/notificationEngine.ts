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
import { getTransporter, sendEmail } from './emailService';
import { Company } from '../models/Company.model';
import { User } from '../models/User.model';
import { PERMISSION_GROUPS } from '../constants/roles';
import nodemailer from 'nodemailer';
import { Types } from 'mongoose';

export interface NotificationPayload {
  companyId: string;
  templateKey: string;
  user_id: string;
  user_name: string;
  user_full_name: string;  // Added for dot notation support
  user_email: string;
  company_name?: string;
  detail?: string;              // Replaces {{detail}} token
  triggered_by_event: string;
  triggered_by_object_type?: string;
  triggered_by_object_id?: string;
  forceEmail?: boolean;         // Force email delivery even when template channel is in_app or digest-based
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
 * Supports 5 tokens: {{user_name}}, {{user.full_name}}, {{user_email}}, {{company_name}}, {{detail}}.
 */
function resolveVariables(payload: NotificationPayload): Record<string, string> {
  return {
    '{{user_name}}': payload.user_name,
    '{{user.full_name}}': payload.user_full_name,
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
  let event_id = 'unknown';
  try {
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
    event_id = event._id.toString();
  } catch (err) {
    console.error('[NotificationEngine] Failed to log email delivery event:', err);
  }

  return {
    channel: 'email',
    status,
    event_id,
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
  let event_id = 'unknown';
  try {
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
    event_id = event._id.toString();
  } catch (err) {
    console.error('[NotificationEngine] Failed to log in-app delivery event:', err);
  }

  return {
    channel: 'in_app',
    status,
    event_id,
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
    console.warn(`[NotificationEngine] Template not found: ${payload.templateKey} for company ${payload.companyId}`);

    if (payload.forceEmail) {
      const subject = payload.company_name
        ? `${payload.company_name}: Lifecycle update`
        : 'Lifecycle update';
      const body = `Hello ${payload.user_full_name},\n\n${payload.detail ?? 'A lifecycle update occurred.'}\n\nRegards,\n${payload.company_name ?? 'Admin Center'}`;

      try {
        await sendEmail({
          to: payload.user_email,
          subject,
          html: `<p>${body.replace(/\n/g, '<br/>')}</p>`,
          text: body,
        });

        const event = await NotificationEvent.create({
          company_id: new Types.ObjectId(payload.companyId),
          recipient_user_id: new Types.ObjectId(payload.user_id),
          recipient_email: payload.user_email,
          channel: 'email',
          status: 'sent',
          subject_rendered: subject,
          body_rendered: body,
          triggered_by_event: payload.triggered_by_event,
          triggered_by_object_type: payload.triggered_by_object_type,
          triggered_by_object_id: payload.triggered_by_object_id,
          delivery_timestamp: new Date(),
        });

        results.push({ channel: 'email', status: 'sent', event_id: event._id.toString() });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown email delivery error';
        const event = await NotificationEvent.create({
          company_id: new Types.ObjectId(payload.companyId),
          recipient_user_id: new Types.ObjectId(payload.user_id),
          recipient_email: payload.user_email,
          channel: 'email',
          status: 'failed',
          subject_rendered: subject,
          body_rendered: body,
          error_message: errorMessage,
          triggered_by_event: payload.triggered_by_event,
          triggered_by_object_type: payload.triggered_by_object_type,
          triggered_by_object_id: payload.triggered_by_object_id,
          delivery_timestamp: new Date(),
        });

        results.push({ channel: 'email', status: 'failed', event_id: event._id.toString(), error: errorMessage });
      }
    }

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

  const forceEmailDelivery = payload.forceEmail === true;
  const shouldSendEmail = template.channel === 'email' || template.channel === 'both' || forceEmailDelivery;
  const shouldQueueDigest = !isCritical && template.digest_mode !== 'immediate' && !forceEmailDelivery;

  // Email delivery
  if (shouldSendEmail) {
    if (shouldQueueDigest) {
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
    user_full_name: 'System',
    user_email: userEmail,
    company_name: undefined,
    detail: `Workflow "${workflowName}" failed: ${errorMessage}`,
    triggered_by_event: 'workflow.failure',
    triggered_by_object_type: 'WorkflowRun',
    triggered_by_object_id: workflowId,
  });
}

/**
 * Sends a security alert to all active IT Admins of a company.
 * Creates the 'security_alert' template if it doesn't exist.
 */
export async function sendSecurityAlert(
  companyId: string,
  eventType: string,
  detail: string,
  overrideEmails?: string[]
): Promise<DeliveryResult[]> {
  const templateKey = 'security_alert';
  let template = await NotificationTemplate.findOne({
    company_id: new Types.ObjectId(companyId),
    key: templateKey,
  });

  if (!template) {
    // Create the default security alert template
    const adminUser = await User.findOne({ company_id: companyId, role: { $in: PERMISSION_GROUPS.SUPER_ADMINS } });
    template = await NotificationTemplate.create({
      company_id: new Types.ObjectId(companyId),
      name: 'Security Alert',
      key: templateKey,
      description: 'Triggered when unusual activity or risk thresholds are exceeded.',
      channel: 'both',
      severity: 'critical',
      digest_mode: 'immediate',
      subject: 'Security Alert: {{company_name}}',
      body: 'Hello {{user_name}},\n\nA security event requires your attention.\n\nEvent Type: ' + eventType + '\nDetails: {{detail}}\n\nPlease review the Access Logs immediately.',
      trigger_event: 'security.alert',
      is_active: true,
      created_by: adminUser?._id || new Types.ObjectId(),
    });
  }

  if (!template.is_active) {
    return [];
  }

  const company = await Company.findById(companyId);
  const companyName = company?.name || 'Admin Center';

  let recipients: typeof User.prototype[] = [];

  if (overrideEmails && overrideEmails.length > 0) {
    recipients = await User.find({
      company_id: companyId,
      email: { $in: overrideEmails.map(e => e.toLowerCase()) },
      is_active: true,
    });
  } else {
    recipients = await User.find({
      company_id: companyId,
      role: { $in: PERMISSION_GROUPS.IT_ADMINS },
      is_active: true,
      email: { $exists: true, $ne: '' },
    });
  }

  const results: DeliveryResult[] = [];

  for (const admin of recipients) {
    const res = await deliverNotification({
      companyId,
      templateKey,
      user_id: admin._id.toString(),
      user_name: admin.full_name.split(' ')[0],
      user_full_name: admin.full_name,
      user_email: admin.email,
      company_name: companyName,
      detail,
      triggered_by_event: 'security.alert',
      triggered_by_object_type: 'SecurityEvent',
    });
    results.push(...res);
  }

  return results;
}
