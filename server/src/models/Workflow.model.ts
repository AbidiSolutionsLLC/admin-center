// server/src/models/Workflow.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type WorkflowTrigger = 'user.lifecycle_changed';
export type WorkflowStatus = 'draft' | 'enabled' | 'disabled';

export interface IWorkflow extends Document {
  company_id: Types.ObjectId;
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  trigger_config: {
    lifecycle_from: string[]; // e.g., ['active', 'probation']
    lifecycle_to: string[];   // e.g., ['terminated', 'on_leave']
  };
  status: WorkflowStatus;
  is_active: boolean;
  created_by: Types.ObjectId;
  updated_by?: Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const WorkflowSchema = new Schema<IWorkflow>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true, maxlength: 200 },
  description: { type: String, maxlength: 1000 },
  trigger: { type: String, enum: ['user.lifecycle_changed'], required: true },
  trigger_config: {
    lifecycle_from: [{ type: String, required: true }],
    lifecycle_to: [{ type: String, required: true }],
  },
  status: { type: String, enum: ['draft', 'enabled', 'disabled'], default: 'draft', index: true },
  is_active: { type: Boolean, default: true },
  created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updated_by: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Indexes
WorkflowSchema.index({ company_id: 1, status: 1 });
WorkflowSchema.index({ company_id: 1, trigger: 1 });
WorkflowSchema.index({ company_id: 1, is_active: 1 });

export const Workflow = model<IWorkflow>('Workflow', WorkflowSchema);
