import { Schema, model, Document, Types } from 'mongoose';

export interface IAuditEvent extends Document {
  company_id: Types.ObjectId;
  actor_id: Types.ObjectId;
  actor_email: string;
  action: string;
  module: string;
  object_type: string;
  object_id: string;
  object_label: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

const AuditEventSchema = new Schema<IAuditEvent>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  actor_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actor_email: { type: String, required: true },
  action: { type: String, required: true },
  module: { type: String, required: true },
  object_type: { type: String, required: true },
  object_id: { type: String, required: true },
  object_label: { type: String, required: true },
  before_state: Schema.Types.Mixed,
  after_state: Schema.Types.Mixed,
  ip_address: String,
  user_agent: String,
}, { timestamps: { createdAt: 'created_at' }, versionKey: false });

export const AuditEvent = model<IAuditEvent>('AuditEvent', AuditEventSchema);
