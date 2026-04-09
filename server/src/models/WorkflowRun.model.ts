// server/src/models/WorkflowRun.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type WorkflowRunStatus = 'success' | 'failure' | 'partial';

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
  execution_time_ms: number;
  created_at: Date;
}

const WorkflowRunSchema = new Schema<IWorkflowRun>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  workflow_id: { type: Schema.Types.ObjectId, ref: 'Workflow', required: true, index: true },
  triggered_by: { type: String, required: true },
  triggered_by_object_id: { type: String, required: true },
  triggered_by_label: { type: String, required: true },
  status: { type: String, enum: ['success', 'failure', 'partial'], required: true },
  steps_executed: { type: Number, default: 0 },
  steps_succeeded: { type: Number, default: 0 },
  steps_failed: { type: Number, default: 0 },
  error_message: { type: String },
  error_details: { type: Schema.Types.Mixed },
  execution_time_ms: { type: Number, required: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

// Indexes for querying runs by workflow and status
WorkflowRunSchema.index({ company_id: 1, workflow_id: 1, created_at: -1 });
WorkflowRunSchema.index({ company_id: 1, status: 1, created_at: -1 });
// Index for querying runs by triggered object
WorkflowRunSchema.index({ company_id: 1, triggered_by_object_id: 1 });

export const WorkflowRun = model<IWorkflowRun>('WorkflowRun', WorkflowRunSchema);
