// server/src/models/Role.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IRole extends Document {
  company_id: Types.ObjectId;
  name: string;
  description?: string;
  type: 'system' | 'custom';
  parent_role_id?: Types.ObjectId;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const RoleSchema = new Schema<IRole>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true },
  description: String,
  type: { type: String, enum: ['system', 'custom'], default: 'custom' },
  parent_role_id: { type: Schema.Types.ObjectId, ref: 'Role' },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Compound index for unique role names per company
RoleSchema.index({ company_id: 1, name: 1 }, { unique: true });

export const Role = model<IRole>('Role', RoleSchema);
