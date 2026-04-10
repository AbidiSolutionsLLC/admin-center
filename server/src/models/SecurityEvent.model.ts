// server/src/models/SecurityEvent.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type SecurityEventType = 
  | 'login_attempt'
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'password_reset_request'
  | 'password_reset_complete'
  | 'mfa_challenge'
  | 'mfa_verified'
  | 'mfa_failed'
  | 'session_expired'
  | 'token_refresh'
  | 'token_revoked'
  | 'suspicious_activity_detected'
  | 'account_locked'
  | 'account_unlocked'
  | 'password_setup_success'
  | 'password_setup_failure';

export interface ISecurityEvent extends Document {
  company_id: Types.ObjectId;
  user_id?: Types.ObjectId;
  email?: string;
  event_type: SecurityEventType;
  ip_address?: string;
  user_agent?: string;
  is_suspicious: boolean;
  metadata?: Record<string, unknown>;
  created_at: Date;
}

const SecurityEventSchema = new Schema<ISecurityEvent>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User' },
  email: { type: String, lowercase: true },
  event_type: {
    type: String,
    enum: [
      'login_attempt',
      'login_success',
      'login_failure',
      'logout',
      'password_reset_request',
      'password_reset_complete',
      'mfa_challenge',
      'mfa_verified',
      'mfa_failed',
      'session_expired',
      'token_refresh',
      'token_revoked',
      'suspicious_activity_detected',
      'account_locked',
      'account_unlocked',
      'password_setup_success',
      'password_setup_failure',
    ],
    required: true,
  },
  ip_address: String,
  user_agent: String,
  is_suspicious: { type: Boolean, default: false },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: 'created_at' }, versionKey: false });

// Index for efficient querying
SecurityEventSchema.index({ company_id: 1, created_at: -1 });
SecurityEventSchema.index({ company_id: 1, event_type: 1, created_at: -1 });
SecurityEventSchema.index({ email: 1, created_at: -1 });
SecurityEventSchema.index({ is_suspicious: 1, created_at: -1 });

export const SecurityEvent = model<ISecurityEvent>('SecurityEvent', SecurityEventSchema);
