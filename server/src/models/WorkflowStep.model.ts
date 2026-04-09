// server/src/models/WorkflowStep.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type WorkflowActionType =
  | 'send_email'
  | 'assign_role'
  | 'revoke_access'
  | 'notify_manager'
  | 'update_field'
  | 'create_task'
  | 'webhook';

export interface IWorkflowStep extends Document {
  company_id: Types.ObjectId;
  workflow_id: Types.ObjectId;
  name: string;
  description?: string;
  action_type: WorkflowActionType;
  action_config: Record<string, unknown>; // Action-specific settings
  step_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const WorkflowStepSchema = new Schema<IWorkflowStep>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  workflow_id: { type: Schema.Types.ObjectId, ref: 'Workflow', required: true, index: true },
  name: { type: String, required: true, maxlength: 200 },
  description: { type: String, maxlength: 500 },
  action_type: {
    type: String,
    enum: ['send_email', 'assign_role', 'revoke_access', 'notify_manager', 'update_field', 'create_task', 'webhook'],
    required: true,
  },
  action_config: { type: Schema.Types.Mixed, default: {} },
  step_order: { type: Number, required: true, min: 0 },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Compound unique index for ordering within a workflow
WorkflowStepSchema.index({ company_id: 1, workflow_id: 1, step_order: 1 });
// Index for querying steps by workflow
WorkflowStepSchema.index({ company_id: 1, workflow_id: 1 });

export const WorkflowStep = model<IWorkflowStep>('WorkflowStep', WorkflowStepSchema);
