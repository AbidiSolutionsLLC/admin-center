// server/src/models/ApprovalRequest.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface IApprovalRequest extends Document {
  company_id: Types.ObjectId;
  workflow_run_id: Types.ObjectId;
  workflow_step_id: Types.ObjectId;
  approver_user_ids: Types.ObjectId[];
  status: ApprovalStatus;
  decided_by?: Types.ObjectId;
  decided_at?: Date;
  comments?: string;
  created_at: Date;
  updated_at: Date;
}

const ApprovalRequestSchema = new Schema<IApprovalRequest>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  workflow_run_id: { type: Schema.Types.ObjectId, ref: 'WorkflowRun', required: true, index: true },
  workflow_step_id: { type: Schema.Types.ObjectId, ref: 'WorkflowStep', required: true },
  approver_user_ids: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  decided_by: { type: Schema.Types.ObjectId, ref: 'User' },
  decided_at: { type: Date },
  comments: { type: String, maxlength: 1000 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Indexes for querying pending approvals by user
ApprovalRequestSchema.index({ company_id: 1, status: 1, approver_user_ids: 1 });

export const ApprovalRequest = model<IApprovalRequest>('ApprovalRequest', ApprovalRequestSchema);
