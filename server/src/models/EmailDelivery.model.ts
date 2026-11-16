// server/src/models/EmailDelivery.model.ts
// E-mail outbox and delivery log (Plan 0.6, DRD §5.3). One row per message. `html_enc` / `text_enc` hold the body
// encrypted with cryptoService (a body can contain a raw invitation token) and are removed when the row reaches
// `sent` or finally `failed`.
import { Schema, model, Document, Types } from 'mongoose';

export type EmailDeliveryStatus = 'queued' | 'sending' | 'sent' | 'failed';
export type EmailRelatedType = 'invitation' | 'user' | 'operator';

export interface IEmailDelivery extends Document {
  company_id?: Types.ObjectId;
  to: string;
  template: string;
  subject: string;
  html_enc?: string;
  text_enc?: string;
  related?: { type: EmailRelatedType; id: string };
  status: EmailDeliveryStatus;
  attempts: number;
  next_attempt_at: Date;
  locked_until?: Date;
  last_error?: string;
  provider_message_id?: string;
  sent_at?: Date;
  created_at: Date;
}

const EmailDeliverySchema = new Schema<IEmailDelivery>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company' },
  to: { type: String, required: true },
  template: { type: String, required: true, default: 'custom' },
  subject: { type: String, required: true },
  html_enc: String,
  text_enc: String,
  related: {
    type: { type: String, enum: ['invitation', 'user', 'operator'] },
    id: String,
  },
  status: { type: String, enum: ['queued', 'sending', 'sent', 'failed'], required: true, default: 'queued' },
  attempts: { type: Number, default: 0 },
  next_attempt_at: { type: Date, default: Date.now },
  locked_until: Date,
  last_error: String,
  provider_message_id: String,
  sent_at: Date,
  created_at: { type: Date, default: Date.now },
}, { timestamps: false });

EmailDeliverySchema.index({ status: 1, next_attempt_at: 1 });
EmailDeliverySchema.index({ 'related.type': 1, 'related.id': 1, created_at: -1 });
EmailDeliverySchema.index({ company_id: 1, created_at: -1 });
EmailDeliverySchema.index({ created_at: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export const EmailDelivery = model<IEmailDelivery>('EmailDelivery', EmailDeliverySchema);
