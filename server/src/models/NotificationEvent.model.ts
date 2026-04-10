// server/src/models/NotificationEvent.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type NotificationDeliveryStatus = 'pending' | 'sent' | 'failed' | 'queued_digest';

/**
 * Immutable delivery log. Every notification attempt is recorded here.
 * NO update/delete routes exist for this collection.
 */
export interface INotificationEvent extends Document {
  company_id: Types.ObjectId;
  template_id: Types.ObjectId;
  recipient_user_id?: Types.ObjectId;
  recipient_email?: string;
  channel: 'email' | 'in_app';
  status: NotificationDeliveryStatus;
  subject_rendered?: string;         // Subject after variable substitution
  body_rendered?: string;            // Body after variable substitution
  error_message?: string;
  triggered_by_event: string;        // e.g., 'workflow.failure'
  triggered_by_object_type?: string; // e.g., 'WorkflowRun'
  triggered_by_object_id?: string;
  delivery_timestamp: Date;
}

const NotificationEventSchema = new Schema<INotificationEvent>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  template_id: { type: Schema.Types.ObjectId, ref: 'NotificationTemplate', required: true, index: true },
  recipient_user_id: { type: Schema.Types.ObjectId, ref: 'User' },
  recipient_email: { type: String },
  channel: { type: String, enum: ['email', 'in_app'], required: true },
  status: { type: String, enum: ['pending', 'sent', 'failed', 'queued_digest'], required: true },
  subject_rendered: { type: String },
  body_rendered: { type: String },
  error_message: { type: String },
  triggered_by_event: { type: String, required: true, index: true },
  triggered_by_object_type: { type: String },
  triggered_by_object_id: { type: String },
  delivery_timestamp: { type: Date, default: Date.now, index: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: false }, versionKey: false });

// Indexes for querying delivery history
NotificationEventSchema.index({ company_id: 1, template_id: 1, status: 1, delivery_timestamp: -1 });
NotificationEventSchema.index({ company_id: 1, recipient_user_id: 1, delivery_timestamp: -1 });
NotificationEventSchema.index({ company_id: 1, triggered_by_event: 1, delivery_timestamp: -1 });

export const NotificationEvent = model<INotificationEvent>('NotificationEvent', NotificationEventSchema);
