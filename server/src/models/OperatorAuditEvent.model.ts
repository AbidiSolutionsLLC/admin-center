// server/src/models/OperatorAuditEvent.model.ts — 09 §7
import { Schema, model, Document, Types } from 'mongoose';

export const AUDIT_CATEGORIES = ['tenant', 'plan', 'entitlement', 'onboarding', 'operator', 'product', 'security', 'system'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export interface IOperatorAuditEvent extends Document {
  operator_id: Types.ObjectId;
  operator_email: string;
  action: string;
  target_type: string;
  target_id?: string;
  company_id?: Types.ObjectId;
  details?: Record<string, unknown>;
  category: AuditCategory;
  before?: unknown; // changed fields only; secrets are never stored
  after?: unknown;
  reason?: string;
  result: 'success' | 'failure';
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
  category: { type: String, enum: AUDIT_CATEGORIES, default: 'system' },
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  reason: { type: String, maxlength: 500 },
  result: { type: String, enum: ['success', 'failure'], default: 'success' },
  correlation_id: String,
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

OperatorAuditEventSchema.index({ created_at: -1 });
OperatorAuditEventSchema.index({ company_id: 1, created_at: -1 });
OperatorAuditEventSchema.index({ operator_id: 1, created_at: -1 });
OperatorAuditEventSchema.index({ category: 1, created_at: -1 });

export const OperatorAuditEvent = model<IOperatorAuditEvent>('OperatorAuditEvent', OperatorAuditEventSchema);
