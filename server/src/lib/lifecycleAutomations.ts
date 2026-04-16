// server/src/lib/lifecycleAutomations.ts
import { User } from '../models/User.model';
import { RefreshToken } from '../models/RefreshToken.model';
import { auditLogger } from './auditLogger';
import { sendWelcomeEmail } from './emailService';

export async function runLifecycleAutomations(
  userId: string,
  currentState: string,
  targetState: string,
  actorId: string,
  companyId: string,
  req?: any, // For audit logging context
): Promise<void> {
  const transitionKey = `${currentState}_to_${targetState}`;  // FIX-02: ASCII keys

  if (transitionKey === 'invited_to_onboarding') {
    const user = await User.findById(userId).select('email full_name employee_id');
    if (user) {
      const company = await (await import('../models/Company.model')).Company.findById(companyId);
      if (company) {
        await sendWelcomeEmail({
          email: user.email,
          full_name: user.full_name,
          employee_id: user.employee_id,
          company_name: company.name,
          invite_link: `${process.env.CLIENT_URL}/onboarding?token=PLACEHOLDER&email=${encodeURIComponent(user.email)}`, // Token already sent in invite
        });
        await auditLogger.log({
          req,
          action: 'lifecycle.welcome_email_sent',
          module: 'people',
          object_type: 'User',
          object_id: userId,
          object_label: user.full_name,
          before_state: { transition: transitionKey },
          after_state: { automation: 'welcome_email_sent', email: user.email },
        });
      }
    }
  }

  // FIX-09: Honest audit log for role assignment TODO
  if (transitionKey === 'onboarding_to_active') {
    await auditLogger.log({
      req,
      action: 'lifecycle.default_role_assignment_pending',
      module: 'people',
      object_type: 'User',
      object_id: userId,
      object_label: userId,
      before_state: { transition: transitionKey },
      after_state: { 
        automation: 'default_role_assignment_pending', 
        note: 'Role assignment requires RBAC integration (H-014)' 
      }, // FIX-09: Honest log
    });
  }

  // FIX-10: Set is_active=false on termination
  if (transitionKey === 'active_to_terminated') {
    await User.findByIdAndUpdate(userId, {
      refresh_token_hash: null,
      is_active: false, // FIX-10: set is_active=false on termination
    });

    // Revoke all active refresh tokens
    await RefreshToken.updateMany(
      { user_id: userId, is_revoked: false },
      { $set: { is_revoked: true } }
    );

    await auditLogger.log({
      req,
      action: 'lifecycle.session_revoked',
      module: 'people',
      object_type: 'User',
      object_id: userId,
      object_label: userId,
      before_state: { transition: transitionKey },
      after_state: { automation: 'sessions_revoked', refresh_tokens_invalidated: true },
    });
  }

  if (transitionKey === 'terminated_to_archived') {
    await User.findByIdAndUpdate(userId, {
      full_name: 'Archived User',
      phone: null,
      avatar_url: null,
      is_active: false,
    });
    await auditLogger.log({
      req,
      action: 'lifecycle.pii_anonymized',
      module: 'people',
      object_type: 'User',
      object_id: userId,
      object_label: 'Archived User',
      before_state: { transition: transitionKey },
      after_state: { automation: 'pii_anonymized' },
    });
  }
}
