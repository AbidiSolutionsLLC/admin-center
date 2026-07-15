// server/src/models/WorkflowRun.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type WorkflowRunStatus = 'success' | 'failure' | 'partial' | 'pending_approval';

export interface IWorkflowRun extends Document {
  company_id: Types.ObjectId;
  workflow_id: Types.ObjectId;
  triggered_by: string;          // e.g., 'user.lifecycle_changed'
  triggered_by_object_id: string; // The user ID that triggered it
  triggered_by_label: string;     // e.g., user full_name
  status: WorkflowRunStatus;
  steps_executed: number;
  steps_succeeded: number;
  steps_failed: number;
  error_message?: string;
  error_details?: Record<string, unknown>;
  event_payload?: Record<string, unknown>;
  execution_time_ms: number;
  sla_status?: 'ok' | 'breached' | 'pending';
  snapshot_steps?: Record<string, unknown>[];
  step_results?: {
    step_id: Types.ObjectId;
    step_name: string;
    action_type: string;
    status: 'success' | 'failure' | 'skipped' | 'pending';
    execution_time_ms: number;
    started_at: Date;
    completed_at?: Date;
    sla_breached: boolean;
  }[];
  created_at: Date;
}

const WorkflowRunSchema = new Schema<IWorkflowRun>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  workflow_id: { type: Schema.Types.ObjectId, ref: 'Workflow', required: true, index: true },
  triggered_by: { type: String, required: true },
  triggered_by_object_id: { type: String, required: true },
  triggered_by_label: { type: String, required: true },
  status: { type: String, enum: ['success', 'failure', 'partial', 'pending_approval'], required: true },
  steps_executed: { type: Number, default: 0 },
  steps_succeeded: { type: Number, default: 0 },
  steps_failed: { type: Number, default: 0 },
  error_message: { type: String },
  error_details: { type: Schema.Types.Mixed },
  event_payload: { type: Schema.Types.Mixed },
  execution_time_ms: { type: Number, required: true },
  sla_status: { type: String, enum: ['ok', 'breached', 'pending'], default: 'pending' },
  snapshot_steps: [{ type: Schema.Types.Mixed }],
  step_results: [{
    step_id: { type: Schema.Types.ObjectId, ref: 'WorkflowStep' },
    step_name: { type: String },
    action_type: { type: String },
    status: { type: String, enum: ['success', 'failure', 'skipped', 'pending'] },
    execution_time_ms: { type: Number },
    started_at: { type: Date },
    completed_at: { type: Date },
    sla_breached: { type: Boolean, default: false }
  }],
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

// Indexes for querying runs by workflow and status
WorkflowRunSchema.index({ company_id: 1, workflow_id: 1, created_at: -1 });
WorkflowRunSchema.index({ company_id: 1, status: 1, created_at: -1 });
// Index for querying runs by triggered object
WorkflowRunSchema.index({ company_id: 1, triggered_by_object_id: 1 });

export const WorkflowRun = model<IWorkflowRun>('WorkflowRun', WorkflowRunSchema);
