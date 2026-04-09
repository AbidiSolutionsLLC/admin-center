// server/src/models/User.model.ts
import { Schema, model, Document, Types } from 'mongoose';
import { Company } from './Company.model';

export type LifecycleState = 'invited' | 'onboarding' | 'active' | 'probation' | 'on_leave' | 'terminated' | 'archived';
export type EmploymentType = 'full_time' | 'part_time' | 'contractor' | 'intern';

export interface IUser extends Document {
  company_id: Types.ObjectId;
  employee_id: string;
  full_name: string;
  email: string;
  password_hash: string;
  phone?: string;
  avatar_url?: string;
  department_id?: Types.ObjectId;
  team_id?: Types.ObjectId;
  manager_id?: Types.ObjectId;
  secondary_manager_ids?: Types.ObjectId[];
  lifecycle_state: LifecycleState;
  lifecycle_changed_at: Date;
  hire_date?: Date;
  termination_date?: Date;
  employment_type: EmploymentType;
  location_id?: Types.ObjectId;
  custom_fields: Record<string, unknown>;
  last_login?: Date;
  mfa_enabled: boolean;
  refresh_token_hash?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const UserSchema = new Schema<IUser>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  employee_id: { type: String },
  full_name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  password_hash: { type: String, required: true },
  phone: String,
  avatar_url: String,
  department_id: { type: Schema.Types.ObjectId, ref: 'Department' },
  team_id: { type: Schema.Types.ObjectId, ref: 'Team' },
  manager_id: { type: Schema.Types.ObjectId, ref: 'User' },
  secondary_manager_ids: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  lifecycle_state: {
    type: String,
    enum: ['invited', 'onboarding', 'active', 'probation', 'on_leave', 'terminated', 'archived'],
    default: 'invited',
  },
  lifecycle_changed_at: { type: Date, default: Date.now },
  hire_date: Date,
  termination_date: Date,
  employment_type: { type: String, enum: ['full_time', 'part_time', 'contractor', 'intern'], default: 'full_time' },
  location_id: { type: Schema.Types.ObjectId, ref: 'Location' },
  custom_fields: { type: Schema.Types.Mixed, default: {} },
  last_login: Date,
  mfa_enabled: { type: Boolean, default: false },
  refresh_token_hash: String,
  is_active: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// ── Indexes ──────────────────────────────────────────────────────────────────
UserSchema.index({ company_id: 1, email: 1 }, { unique: true });
UserSchema.index({ company_id: 1, employee_id: 1 }, { unique: true });
UserSchema.index({ company_id: 1, lifecycle_state: 1 });
UserSchema.index({ company_id: 1, department_id: 1 });
UserSchema.index({ last_login: 1 });
UserSchema.index({ company_id: 1, manager_id: 1 });
UserSchema.index({ company_id: 1, secondary_manager_ids: 1 });

// ── Pre-save Hook: Auto-generate employee_id ────────────────────────────────
/**
 * Generates employee_id atomically using Company.employee_id_format + counter.
 * Format example: 'EMP-{counter:5}' → 'EMP-00001', 'EMP-00002', etc.
 * Uses findOneAndUpdate with $inc for atomic counter increment.
 */
UserSchema.pre('save', async function() {
  // Only generate employee_id if it's a new document and employee_id is not set
  if (this.isNew && !this.employee_id) {
    // Atomically increment the company's employee_id_counter
    const company = await Company.findOneAndUpdate(
      { _id: this.company_id },
      { $inc: { employee_id_counter: 1 } },
      { new: true } // Return the updated document
    );

    if (!company) {
      throw new Error(`Company not found: ${this.company_id}`);
    }

    // Parse the format string and generate the employee_id
    const format = company.employee_id_format;
    const counter = company.employee_id_counter;

    // Replace {counter:N} with zero-padded counter value
    // Example: 'EMP-{counter:5}' with counter=42 → 'EMP-00042'
    this.employee_id = format.replace(/\{counter:(\d+)\}/, (match, digits) => {
      const paddingLength = parseInt(digits, 10);
      return counter.toString().padStart(paddingLength, '0');
    });
  }
});

// ── Pre-save Hook: Auto-update lifecycle_changed_at ─────────────────────────
/**
 * Updates lifecycle_changed_at timestamp when lifecycle_state changes.
 * Tracks when users transition between states (invited → active, etc.)
 */
UserSchema.pre('save', function() {
  if (this.isModified('lifecycle_state')) {
    this.lifecycle_changed_at = new Date();
  }
});

export const User = model<IUser>('User', UserSchema);
