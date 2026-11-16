// server/src/controllers/auth.controller.ts
// E2: login / MFA / refresh moved to the hosted OIDC identity module (src/identity). The login-policy
// helpers below (security events, IP restrictions, lockout, password expiry) are shared with it.
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler';
import { User, IUser, UserRole, SecurityEvent, PasswordResetToken, Company, GroupMember, IpRestriction, Identity, IIdentity } from '../models';
import { sendPasswordResetEmail } from '../lib/emailService';
import { validatePasswordAgainstPolicy } from '../utils/passwordPolicy';
import { AppError } from '../utils/AppError';
import { z } from 'zod';
import type { ClientSession, Types } from 'mongoose';
import { auditLogger } from '../lib/auditLogger';
import { resolveUserPermissions } from '../lib/rbac';
import { sendSecurityAlert } from '../lib/notificationEngine';
import { isIpInRange } from '../utils/ipUtils';
import { getAggregatedSecurityPolicy } from '../utils/securityPolicyUtils';
import { runInTransaction } from '../lib/platformEvents';
import { consumeInvitation, findInvitationByToken, invitationProblem } from '../lib/invitations';
import { revokeSession, revokeIdentitySessions } from '../identity/sessions';
import { getIdentityConfig, ADMIN_SPA_CLIENT_ID } from '../identity/config';

const BCRYPT_COST = 12;

/**
 * Helper: Log security event for login attempts
 */
export async function logSecurityEvent(params: {
  company_id: any;
  user_id?: any;
  email?: string;
  event_type: string;
  ip_address?: string;
  user_agent?: string;
  is_suspicious?: boolean;
  metadata?: Record<string, unknown>;
  req?: Request;
}) {
  const eventDoc: any = {
    company_id: params.company_id,
    event_type: params.event_type,
    is_suspicious: params.is_suspicious || false,
  };

  if (params.req) {
    const country = params.req.headers['cf-ipcountry'] || params.req.headers['x-vercel-ip-country'];
    const city = params.req.headers['cf-ipcity'] || params.req.headers['x-vercel-ip-city'];
    if (country || city) {
      if (!params.metadata) params.metadata = {};
      params.metadata.location = [city, country].filter(Boolean).join(', ');
    }
  }

  if (params.user_id) eventDoc.user_id = params.user_id;
  if (params.email) eventDoc.email = params.email;
  if (params.ip_address) eventDoc.ip_address = params.ip_address;
  if (params.user_agent) eventDoc.user_agent = params.user_agent;
  if (params.metadata) eventDoc.metadata = params.metadata;

  await SecurityEvent.create(eventDoc);

  if (params.is_suspicious && params.company_id) {
    const detail = `Suspicious security event: ${params.event_type}.\nUser: ${params.email || params.user_id}\nIP: ${params.ip_address || 'Unknown'}\nLocation: ${params.metadata?.location || 'Unknown'}`;
    sendSecurityAlert(
      params.company_id.toString(),
      params.event_type,
      detail
    ).catch(err => console.error('[SecurityEvent] Failed to send security alert:', err));
  }
}

/** Origin for links in e-mails to Admin web users. No localhost fallback: an unset origin fails loudly (Plan 0.7d). */
export function resolveSpaOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const origin = env.ADMIN_SPA_ORIGIN || env.CLIENT_URL;
  if (!origin) throw new Error('ADMIN_SPA_ORIGIN or CLIENT_URL must be set to build password-reset links');
  return origin.replace(/\/+$/, '');
}

export interface LoginPolicyDenial {
  code: 'FORBIDDEN' | 'ACCOUNT_LOCKED' | 'PASSWORD_EXPIRED';
  message: string;
}

const loginEvent = (req: Request, user: IUser, email: string, reason: string, is_suspicious: boolean, extra: Record<string, unknown> = {}) =>
  logSecurityEvent({
    company_id: user.company_id,
    user_id: user._id,
    email,
    event_type: 'login_failure',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    req,
    is_suspicious,
    metadata: { reason, ...extra },
  });

/** Unknown-email failure (logged without a company, suspicious after repeated attempts). */
export async function recordUnknownEmailFailure(req: Request, email: string): Promise<void> {
  const recentFailures = await SecurityEvent.countDocuments({
    email,
    event_type: 'login_failure',
    created_at: { $gte: new Date(Date.now() - 30 * 60 * 1000) },
  });
  await logSecurityEvent({
    company_id: null,
    email,
    event_type: 'login_failure',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    req,
    is_suspicious: recentFailures >= 5,
    metadata: { reason: 'user_not_found' },
  });
}

/** Legacy SecurityPolicy whitelist/blacklist + identity-scoped IpRestriction rules for the portal. */
export async function evaluateLoginIpPolicy(req: Request, user: IUser, email: string): Promise<LoginPolicyDenial | null> {
  const clientIp = req.ip || '127.0.0.1';
  const policy = await getAggregatedSecurityPolicy(user);
  if (policy) {
    if (policy.settings.ip_whitelist_enabled && policy.settings.ip_whitelist && policy.settings.ip_whitelist.length > 0) {
      const isWhitelisted = policy.settings.ip_whitelist.some((range: string) => isIpInRange(clientIp, range));
      if (!isWhitelisted) {
        await loginEvent(req, user, email, 'ip_not_whitelisted', true);
        return { code: 'FORBIDDEN', message: 'Access denied from this IP address' };
      }
    }
    if (policy.settings.ip_blacklist_enabled && policy.settings.ip_blacklist && policy.settings.ip_blacklist.length > 0) {
      const isBlacklisted = policy.settings.ip_blacklist.some((range: string) => isIpInRange(clientIp, range));
      if (isBlacklisted) {
        await loginEvent(req, user, email, 'ip_blacklisted', true);
        return { code: 'FORBIDDEN', message: 'Access denied from this IP address' };
      }
    }
  }

  const companySettings = await Company.findById(user.company_id).select('settings.ip_restrictions_enabled');
  if (companySettings?.settings?.ip_restrictions_enabled) {
    // Login evaluates 'portal' and 'all_apps' rules.
    const targetRestrictions = await IpRestriction.find({
      company_id: user.company_id,
      is_enabled: true,
      target_type: { $in: ['portal', 'all_apps'] },
    });

    if (targetRestrictions.length > 0) {
      const userIdStr = user._id.toString();
      const userRoleAssignment = await UserRole.findOne({ user_id: user._id });
      const userRoleId = userRoleAssignment?.role_id?.toString() || null;
      const memberships = await GroupMember.find({ user_id: user._id });
      const userGroups = memberships.map(m => m.group_id.toString());
      const userDepartment = user.department_id ? user.department_id.toString() : null;

      const applicableRestrictions = targetRestrictions.filter(r => {
        if (r.subject_type === 'all_users') return true;
        if (!r.subject_id) return false;
        const sid = r.subject_id.toString();
        if (r.subject_type === 'user') return sid === userIdStr;
        if (r.subject_type === 'group') return userGroups.includes(sid);
        if (r.subject_type === 'role') return sid === userRoleId;
        if (r.subject_type === 'department') return sid === userDepartment;
        return false;
      });

      if (applicableRestrictions.length === 0) {
        await loginEvent(req, user, email, 'ip_implicit_deny', true);
        return { code: 'FORBIDDEN', message: 'Access denied. You are not authorized by any IP restriction rule.' };
      }
      if (!applicableRestrictions.some(rule => isIpInRange(clientIp, rule.ip_address))) {
        await loginEvent(req, user, email, 'ip_not_whitelisted_abac', true);
        return { code: 'FORBIDDEN', message: 'Access denied from this IP address based on Company IP Restrictions' };
      }
    }
  }
  return null;
}

export const isLocked = (user: IUser, identity: IIdentity) =>
  identity.status === 'locked'
  || (!!identity.locked_until && identity.locked_until > new Date())
  || (!!user.locked_until && user.locked_until > new Date());

/** Wrong password: count recent failures, lock the membership per the org security policy. */
export async function recordPasswordFailure(req: Request, user: IUser, identity: IIdentity): Promise<void> {
  const email = identity.email;
  const recentFailures = await SecurityEvent.countDocuments({
    email,
    event_type: 'login_failure',
    created_at: { $gte: new Date(Date.now() - 30 * 60 * 1000) },
  });
  const securityPolicy = await getAggregatedSecurityPolicy(user);
  const maxAttempts = securityPolicy?.settings.max_failed_login_attempts || 5;
  const lockoutDurationMinutes = securityPolicy?.settings.lockout_duration_minutes || 30;
  const isSuspicious = (recentFailures + 1) >= maxAttempts;

  identity.failed_login_attempts = (identity.failed_login_attempts || 0) + 1;
  if (isSuspicious) {
    // Locks live on the membership so the existing admin "unlock user" action clears them.
    user.locked_until = new Date(Date.now() + lockoutDurationMinutes * 60 * 1000);
    await user.save();
  }
  await identity.save();

  await loginEvent(req, user, email, 'invalid_password', isSuspicious, { failure_count: recentFailures + 1, max_attempts: maxAttempts });
}

export async function recordLockedAttempt(req: Request, user: IUser, email: string): Promise<void> {
  await loginEvent(req, user, email, 'account_locked', true);
}

/** Password expiry per the org security policy. */
export async function checkPasswordExpired(req: Request, user: IUser, identity: IIdentity): Promise<LoginPolicyDenial | null> {
  const policy = await getAggregatedSecurityPolicy(user);
  const days = policy?.settings.password_expiry_days;
  if (!days || days <= 0) return null;
  const changedOrCreated = identity.password_changed_at || identity.created_at || user.created_at;
  const daysSince = (Date.now() - changedOrCreated.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= days) return null;
  await loginEvent(req, user, identity.email, 'password_expired', false);
  return { code: 'PASSWORD_EXPIRED', message: 'Password has expired. Please reset your password.' };
}

/** Tenant last-activity marker for the Command Center (Plan 4.3): one conditional write, at most once per hour per tenant. */
export async function touchCompanyActivity(companyId: Types.ObjectId, now = new Date()): Promise<void> {
  await Company.updateOne(
    { _id: companyId, $or: [{ last_activity_at: { $exists: false } }, { last_activity_at: { $lt: new Date(now.getTime() - 3600_000) } }] },
    { $set: { last_activity_at: now } },
  );
}

export async function recordLoginSuccess(req: Request, user: IUser, identity: IIdentity, amr: string[]): Promise<void> {
  identity.failed_login_attempts = 0;
  identity.last_login_at = new Date();
  await identity.save();
  await User.updateOne({ _id: user._id }, { $set: { last_login: new Date() }, $unset: { locked_until: 1 } });
  await touchCompanyActivity(user.company_id);
  await logSecurityEvent({
    company_id: user.company_id,
    user_id: user._id,
    email: identity.email,
    event_type: 'login_success',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    req,
    metadata: { lifecycle_state: user.lifecycle_state, amr },
  });
}

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { sid, userId, company_id } = req.user;
  await revokeSession(sid, 'user_logout');

  await logSecurityEvent({
    company_id,
    user_id: userId,
    event_type: 'logout',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    req,
    metadata: { sid },
  });
  await logSecurityEvent({
    company_id,
    user_id: userId,
    event_type: 'token_revoked',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    req,
    metadata: { reason: 'user_logout', sid },
  });

  const { tenantIssuer, adminSpaOrigin } = getIdentityConfig();
  const end_session_url = `${tenantIssuer}/oauth/end_session?client_id=${ADMIN_SPA_CLIENT_ID}&post_logout_redirect_uri=${encodeURIComponent(`${adminSpaOrigin}/login?signed_out=1`)}`;
  res.status(200).json({ success: true, data: { end_session_url } });
});

/** Allow-list projection (never the raw user document: password history, MFA counters, risk score, ...). */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findOne({ _id: req.user.userId, company_id: req.user.company_id })
    .select('_id company_id role email full_name')
    .lean();

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }
  const company = await Company.findById(user.company_id).select('name').lean();

  res.status(200).json({
    success: true,
    data: {
      user: {
        _id: user._id,
        company_id: user.company_id,
        role: user.role,
        email: user.email,
        full_name: user.full_name,
        company_name: company?.name ?? null,
      },
    },
  });
});

export const getMyPermissions = asyncHandler(async (req: Request, res: Response) => {
  const permissions = await resolveUserPermissions(
    // @ts-ignore
    req.user.userId,
    req.user.company_id
  );

  // Convert Map to plain object for JSON serialization
  const permissionsObj: Record<string, boolean> = {};
  for (const [key, val] of permissions.permissions.entries()) {
    permissionsObj[key] = val;
  }

  res.status(200).json({
    success: true,
    data: {
      ...permissions,
      permissions: permissionsObj
    }
  });
});

/** The member's Identity: linked one, else find-by-email and link, else create (03 §1.1/§1.2). */
async function identityForMember(user: IUser, session?: ClientSession): Promise<IIdentity> {
  let identity = user.identity_id ? await Identity.findById(user.identity_id).session(session ?? null) : null;
  if (!identity) {
    const email = user.email.toLowerCase();
    identity = await Identity.findOne({ email }).session(session ?? null)
      ?? (await Identity.create([{ email, full_name: user.full_name, status: 'active' }], { session }))[0];
    user.identity_id = identity._id;
  }
  return identity;
}

/** Validate against policy + the identity's history, then store a bcrypt(12) hash on the Identity. */
export async function setIdentityPassword(user: IUser, identity: IIdentity, newPassword: string): Promise<void> {
  const policy = await getAggregatedSecurityPolicy(user);
  const historySubject = { role: user.role, password_hash: identity.password_hash, previous_password_hashes: identity.previous_password_hashes };
  const validation = await validatePasswordAgainstPolicy(newPassword, policy?.settings, historySubject);
  if (!validation.isValid) {
    throw new AppError(validation.error || 'Password does not meet policy requirements', 400, 'BAD_REQUEST');
  }

  const previousHashes = [...(identity.previous_password_hashes || [])];
  if (identity.password_hash) previousHashes.unshift(identity.password_hash);
  const maxHistory = policy?.settings?.password_history_count || 5;

  identity.previous_password_hashes = previousHashes.slice(0, maxHistory);
  identity.password_hash = await bcrypt.hash(newPassword, BCRYPT_COST);
  identity.password_changed_at = new Date();
  identity.failed_login_attempts = 0;
  identity.locked_until = undefined;
  if (!identity.email_verified_at) identity.email_verified_at = new Date(); // proven by the emailed token
}

const SetupPasswordSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase()).optional(), // the token identifies the user; if sent it must match
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

export const setupPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = SetupPasswordSchema.safeParse(req.body);
  if (!result.success) {
    throw new AppError(result.error.issues[0].message, 400, 'BAD_REQUEST');
  }
  const { email, token, newPassword } = result.data;

  // One transaction: the atomic consume, the password and the lifecycle state commit together or not at all.
  // Two concurrent accepts: the loser's consume matches nothing (or its transaction retries and then matches nothing).
  const accepted = await runInTransaction(async (session) => {
    const invitation = await consumeInvitation(session, token);
    if (!invitation) return null;

    const user = await User.findOne({ _id: invitation.user_id, company_id: invitation.company_id }).session(session ?? null);
    if (!user || (email && user.email.toLowerCase() !== email)) {
      throw new AppError('This link is not valid. Check that you copied the whole link.', 404, 'INVITE_NOT_FOUND'); // rolls back the consume
    }

    const identity = await identityForMember(user, session);
    await setIdentityPassword(user, identity, newPassword);
    await identity.save({ session });

    const oldState = user.lifecycle_state;
    user.lifecycle_state = 'active';
    user.is_active = true;
    user.password_changed_at = identity.password_changed_at;
    await user.save({ session });
    return { user, identity, oldState };
  });

  if (!accepted) {
    const problem = invitationProblem(await findInvitationByToken(token)) ?? invitationProblem(null)!;
    await logSecurityEvent({
      company_id: null,
      event_type: 'password_setup_failure',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      req,
      is_suspicious: true,
      metadata: { reason: problem.code },
    });
    throw new AppError(problem.message, problem.status, problem.code);
  }
  const { user, identity, oldState } = accepted;

  // Log Security Event
  await logSecurityEvent({
    company_id: user.company_id,
    user_id: user._id,
    email: user.email.toLowerCase(),
    event_type: 'password_setup_success',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    req,
    metadata: {
      previous_state: oldState,
      new_state: 'active',
      identity_id: identity._id.toString(),
    },
  });

  // Log Audit Event
  await auditLogger.log({
    req,
    action: 'user.lifecycle_changed',
    module: 'auth',
    object_type: 'User',
    object_id: user._id.toString(),
    object_label: user.full_name,
    before_state: { lifecycle_state: oldState },
    after_state: { lifecycle_state: 'active' },
    actor_override: {
      userId: user._id.toString(),
      email: user.email,
      company_id: user.company_id,
    },
  });

  res.status(200).json({
    success: true,
    message: 'Password set up successfully. You can now log in.',
  });
});

const RequestResetSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase()),
});

export const requestPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  const result = RequestResetSchema.safeParse(req.body);
  if (!result.success) {
    throw new AppError(result.error.issues[0].message, 400, 'BAD_REQUEST');
  }

  const { email } = result.data;
  const user = await User.findOne({ email });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await PasswordResetToken.create({
      user_id: user._id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    const spaOrigin = resolveSpaOrigin();
    const resetLink = `${spaOrigin}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;
    // Run email sending in the background to prevent frontend timeout
    sendPasswordResetEmail(email, user.full_name || 'User', resetLink).catch((err) => {
      console.error('[auth.controller] Failed to send reset email:', err);
    });

    await logSecurityEvent({
      company_id: user.company_id,
      user_id: user._id,
      email,
      event_type: 'password_reset_request',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      req,
    });
  }

  // Always return success to prevent email enumeration
  res.status(200).json({
    success: true,
    message: 'If an account exists with that email, a password reset link has been sent.',
  });
});

const ResetPasswordSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase()),
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = ResetPasswordSchema.safeParse(req.body);
  if (!result.success) {
    throw new AppError(result.error.issues[0].message, 400, 'BAD_REQUEST');
  }

  const { email, token, newPassword } = result.data;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const resetRecord = await PasswordResetToken.findOne({
    token_hash: tokenHash,
    is_used: false,
    expires_at: { $gt: new Date() },
  });

  if (!resetRecord) {
    throw new AppError('Invalid or expired reset token', 400, 'INVALID_TOKEN');
  }

  const user = await User.findOne({
    _id: resetRecord.user_id,
    email: email,
  });

  if (!user) {
    throw new AppError('Invalid or expired reset token', 400, 'INVALID_TOKEN');
  }

  const identity = await identityForMember(user);
  await setIdentityPassword(user, identity, newPassword);
  await identity.save();

  user.password_changed_at = identity.password_changed_at;
  user.locked_until = undefined;
  await user.save();

  resetRecord.is_used = true;
  resetRecord.used_at = new Date();
  await resetRecord.save();

  // 03 §4.4: all sessions revoked; TOTP is still required at the next login.
  const revoked = await revokeIdentitySessions(identity._id, 'password_reset');

  await logSecurityEvent({
    company_id: user.company_id,
    user_id: user._id,
    email,
    event_type: 'password_reset_complete',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    req,
    metadata: { sessions_revoked: revoked },
  });

  res.status(200).json({
    success: true,
    message: 'Password reset successfully. You can now log in.',
  });
});
