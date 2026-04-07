// server/src/models/UserRole.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IUserRole extends Document {
  user_id: Types.ObjectId;
  role_id: Types.ObjectId;
  assigned_by: Types.ObjectId;
  assigned_at: Date;
}

const UserRoleSchema = new Schema<IUserRole>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role_id: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
  assigned_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  assigned_at: { type: Date, default: Date.now },
}, { timestamps: false });

// Unique index: a user can have each role assigned only once
UserRoleSchema.index({ user_id: 1, role_id: 1 }, { unique: true });

export const UserRole = model<IUserRole>('UserRole', UserRoleSchema);
