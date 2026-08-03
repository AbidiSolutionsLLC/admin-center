// server/src/models/FieldPermission.model.ts
import { Schema, model, Document, Types } from 'mongoose';

/**
 * Standard (built-in) fields that each target object exposes in its form.
 * These are the fields rendered natively in UserForm / DepartmentForm
 * and are NOT custom (dynamic) fields.
 */
export const STANDARD_FIELDS: Record<'user' | 'department' | 'policy', string[]> = {
  user: [
    'full_name',
    'phone',
    'department_id',
    'manager_id',
    'secondary_manager_ids',
    'role',
    'role_ids',
    'employment_type',
    'hire_date',
    'location_id',
    'delegates',
  ],
  department: [
    'name',
    'type',
    'parent_id',
    'primary_manager_id',
    'secondary_manager_ids',
  ],
  policy: ['title', 'content', 'category', 'effective_date', 'expiry_date', 'summary'],
};

export type FieldVisibility = 'all' | 'admin_only' | 'role_specific';

export interface IFieldPermission extends Document {
  company_id: Types.ObjectId;
  target_object: 'user' | 'department' | 'policy';
  field_name: string;
  visibility: FieldVisibility;
  visible_roles?: Types.ObjectId[];
  edit_visibility: FieldVisibility;
  edit_visible_roles?: Types.ObjectId[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const FieldPermissionSchema = new Schema<IFieldPermission>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  target_object: {
    type: String,
    enum: ['user', 'department', 'policy'],
    required: true,
  },
  field_name: { type: String, required: true },
  visibility: {
    type: String,
    enum: ['all', 'admin_only', 'role_specific'],
    default: 'all',
  },
  visible_roles: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
  edit_visibility: {
    type: String,
    enum: ['all', 'admin_only', 'role_specific'],
    default: 'all',
  },
  edit_visible_roles: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

FieldPermissionSchema.index(
  { company_id: 1, target_object: 1, field_name: 1 },
  { unique: true },
);

export const FieldPermission = model<IFieldPermission>('FieldPermission', FieldPermissionSchema);
