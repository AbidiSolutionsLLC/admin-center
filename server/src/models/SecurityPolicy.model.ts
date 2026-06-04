// server/src/models/SecurityPolicy.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type SecurityPolicyTargetType = 'all' | 'role' | 'department' | 'group' | 'user';

export interface ISecurityPolicy extends Document {
  company_id: Types.ObjectId;
  policy_name: string;
  description: string;
  is_enabled: boolean;
  target_type: SecurityPolicyTargetType;
  target_id: string; // ID of the role, department, group, user, or 'all'
  target_label: string; // Denormalized name for display
  settings: {
    max_failed_login_attempts: number;
    lockout_duration_minutes: number;
    session_timeout_minutes: number;
    require_mfa: boolean;
    password_min_length: number;
    password_require_uppercase: boolean;
    password_require_lowercase: boolean;
    password_require_numbers: boolean;
    password_require_special_chars: boolean;
    password_expiry_days: number;
    ip_whitelist_enabled: boolean;
    ip_whitelist: string[];
  };
  created_at: Date;
  updated_at: Date;
}

const SecurityPolicySchema = new Schema<ISecurityPolicy>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  policy_name: { type: String, required: true },
  description: String,
  is_enabled: { type: Boolean, default: true },
  target_type: { 
    type: String, 
    enum: ['all', 'role', 'department', 'group', 'user'], 
    default: 'all' 
  },
  target_id: { type: String, default: 'all' },
  target_label: { type: String, default: 'All Users' },
  settings: {
    max_failed_login_attempts: { type: Number, default: 5 },
    lockout_duration_minutes: { type: Number, default: 30 },
    session_timeout_minutes: { type: Number, default: 480 }, // 8 hours
    require_mfa: { type: Boolean, default: false },
    password_min_length: { type: Number, default: 8 },
    password_require_uppercase: { type: Boolean, default: true },
    password_require_lowercase: { type: Boolean, default: true },
    password_require_numbers: { type: Boolean, default: true },
    password_require_special_chars: { type: Boolean, default: true },
    password_expiry_days: { type: Number, default: 90 },
    ip_whitelist_enabled: { type: Boolean, default: false },
    ip_whitelist: { type: [String], default: [] },
  },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Compound unique index to prevent duplicate policies with the same name
SecurityPolicySchema.index({ company_id: 1, policy_name: 1 }, { unique: true });

// Prevent multiple policies targeting the exact same target
SecurityPolicySchema.index({ company_id: 1, target_type: 1, target_id: 1 }, { unique: true });

export const SecurityPolicy = model<ISecurityPolicy>('SecurityPolicy', SecurityPolicySchema);
