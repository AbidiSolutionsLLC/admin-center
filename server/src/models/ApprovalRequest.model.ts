// server/src/models/ApprovalRequest.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ApprovalCondition = 'any' | 'all';

export interface IDecision {
  user_id: Types.ObjectId;
  status: 'approved' | 'rejected';
  delegated_for?: Types.ObjectId;
  comments?: string;
  decided_at: Date;
}

export interface IApprovalRequest extends Document {
  company_id: Types.ObjectId;
  workflow_run_id: Types.ObjectId;
  workflow_step_id: Types.ObjectId;
  approver_user_ids: Types.ObjectId[];
  approval_condition: ApprovalCondition;
  status: ApprovalStatus;
  decisions: IDecision[];
  decided_by?: Types.ObjectId;
  delegated_for?: Types.ObjectId;
  decided_at?: Date;
  comments?: string;
  sla_alert_sent?: boolean;
  created_at: Date;
  updated_at: Date;
}

const DecisionSchema = new Schema<IDecision>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['approved', 'rejected'], required: true },
  delegated_for: { type: Schema.Types.ObjectId, ref: 'User' },
  comments: { type: String, maxlength: 1000 },
  decided_at: { type: Date, default: Date.now }
}, { _id: false });

const ApprovalRequestSchema = new Schema<IApprovalRequest>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  workflow_run_id: { type: Schema.Types.ObjectId, ref: 'WorkflowRun', required: true, index: true },
  workflow_step_id: { type: Schema.Types.ObjectId, ref: 'WorkflowStep', required: true },
  approver_user_ids: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  approval_condition: { type: String, enum: ['any', 'all'], default: 'any' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  decisions: { type: [DecisionSchema], default: [] },
  decided_by: { type: Schema.Types.ObjectId, ref: 'User' },
  delegated_for: { type: Schema.Types.ObjectId, ref: 'User' },
  decided_at: { type: Date },
  comments: { type: String, maxlength: 1000 },
  sla_alert_sent: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Indexes for querying pending approvals by user
ApprovalRequestSchema.index({ company_id: 1, status: 1, approver_user_ids: 1 });

export const ApprovalRequest = model<IApprovalRequest>('ApprovalRequest', ApprovalRequestSchema);
