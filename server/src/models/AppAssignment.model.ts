// server/src/models/AppAssignment.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IAppAssignment extends Document {
  company_id: Types.ObjectId;
  app_id: Types.ObjectId;
  // Assignment target: can be role, department, group, or individual user
  target_type: 'role' | 'department' | 'group' | 'user';
  target_id: Types.ObjectId;
  // Assignment metadata
  granted_by: Types.ObjectId;
  granted_at: Date;
  revoked_by?: Types.ObjectId;
  revoked_at?: Date;
  // Assignment state
  is_active: boolean;
  // Optional reason/note
  reason?: string;
}

const AppAssignmentSchema = new Schema<IAppAssignment>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  app_id: { type: Schema.Types.ObjectId, ref: 'App', required: true, index: true },
  target_type: {
    type: String,
    enum: ['role', 'department', 'group', 'user'],
    required: true,
  },
  target_id: { type: Schema.Types.ObjectId, required: true, index: true },
  granted_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  granted_at: { type: Date, default: Date.now },
  revoked_by: { type: Schema.Types.ObjectId, ref: 'User' },
  revoked_at: { type: Date },
  is_active: { type: Boolean, default: true },
  reason: { type: String },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Compound indexes for efficient queries
AppAssignmentSchema.index({ company_id: 1, app_id: 1, is_active: 1 });
AppAssignmentSchema.index({ company_id: 1, target_type: 1, target_id: 1, is_active: 1 });
AppAssignmentSchema.index({ company_id: 1, target_id: 1, is_active: 1 });
AppAssignmentSchema.index({ granted_at: -1 });

export const AppAssignment = model<IAppAssignment>('AppAssignment', AppAssignmentSchema);
