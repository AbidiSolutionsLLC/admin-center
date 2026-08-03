// server/src/models/CustomField.model.ts
import { Schema, model, Document, Types } from 'mongoose';

/**
 * CustomField Model
 * Represents a custom field definition that can be applied to different object types.
 * Fields are immediately available in forms after creation.
 * Supports: text, number, date, boolean, select, multi_select, url, email, phone.
 * Features: validation rules, default values, conditional logic, field dependencies,
 *           field-level permissions, system field flag, schema versioning.
 */

export type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select' | 'url' | 'email' | 'phone';
export type TargetObject = 'user' | 'department' | 'policy' | 'team' | 'location' | 'holiday' | 'holiday_calendar' | 'work_schedule';
export type VisibilityRule = 'all' | 'admin_only' | 'role_specific';

export interface IValidationRules {
  required?: boolean;
  min_length?: number;
  max_length?: number;
  min?: number;
  max?: number;
  pattern?: string;
  pattern_message?: string;
}

export interface IConditionalRule {
  field_slug: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
  value: unknown;
  action: 'show' | 'hide' | 'require' | 'optional';
}

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
  default_value?: string;
  select_options?: string[];
  validation_rules?: IValidationRules;
  visibility: VisibilityRule;
  visible_roles?: Types.ObjectId[];
  edit_visibility: VisibilityRule;
  edit_visible_roles?: Types.ObjectId[];
  conditional_logic?: IConditionalRule[];
  field_dependencies?: Types.ObjectId[];
  is_system_field: boolean;
  version: number;
  display_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const ValidationRulesSchema = new Schema<IValidationRules>({
  required: { type: Boolean },
  min_length: { type: Number },
  max_length: { type: Number },
  min: { type: Number },
  max: { type: Number },
  pattern: { type: String },
  pattern_message: { type: String },
}, { _id: false });

const ConditionalRuleSchema = new Schema<IConditionalRule>({
  field_slug: { type: String, required: true },
  operator: {
    type: String,
    enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'],
    required: true,
  },
  value: { type: Schema.Types.Mixed },
  action: {
    type: String,
    enum: ['show', 'hide', 'require', 'optional'],
    required: true,
  },
}, { _id: false });

const CustomFieldSchema = new Schema<ICustomField>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true },
  slug: { type: String, required: true },
  field_type: {
    type: String,
    enum: ['text', 'number', 'date', 'boolean', 'select', 'multi_select', 'url', 'email', 'phone'],
    required: true,
  },
  target_object: {
    type: String,
    enum: ['user', 'department', 'policy', 'team', 'location', 'holiday', 'holiday_calendar', 'work_schedule'],
    required: true,
    index: true,
  },
  label: { type: String, required: true },
  placeholder: String,
  description: String,
  required: { type: Boolean, default: false },
  default_value: { type: String },
  select_options: [String],
  validation_rules: { type: ValidationRulesSchema },
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
  conditional_logic: [ConditionalRuleSchema],
  field_dependencies: [{ type: Schema.Types.ObjectId, ref: 'CustomField' }],
  is_system_field: { type: Boolean, default: false },
  version: { type: Number, default: 1 },
  display_order: { type: Number, default: 0, index: true },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

CustomFieldSchema.index({ company_id: 1, target_object: 1, slug: 1 }, { unique: true });
CustomFieldSchema.index({ company_id: 1, target_object: 1, display_order: 1 });
CustomFieldSchema.index({ company_id: 1, 'field_dependencies': 1 });

export const CustomField = model<ICustomField>('CustomField', CustomFieldSchema);
