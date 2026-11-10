// server/src/models/OperatorAuditEvent.model.ts — 09 §7
import { Schema, model, Document, Types } from 'mongoose';

export interface IOperatorAuditEvent extends Document {
  operator_id: Types.ObjectId;
  operator_email: string;
  action: string;
  target_type: string;
  target_id?: string;
  company_id?: Types.ObjectId;
  details?: Record<string, unknown>;
  correlation_id?: string;
  created_at: Date;
}

const OperatorAuditEventSchema = new Schema<IOperatorAuditEvent>({
  operator_id: { type: Schema.Types.ObjectId, ref: 'OperatorAccount', required: true },
  operator_email: { type: String, required: true },
  action: { type: String, required: true },
  target_type: { type: String, required: true },
  target_id: String,
  company_id: { type: Schema.Types.ObjectId, ref: 'Company' },
  details: Schema.Types.Mixed,
  correlation_id: String,
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

OperatorAuditEventSchema.index({ created_at: -1 });

export const OperatorAuditEvent = model<IOperatorAuditEvent>('OperatorAuditEvent', OperatorAuditEventSchema);
