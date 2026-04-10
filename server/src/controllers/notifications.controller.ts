// server/src/controllers/notifications.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { NotificationTemplate, SUPPORTED_VARIABLES } from '../models/NotificationTemplate.model';
import { InAppNotification } from '../models/InAppNotification.model';
import { NotificationEvent } from '../models/NotificationEvent.model';
import { Company } from '../models/Company.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
import { Types } from 'mongoose';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  key: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/, 'Key must be lowercase with hyphens/underscores'),
  description: z.string().max(500).optional(),
  channel: z.enum(['email', 'in_app', 'both']),
  severity: z.enum(['info', 'warning', 'critical']).default('info'),
  digest_mode: z.enum(['immediate', 'hourly', 'daily']).default('immediate'),
  subject: z.string().min(1).max(300),
  body: z.string().min(1),
  trigger_event: z.string().min(1),
});

const UpdateTemplateSchema = CreateTemplateSchema.partial();

const TestTemplateSchema = z.object({
  user_name: z.string().default('Test User'),
  user_full_name: z.string().default('Test User Full Name'),
  user_email: z.string().email(),
  company_name: z.string().optional(),
  detail: z.string().optional(),
});

// ── Controllers: Templates ──────────────────────────────────────────────────

/**
 * GET /notifications/templates
 * Returns all notification templates for the current company.
 */
export const getTemplates = asyncHandler(async (req: Request, res: Response) => {
  const { trigger_event, is_active } = req.query;

  const filter: Record<string, unknown> = {
    company_id: new Types.ObjectId(req.user.company_id),
  };

  if (trigger_event) {
    filter.trigger_event = trigger_event;
  }

  if (is_active !== undefined) {
    filter.is_active = is_active === 'true';
  }

  const templates = await NotificationTemplate.find(filter)
    .populate('created_by', 'full_name email')
    .populate('updated_by', 'full_name email')
    .sort({ created_at: -1 });

  res.status(200).json({ success: true, data: templates });
});

/**
 * GET /notifications/templates/variables
 * Returns the list of supported variable tokens.
 */
export const getSupportedVariables = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: SUPPORTED_VARIABLES });
});

/**
 * GET /notifications/templates/:id
 * Returns a single notification template.
 */
export const getTemplateById = asyncHandler(async (req: Request, res: Response) => {
  const template = await NotificationTemplate.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  }).populate('created_by', 'full_name email');

  if (!template) {
    throw new AppError('Notification template not found', 404, 'TEMPLATE_NOT_FOUND');
  }

  res.status(200).json({ success: true, data: template });
});

/**
 * POST /notifications/templates
 * Creates a new notification template.
 * Produces audit event: notification_template.created
 */
export const createTemplate = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateTemplateSchema.parse(req.body);

  const template = await NotificationTemplate.create({
    ...input,
    company_id: new Types.ObjectId(req.user.company_id),
    created_by: new Types.ObjectId(req.user.userId),
    is_active: true,
  });

  // Audit log
  await auditLogger.log({
    req,
    action: 'notification_template.created',
    module: 'notifications',
    object_type: 'NotificationTemplate',
    object_id: template._id.toString(),
    object_label: template.name,
    before_state: null,
    after_state: template.toObject(),
  });

  const populated = await NotificationTemplate.findById(template._id).populate(
    'created_by',
    'full_name email'
  );

  res.status(201).json({ success: true, data: populated });
});

/**
 * PUT /notifications/templates/:id
 * Updates a notification template.
 * Produces audit event: notification_template.updated
 */
export const updateTemplate = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateTemplateSchema.parse(req.body);

  const template = await NotificationTemplate.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!template) {
    throw new AppError('Notification template not found', 404, 'TEMPLATE_NOT_FOUND');
  }

  const beforeState = template.toObject();

  Object.assign(template, input);
  template.updated_by = new Types.ObjectId(req.user.userId);
  await template.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'notification_template.updated',
    module: 'notifications',
    object_type: 'NotificationTemplate',
    object_id: template._id.toString(),
    object_label: template.name,
    before_state: beforeState,
    after_state: template.toObject(),
  });

  const populated = await NotificationTemplate.findById(template._id).populate(
    'created_by',
    'full_name email'
  );

  res.status(200).json({ success: true, data: populated });
});

/**
 * DELETE /notifications/templates/:id
 * Soft-deletes a notification template (sets is_active = false).
 * Produces audit event: notification_template.deleted
 */
export const deleteTemplate = asyncHandler(async (req: Request, res: Response) => {
  const template = await NotificationTemplate.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
    is_active: true,
  });

  if (!template) {
    throw new AppError('Notification template not found', 404, 'TEMPLATE_NOT_FOUND');
  }

  const beforeState = template.toObject();

  template.is_active = false;
  await template.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'notification_template.deleted',
    module: 'notifications',
    object_type: 'NotificationTemplate',
    object_id: template._id.toString(),
    object_label: template.name,
    before_state: beforeState,
    after_state: { is_active: false },
  });

  res.status(200).json({ success: true, message: 'Template deleted' });
});

/**
 * POST /notifications/templates/:id/test
 * Tests variable substitution by rendering the template with mock data.
 * Does NOT send actual email — returns rendered subject/body.
 * Produces audit event: notification_template.tested
 */
export const testTemplate = asyncHandler(async (req: Request, res: Response) => {
  const input = TestTemplateSchema.parse(req.body);

  const template = await NotificationTemplate.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!template) {
    throw new AppError('Notification template not found', 404, 'TEMPLATE_NOT_FOUND');
  }

  // Resolve variables
  const company = await Company.findById(req.user.company_id);
  const variables: Record<string, string> = {
    '{{user_name}}': input.user_name,
    '{{user.full_name}}': input.user_full_name,
    '{{user_email}}': input.user_email,
    '{{company_name}}': input.company_name ?? company?.name ?? 'Admin Center',
    '{{detail}}': input.detail ?? '',
  };

  // Substitute
  let renderedSubject = template.subject;
  let renderedBody = template.body;
  for (const [token, value] of Object.entries(variables)) {
    renderedSubject = renderedSubject.split(token).join(value);
    renderedBody = renderedBody.split(token).join(value);
  }

  // Audit log
  await auditLogger.log({
    req,
    action: 'notification_template.tested',
    module: 'notifications',
    object_type: 'NotificationTemplate',
    object_id: template._id.toString(),
    object_label: template.name,
    before_state: null,
    after_state: {
      test_payload: input,
      rendered_subject: renderedSubject,
      rendered_body_preview: renderedBody.substring(0, 200),
    },
  });

  res.status(200).json({
    success: true,
    data: {
      rendered_subject: renderedSubject,
      rendered_body: renderedBody,
      variables_used: variables,
    },
  });
});

// ── Controllers: In-App Notifications ───────────────────────────────────────

/**
 * GET /notifications/in-app
 * Returns in-app notifications for the current user.
 */
export const getInAppNotifications = asyncHandler(async (req: Request, res: Response) => {
  const { status, limit } = req.query;

  const filter: Record<string, unknown> = {
    company_id: new Types.ObjectId(req.user.company_id),
    user_id: new Types.ObjectId(req.user.userId),
  };

  if (status) {
    filter.status = status;
  }

  const limitNum = limit ? parseInt(limit as string, 10) : 50;

  const notifications = await InAppNotification.find(filter)
    .populate('template_id', 'key severity')
    .sort({ created_at: -1 })
    .limit(limitNum);

  res.status(200).json({ success: true, data: notifications });
});

/**
 * GET /notifications/in-app/unread-count
 * Returns the count of unread in-app notifications for the current user.
 */
export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const count = await InAppNotification.countDocuments({
    company_id: new Types.ObjectId(req.user.company_id),
    user_id: new Types.ObjectId(req.user.userId),
    status: 'unread',
  });

  res.status(200).json({ success: true, data: { count } });
});

/**
 * POST /notifications/in-app/:id/read
 * Marks an in-app notification as read.
 * Produces audit event: notification.read
 */
export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const notification = await InAppNotification.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
    user_id: new Types.ObjectId(req.user.userId),
  });

  if (!notification) {
    throw new AppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
  }

  if (notification.status === 'read') {
    return res.status(200).json({ success: true, message: 'Already read' });
  }

  notification.status = 'read';
  notification.read_at = new Date();
  await notification.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'notification.read',
    module: 'notifications',
    object_type: 'InAppNotification',
    object_id: notification._id.toString(),
    object_label: notification.title,
    before_state: { status: 'unread' },
    after_state: { status: 'read', read_at: notification.read_at },
  });

  res.status(200).json({ success: true, data: notification });
});

/**
 * POST /notifications/in-app/mark-all-read
 * Marks all in-app notifications as read for the current user.
 * Produces audit event: notification.mark_all_read
 */
export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  const result = await InAppNotification.updateMany(
    {
      company_id: new Types.ObjectId(req.user.company_id),
      user_id: new Types.ObjectId(req.user.userId),
      status: 'unread',
    },
    { $set: { status: 'read', read_at: new Date() } }
  );

  // Audit log
  await auditLogger.log({
    req,
    action: 'notification.mark_all_read',
    module: 'notifications',
    object_type: 'InAppNotification',
    object_id: req.user.userId,
    object_label: `User ${req.user.userId}`,
    before_state: null,
    after_state: { marked_count: result.modifiedCount },
  });

  res.status(200).json({ success: true, data: { marked_count: result.modifiedCount } });
});

// ── Controllers: Delivery Log (read-only) ───────────────────────────────────

/**
 * GET /notifications/events
 * Returns delivery event log for the current company.
 */
export const getDeliveryEvents = asyncHandler(async (req: Request, res: Response) => {
  const { template_id, status, channel, limit } = req.query;

  const filter: Record<string, unknown> = {
    company_id: new Types.ObjectId(req.user.company_id),
  };

  if (template_id) {
    filter.template_id = new Types.ObjectId(template_id as string);
  }

  if (status) {
    filter.status = status;
  }

  if (channel) {
    filter.channel = channel;
  }

  const limitNum = limit ? parseInt(limit as string, 10) : 100;

  const events = await NotificationEvent.find(filter)
    .populate('template_id', 'name key')
    .populate('recipient_user_id', 'full_name email')
    .sort({ delivery_timestamp: -1 })
    .limit(limitNum);

  res.status(200).json({ success: true, data: events });
});
