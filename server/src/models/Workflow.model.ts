// server/src/models/Workflow.model.ts
import { Schema, model, Document, Types } from 'mongoose';

import { AppError } from '../utils/AppError';

export type WorkflowTrigger = 'user.lifecycle_changed' | 'user.created' | 'user.role_changed' | 'user.department_changed';
export type WorkflowStatus = 'draft' | 'published' | 'archived';

export interface IWorkflow extends Document {
  company_id: Types.ObjectId;
  workflow_key: string;
  version_number: number;
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  trigger_config?: {
    lifecycle_from?: string[]; // e.g., ['active', 'probation']
    lifecycle_to?: string[];   // e.g., ['terminated', 'on_leave']
    role_from?: string[];
    role_to?: string[];
    department_from?: string[];
    department_to?: string[];
  };
  status: WorkflowStatus;
  is_active: boolean;
  sla_config?: {
    threshold_minutes: number;
    notify_on_breach: boolean;
  };
  created_by: Types.ObjectId;
  updated_by?: Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const WorkflowSchema = new Schema<IWorkflow>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  workflow_key: { type: String, required: true, index: true },
  version_number: { type: Number, required: true, default: 1 },
  name: { type: String, required: true, maxlength: 200 },
  description: { type: String, maxlength: 1000 },
  trigger: { type: String, enum: ['user.lifecycle_changed', 'user.created', 'user.role_changed', 'user.department_changed'], required: true },
  trigger_config: {
    lifecycle_from: [{ type: String }],
    lifecycle_to: [{ type: String }],
    role_from: [{ type: String }],
    role_to: [{ type: String }],
    department_from: [{ type: String }],
    department_to: [{ type: String }],
  },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
  is_active: { type: Boolean, default: true },
  sla_config: {
    threshold_minutes: { type: Number },
    notify_on_breach: { type: Boolean, default: false }
  },
  created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updated_by: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Indexes
WorkflowSchema.index({ company_id: 1, workflow_key: 1, version_number: 1 }, { unique: true });
WorkflowSchema.index({ company_id: 1, status: 1 });
WorkflowSchema.index({ company_id: 1, trigger: 1 });
WorkflowSchema.index({ company_id: 1, is_active: 1 });

// ── Immutability Guard ───────────────────────────────────────────────────────
WorkflowSchema.pre('save', function() {
  if (this.isModified() && !this.isNew && this.status === 'published' && !this.isModified('status')) {
    throw new AppError('Cannot modify published workflow version. Create a new draft instead.', 400, 'CANNOT_MODIFY_PUBLISHED');
  }
});

WorkflowSchema.pre('updateOne', function() {
  const filter = this.getFilter();
  const update = this.getUpdate() as any;
  if (filter.status === 'published' && (!update.$set || update.$set.status !== 'archived')) {
    throw new AppError('Cannot update published workflow version. Create a new draft instead.', 400, 'CANNOT_MODIFY_PUBLISHED');
  }
});

WorkflowSchema.pre('findOneAndUpdate', function() {
  const filter = this.getFilter();
  const update = this.getUpdate() as any;
  if (filter.status === 'published' && (!update.$set || update.$set.status !== 'archived')) {
    throw new AppError('Cannot update published workflow version. Create a new draft instead.', 400, 'CANNOT_MODIFY_PUBLISHED');
  }
});

export const Workflow = model<IWorkflow>('Workflow', WorkflowSchema);
