// src/models/Department.model.ts
import { Schema, model, Document, Types } from 'mongoose';
import { slugify } from '../utils/slugify';

export interface IDepartment extends Document {
  company_id: Types.ObjectId | string;
  name: string;
  slug: string;
  type: 'business_unit' | 'division' | 'department' | 'cost_center';
  parent_id?: Types.ObjectId | string | null;
  primary_manager_id?: Types.ObjectId | string | null;
  secondary_manager_id?: Types.ObjectId | string | null;
  custom_fields: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const DepartmentSchema = new Schema<IDepartment>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true },
  slug: { type: String, required: true },
  type: { type: String, enum: ['business_unit', 'division', 'department', 'cost_center'], required: true },
  parent_id: { type: Schema.Types.ObjectId, ref: 'Department' },
  primary_manager_id: { type: Schema.Types.ObjectId, ref: 'User' },
  secondary_manager_id: { type: Schema.Types.ObjectId, ref: 'User' },
  custom_fields: { type: Schema.Types.Mixed, default: {} },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

DepartmentSchema.index({ company_id: 1, slug: 1 }, { unique: true, partialFilterExpression: { is_active: true } });

// Auto-generate slug from name if modified
DepartmentSchema.pre('validate', function() {
  if (this.isModified('name') && this.name) {
    this.slug = slugify(this.name);
  }
});

export const Department = model<IDepartment>('Department', DepartmentSchema);
