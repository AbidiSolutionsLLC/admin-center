// server/src/models/CustomField.model.ts
import { Schema, model, Document, Types } from 'mongoose';

/**
 * CustomField Model
 * Represents a custom field definition that can be applied to different object types.
 * Fields are immediately available in forms after creation.
 * Supports: text, number, date, select, multi_select, checkbox, textarea.
 */

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'checkbox' | 'textarea';
export type TargetObject = 'user' | 'department' | 'policy';
export type VisibilityRule = 'all' | 'admin_only' | 'role_specific';

export interface ICustomField extends Document {
  company_id: Types.ObjectId;
  name: string;
  slug: string;
  field_type: FieldType;
  target_object: TargetObject;
  label: string;
  placeholder?: string;
  description?: string;
  required: boolean;
  select_options?: string[];
  visibility: VisibilityRule;
  visible_roles?: Types.ObjectId[];
  display_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const CustomFieldSchema = new Schema<ICustomField>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true }, // Internal identifier (slug-like)
  slug: { type: String, required: true },
  field_type: {
    type: String,
    enum: ['text', 'number', 'date', 'select', 'multi_select', 'checkbox', 'textarea'],
    required: true,
  },
  target_object: {
    type: String,
    enum: ['user', 'department', 'policy'],
    required: true,
    index: true,
  },
  label: { type: String, required: true }, // Display label
  placeholder: String,
  description: String,
  required: { type: Boolean, default: false },
  select_options: [String], // For select/multi_select fields
  visibility: {
    type: String,
    enum: ['all', 'admin_only', 'role_specific'],
    default: 'all',
  },
  visible_roles: [{ type: Schema.Types.ObjectId, ref: 'Role' }], // When visibility is 'role_specific'
  display_order: { type: Number, default: 0, index: true },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// ── Indexes ──────────────────────────────────────────────────────────────────
CustomFieldSchema.index({ company_id: 1, target_object: 1, slug: 1 }, { unique: true });
CustomFieldSchema.index({ company_id: 1, target_object: 1, display_order: 1 });

export const CustomField = model<ICustomField>('CustomField', CustomFieldSchema);
