// server/src/models/NotificationTemplate.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type NotificationChannel = 'email' | 'in_app' | 'both';
export type NotificationDigestMode = 'immediate' | 'hourly' | 'daily';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

/**
 * Supported variable tokens for template substitution.
 * Available tokens: {{user_name}}, {{user.full_name}}, {{user_email}}, {{company_name}}, {{detail}}
 */
export const SUPPORTED_VARIABLES = [
  '{{user_name}}',
  '{{user.full_name}}',
  '{{user_email}}',
  '{{company_name}}',
  '{{detail}}',
] as const;

export interface INotificationTemplate extends Document {
  company_id: Types.ObjectId;
  name: string;
  key: string;                      // Unique slug (e.g., 'workflow_failure')
  description?: string;
  channel: NotificationChannel;
  severity: NotificationSeverity;
  digest_mode: NotificationDigestMode;
  subject: string;                  // Email subject (supports variables)
  body: string;                     // Email body / in-app message (supports variables)
  trigger_event: string;            // e.g., 'workflow.failure', 'user.lifecycle_changed'
  is_active: boolean;
  created_by: Types.ObjectId;
  updated_by?: Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const NotificationTemplateSchema = new Schema<INotificationTemplate>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true, maxlength: 200 },
  key: { type: String, required: true, maxlength: 100 },
  description: { type: String, maxlength: 500 },
  channel: { type: String, enum: ['email', 'in_app', 'both'], required: true },
  severity: { type: String, enum: ['info', 'warning', 'critical'], required: true, default: 'info' },
  digest_mode: { type: String, enum: ['immediate', 'hourly', 'daily'], required: true, default: 'immediate' },
  subject: { type: String, required: true, maxlength: 300 },
  body: { type: String, required: true },
  trigger_event: { type: String, required: true, index: true },
  is_active: { type: Boolean, default: true },
  created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updated_by: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Indexes
NotificationTemplateSchema.index({ company_id: 1, key: 1 }, { unique: true });
NotificationTemplateSchema.index({ company_id: 1, trigger_event: 1, is_active: 1 });

export const NotificationTemplate = model<INotificationTemplate>('NotificationTemplate', NotificationTemplateSchema);
