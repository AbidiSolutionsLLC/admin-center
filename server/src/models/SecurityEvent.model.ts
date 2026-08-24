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
  company_id?: Types.ObjectId;
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
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
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

SecurityEventSchema.post('save', function(doc, next) {
  const companyId = doc.company_id;
  if (companyId) {
    (async () => {
      try {
        // Dynamic imports or lazy loading can prevent circular dependency if they exist, but standard require/import is usually fine.
        const { SecurityPolicy } = await import('./SecurityPolicy.model');
        const { sendSecurityAlert } = await import('../lib/notificationEngine');

        const policy = await SecurityPolicy.findOne({ company_id: companyId, target_type: 'all', is_enabled: true });
        if (policy && policy.settings && policy.settings.alert_settings) {
          const alerts = policy.settings.alert_settings;
          let shouldAlert = false;
          let alertDetail = '';

          if (doc.event_type === 'login_failure' && alerts.notify_on_failed_logins && doc.metadata?.failure_count) {
            const threshold = alerts.failed_logins_threshold || 5;
            if ((doc.metadata.failure_count as number) >= threshold) {
              shouldAlert = true;
              alertDetail = `Failed login threshold exceeded. User ${doc.email || 'unknown'} failed to log in ${doc.metadata.failure_count} times.`;
            }
          } else if (doc.is_suspicious && alerts.notify_on_suspicious_login && doc.event_type !== 'login_failure') {
            shouldAlert = true;
            alertDetail = `Suspicious activity detected for user ${doc.email || 'unknown'}. Reason: ${doc.metadata?.reason || 'Unknown'}`;
          } else if (doc.is_suspicious && alerts.notify_on_risk_flags && !shouldAlert) {
            shouldAlert = true;
            alertDetail = `Risk flag triggered for user ${doc.email || 'unknown'}. Event: ${doc.event_type}.`;
          }

          if (shouldAlert) {
            await sendSecurityAlert(
              companyId.toString(),
              doc.event_type,
              alertDetail,
              alerts.alert_emails
            );
          }
        }
      } catch (err) {
        console.error('[SecurityEvent Post-Save] Failed to evaluate/send security alert:', err);
      }
    })();
  }
  next();
});

export const SecurityEvent = model<ISecurityEvent>('SecurityEvent', SecurityEventSchema);
