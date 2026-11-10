import { Schema, model, Document, Types } from 'mongoose';
import crypto from 'crypto';
import { AppError } from '../utils/AppError';

export interface IAuditEvent extends Document {
  company_id: Types.ObjectId;
  actor_id?: Types.ObjectId | null;
  actor_email: string;
  action: string;
  module: string;
  category?: string;
  object_type: string;
  object_id: string;
  object_label: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  ip_address?: string;
  user_agent?: string;
  hash?: string;
  /** 09 §7 — 'operator' when mirrored from the operator realm */
  source?: string;
  correlation_id?: string;
  created_at: Date;
}

const AuditEventSchema = new Schema<IAuditEvent>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  actor_id: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  actor_email: { type: String, required: true },
  action: { type: String, required: true },
  module: { type: String, required: true },
  category: { type: String, default: 'System' },
  object_type: { type: String, required: true },
  object_id: { type: String, required: true },
  object_label: { type: String, required: true },
  before_state: Schema.Types.Mixed,
  after_state: Schema.Types.Mixed,
  ip_address: String,
  user_agent: String,
  hash: { type: String },
  source: { type: String },
  correlation_id: { type: String, index: true },
}, { timestamps: { createdAt: 'created_at' }, versionKey: false });

// ── Indexes for efficient querying ──────────────────────────────────────────
AuditEventSchema.index({ company_id: 1, created_at: -1 });
AuditEventSchema.index({ company_id: 1, module: 1, created_at: -1 });
AuditEventSchema.index({ company_id: 1, actor_id: 1, created_at: -1 });
AuditEventSchema.index({ company_id: 1, action: 1, created_at: -1 });
AuditEventSchema.index({ company_id: 1, category: 1, created_at: -1 });
AuditEventSchema.index({ object_type: 1, object_id: 1 });

// ── Immutability Guard & Integrity Check ────────────────────────────────────

AuditEventSchema.pre('save', function () {
  if (!this.isNew) {
    throw new AppError('Audit logs are immutable and cannot be modified.', 400, 'CANNOT_MODIFY_AUDIT_LOG');
  }

  // Ensure company_id is present on all audit events (Multi-Tenant Isolation)
  if (!this.company_id) {
    throw new AppError('Audit log missing company_id — multi-tenant isolation requirement violated.', 400, 'MISSING_COMPANY_ID');
  }

  // Generate integrity hash (SHA-256) based on log data
  const dataToHash = JSON.stringify({
    company_id: this.company_id?.toString(),
    actor_id: this.actor_id?.toString() || null,
    actor_email: this.actor_email,
    action: this.action,
    module: this.module,
    category: this.category || 'System',
    object_type: this.object_type,
    object_id: this.object_id,
    before_state: this.before_state || null,
    after_state: this.after_state || null,
  });
  
  this.hash = crypto.createHash('sha256').update(dataToHash).digest('hex');
});

const blockMutation = function() {
  throw new AppError('Audit logs are immutable and cannot be modified or deleted.', 400, 'CANNOT_MODIFY_AUDIT_LOG');
};

AuditEventSchema.pre('updateOne', blockMutation);
AuditEventSchema.pre('updateMany', blockMutation);
AuditEventSchema.pre('findOneAndUpdate', blockMutation);
AuditEventSchema.pre('deleteOne', blockMutation);
AuditEventSchema.pre('deleteMany', blockMutation);
AuditEventSchema.pre('findOneAndDelete', blockMutation);

export const AuditEvent = model<IAuditEvent>('AuditEvent', AuditEventSchema);

