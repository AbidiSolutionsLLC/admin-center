// server/src/models/PolicyAssignment.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type PolicyTargetType = 'all' | 'role' | 'department' | 'group' | 'user';

export interface IPolicyAssignment extends Document {
  company_id: Types.ObjectId;
  policy_version_id: Types.ObjectId;
  target_type: PolicyTargetType;
  target_id: string; // role_id, department_id, group_id, or user_id
  target_label: string; // Denormalized display name
  created_at: Date;
}

const PolicyAssignmentSchema = new Schema<IPolicyAssignment>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  policy_version_id: { type: Schema.Types.ObjectId, ref: 'PolicyVersion', required: true, index: true },
  target_type: {
    type: String,
    enum: ['all', 'role', 'department', 'group', 'user'],
    required: true,
  },
  target_id: { type: String, required: true },
  target_label: { type: String, required: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

// Compound unique index to prevent duplicate assignments
PolicyAssignmentSchema.index({ company_id: 1, policy_version_id: 1, target_type: 1, target_id: 1 }, { unique: true });
// Index for finding all policies targeting a specific entity (used in conflict check)
PolicyAssignmentSchema.index({ company_id: 1, target_type: 1, target_id: 1 });

export const PolicyAssignment = model<IPolicyAssignment>('PolicyAssignment', PolicyAssignmentSchema);
