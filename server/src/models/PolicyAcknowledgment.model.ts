// server/src/models/PolicyAcknowledgment.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IPolicyAcknowledgment extends Document {
  company_id: Types.ObjectId;
  policy_version_id: Types.ObjectId;  // Reference to the specific PolicyVersion
  user_id: Types.ObjectId;            // User who acknowledged
  acknowledged_at: Date;
  ip_address?: string;
  user_agent?: string;
}

const PolicyAcknowledgmentSchema = new Schema<IPolicyAcknowledgment>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  policy_version_id: { type: Schema.Types.ObjectId, ref: 'PolicyVersion', required: true, index: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  acknowledged_at: { type: Date, default: Date.now },
  ip_address: { type: String },
  user_agent: { type: String },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// ── Indexes ──────────────────────────────────────────────────────────────────
// CRITICAL: Compound unique index - one acknowledgment per user + policy version
PolicyAcknowledgmentSchema.index({ user_id: 1, policy_version_id: 1 }, { unique: true });
// Index for querying all acknowledgments by company
PolicyAcknowledgmentSchema.index({ company_id: 1, acknowledged_at: -1 });
// Index for querying acknowledgments by policy version
PolicyAcknowledgmentSchema.index({ company_id: 1, policy_version_id: 1 });
// Index for querying acknowledgments by user
PolicyAcknowledgmentSchema.index({ company_id: 1, user_id: 1 });

export const PolicyAcknowledgment = model<IPolicyAcknowledgment>('PolicyAcknowledgment', PolicyAcknowledgmentSchema);
