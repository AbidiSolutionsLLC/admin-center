// server/src/models/InAppNotification.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type InAppNotificationStatus = 'unread' | 'read';

export interface IInAppNotification extends Document {
  company_id: Types.ObjectId;
  user_id: Types.ObjectId;          // The recipient user
  template_id?: Types.ObjectId;     // Optional: which template generated this
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  status: InAppNotificationStatus;
  link_url?: string;                // Optional: click-through link
  read_at?: Date;
  created_at: Date;
}

const InAppNotificationSchema = new Schema<IInAppNotification>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  template_id: { type: Schema.Types.ObjectId, ref: 'NotificationTemplate' },
  title: { type: String, required: true, maxlength: 200 },
  message: { type: String, required: true },
  severity: { type: String, enum: ['info', 'warning', 'critical'], required: true },
  status: { type: String, enum: ['unread', 'read'], default: 'unread', index: true },
  link_url: { type: String },
  read_at: { type: Date },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

// Indexes
InAppNotificationSchema.index({ company_id: 1, user_id: 1, status: 1, created_at: -1 });
InAppNotificationSchema.index({ company_id: 1, user_id: 1, status: 1 });

export const InAppNotification = model<IInAppNotification>('InAppNotification', InAppNotificationSchema);
