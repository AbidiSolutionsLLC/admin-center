import { Schema, model, Document, Types } from 'mongoose';
import { WorkflowTrigger } from './Workflow.model';

export interface IWorkflowTemplateStep {
  name: string;
  description?: string;
  action_type: 'send_email' | 'assign_role' | 'revoke_access' | 'notify_manager' | 'update_field' | 'create_task' | 'webhook' | 'require_approval';
  action_config: Record<string, unknown>;
  conditions?: Array<{
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
    value: unknown;
  }>;
  step_order: number;
  sla_config?: {
    threshold_minutes: number;
    notify_on_breach: boolean;
  };
}

export interface IWorkflowTemplate extends Document {
  company_id: Types.ObjectId | null; // Nullable if system-wide template
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  trigger_config?: {
    lifecycle_from?: string[];
    lifecycle_to?: string[];
    role_from?: string[];
    role_to?: string[];
    department_from?: string[];
    department_to?: string[];
  };
  steps: IWorkflowTemplateStep[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const WorkflowTemplateSchema = new Schema<IWorkflowTemplate>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', index: true, default: null },
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
  steps: [{
    name: { type: String, required: true },
    description: { type: String },
    action_type: { 
      type: String, 
      enum: ['send_email', 'assign_role', 'revoke_access', 'notify_manager', 'update_field', 'create_task', 'webhook', 'require_approval'], 
      required: true 
    },
    action_config: { type: Schema.Types.Mixed, default: {} },
    conditions: [{
      field: { type: String, required: true },
      operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than'], required: true },
      value: { type: Schema.Types.Mixed, required: true }
    }],
    step_order: { type: Number, required: true },
    sla_config: {
      threshold_minutes: { type: Number },
      notify_on_breach: { type: Boolean, default: false }
    }
  }],
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Company ID and name should be unique
WorkflowTemplateSchema.index({ company_id: 1, name: 1 }, { unique: true });
WorkflowTemplateSchema.index({ company_id: 1, trigger: 1 });

export const WorkflowTemplate = model<IWorkflowTemplate>('WorkflowTemplate', WorkflowTemplateSchema);
