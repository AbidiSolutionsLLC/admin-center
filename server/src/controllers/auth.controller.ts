// server/src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler';
import { User, LifecycleState, UserRole, Role, RefreshToken, SecurityEvent, SecurityPolicy, InviteToken, PasswordResetToken, Company } from '../models';
import { signAccessToken, signRefreshToken, AdminClaim, signMfaToken, verifyMfaToken } from '../lib/tokenService';
import { sendPasswordResetEmail, sendMfaOtpEmail } from '../lib/emailService';
import { validatePasswordAgainstPolicy } from '../utils/passwordPolicy';
import { AppError } from '../utils/AppError';
import { z } from 'zod';
import { auditLogger } from '../lib/auditLogger';
import { resolveUserPermissions } from '../lib/rbac';
import { ROLES } from '../constants/roles';
import { sendSecurityAlert } from '../lib/notificationEngine';
import { isIpInRange } from '../utils/ipUtils';
import { getAggregatedSecurityPolicy } from '../utils/securityPolicyUtils';

// 7 days in milliseconds
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Helper: Log security event for login attempts
 */
async function logSecurityEvent(params: {
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

  if (params.company_id) {
    try {
      const policy = await SecurityPolicy.findOne({ company_id: params.company_id, target_type: 'all', is_enabled: true });
      if (policy && policy.settings.alert_settings) {
        const alerts = policy.settings.alert_settings;
        let shouldAlert = false;
        let alertDetail = '';

        if (params.event_type === 'login_failure' && alerts.notify_on_failed_logins && params.metadata?.failure_count) {
          const threshold = alerts.failed_logins_threshold || 5;
          if ((params.metadata.failure_count as number) >= threshold) {
            shouldAlert = true;
            alertDetail = `Failed login threshold exceeded. User ${params.email || 'unknown'} failed to log in ${params.metadata.failure_count} times.`;
          }
        } else if (params.is_suspicious && alerts.notify_on_suspicious_login && params.event_type !== 'login_failure') {
          shouldAlert = true;
          alertDetail = `Suspicious activity detected for user ${params.email || 'unknown'}. Reason: ${params.metadata?.reason || 'Unknown'}`;
        } else if (params.is_suspicious && alerts.notify_on_risk_flags && !shouldAlert) {
          shouldAlert = true;
          alertDetail = `Risk flag triggered for user ${params.email || 'unknown'}. Event: ${params.event_type}.`;
        }

        if (shouldAlert) {
          sendSecurityAlert(
            params.company_id.toString(),
            params.event_type,
            alertDetail,
            alerts.alert_emails
          ).catch(err => console.error('[logSecurityEvent] Failed to send security alert:', err));
        }
      }
    } catch (err) {
      console.error('[logSecurityEvent] Failed to send security alert:', err);
    }
  }
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError('Email and password are required', 400, 'BAD_REQUEST');
  }

  const user = await User.findOne({ email }).select('+password_hash');
  
  // Log login attempt (before validation)
  await logSecurityEvent({
    company_id: user?.company_id || null,
    user_id: user?._id || null,
    email: email.toLowerCase(),
    event_type: 'login_attempt',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    req,
    metadata: { reason: 'login_attempt_logged' },
  });

  if (!user) {
    // User not found - log failure
    // Check if this is suspicious (multiple failures for non-existent email)
    const recentFailures = await SecurityEvent.countDocuments({
      email: email.toLowerCase(),
      event_type: 'login_failure',
      created_at: { $gte: new Date(Date.now() - 30 * 60 * 1000) }, // Last 30 minutes
    });

    const maxAttempts = 5; // Default threshold for unknown users
    const isSuspicious = recentFailures >= maxAttempts;

    await logSecurityEvent({
      company_id: null,
      email: email.toLowerCase(),
      event_type: 'login_failure',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      req,
      is_suspicious: isSuspicious,
      metadata: { reason: 'user_not_found' },
    });

    throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
  }

  // Check IP restrictions
  const globalPolicyForIp = await getAggregatedSecurityPolicy(user);
  if (globalPolicyForIp) {
    const clientIp = req.ip || '127.0.0.1';
    if (globalPolicyForIp.settings.ip_whitelist_enabled && globalPolicyForIp.settings.ip_whitelist && globalPolicyForIp.settings.ip_whitelist.length > 0) {
      const isWhitelisted = globalPolicyForIp.settings.ip_whitelist.some((range: string) => isIpInRange(clientIp, range));
      if (!isWhitelisted) {
        await logSecurityEvent({
          company_id: user.company_id,
          user_id: user._id,
          email: email.toLowerCase(),
          event_type: 'login_failure',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          req,
          is_suspicious: true,
          metadata: { reason: 'ip_not_whitelisted' },
        });
        throw new AppError('Access denied from this IP address', 403, 'FORBIDDEN');
      }
    }
    if (globalPolicyForIp.settings.ip_blacklist_enabled && globalPolicyForIp.settings.ip_blacklist && globalPolicyForIp.settings.ip_blacklist.length > 0) {
      const isBlacklisted = globalPolicyForIp.settings.ip_blacklist.some((range: string) => isIpInRange(clientIp, range));
      if (isBlacklisted) {
        await logSecurityEvent({
          company_id: user.company_id,
          user_id: user._id,
          email: email.toLowerCase(),
          event_type: 'login_failure',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          req,
          is_suspicious: true,
          metadata: { reason: 'ip_blacklisted' },
        });
        throw new AppError('Access denied from this IP address', 403, 'FORBIDDEN');
      }
    }
  }

  if (user.locked_until && user.locked_until > new Date()) {
    await logSecurityEvent({
      company_id: user.company_id,
      user_id: user._id,
      email: email.toLowerCase(),
      event_type: 'login_failure',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      req,
      is_suspicious: true,
      metadata: { reason: 'account_locked' },
    });
    throw new AppError('Account is locked due to multiple failed login attempts. Please contact your administrator or reset your password.', 403, 'ACCOUNT_LOCKED');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    // Check recent failures for this email/user
    const recentFailures = await SecurityEvent.countDocuments({
      email: email.toLowerCase(),
      event_type: 'login_failure',
      created_at: { $gte: new Date(Date.now() - 30 * 60 * 1000) }, // Last 30 minutes
    });

    const securityPolicy = await getAggregatedSecurityPolicy(user);
    const maxAttempts = securityPolicy?.settings.max_failed_login_attempts || 5;
    const lockoutDurationMinutes = securityPolicy?.settings.lockout_duration_minutes || 30;
    
    // is_suspicious = true if we've reached or exceeded the threshold
    const isSuspicious = (recentFailures + 1) >= maxAttempts;
    
    if (isSuspicious) {
      user.locked_until = new Date(Date.now() + lockoutDurationMinutes * 60 * 1000);
      await user.save();
    }

    // Log login failure
    await logSecurityEvent({
      company_id: user.company_id,
      user_id: user._id,
      email: email.toLowerCase(),
      event_type: 'login_failure',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      req,
      is_suspicious: isSuspicious,
      metadata: { 
        reason: 'invalid_password',
        failure_count: recentFailures + 1,
        max_attempts: maxAttempts,
      },
    });

    throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
  }

  // Check password expiration
  const securityPolicyForExpiry = await getAggregatedSecurityPolicy(user);
  if (securityPolicyForExpiry?.settings.password_expiry_days && securityPolicyForExpiry.settings.password_expiry_days > 0) {
    const changedOrCreated = user.password_changed_at || user.created_at;
    const daysSince = (Date.now() - changedOrCreated.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSince > securityPolicyForExpiry.settings.password_expiry_days) {
      await logSecurityEvent({
        company_id: user.company_id,
        user_id: user._id,
        email: email.toLowerCase(),
        event_type: 'login_failure',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        req,
        is_suspicious: false,
        metadata: { reason: 'password_expired' },
      });
      throw new AppError('Password has expired. Please reset your password.', 403, 'PASSWORD_EXPIRED');
    }
  }

  if (user.lifecycle_state === 'deactivated' || user.lifecycle_state === 'archived' || user.lifecycle_state === 'terminated') {
    throw new AppError('Your account is currently inactive. Please contact support if you believe this is an error.', 403, 'FORBIDDEN');
  }

  // Fetch actual user role from RBAC models
  const userRoleAssignment = await UserRole.findOne({ user_id: user._id }).populate('role_id');
  const userRole = (userRoleAssignment?.role_id as any)?.name as AdminClaim['user_role'] || 'Employee';

  // --- MFA Check ---
  let mfaRequired = user.mfa_enabled;

  // Stricter controls: Admin users MUST use MFA
  const adminRoles = [ROLES.SUPER_ADMIN, ROLES.HR_ADMIN, ROLES.IT_ADMIN, ROLES.OPS_ADMIN, ROLES.ADMIN];
  if (adminRoles.includes(user.role)) {
    mfaRequired = true;
  }

  if (!mfaRequired) {
    const aggregatedPolicy = await getAggregatedSecurityPolicy(user);
    if (aggregatedPolicy?.settings.require_mfa) mfaRequired = true;
  }

  if (mfaRequired) {
    // Generate 6 digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.mfa_otp = otpCode;
    user.mfa_otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const company = await Company.findById(user.company_id);
    
    sendMfaOtpEmail({
      email: user.email,
      full_name: user.full_name,
      otp_code: otpCode,
      company_name: company?.name || 'Our Company',
    }).catch(err => console.error('[Auth] Failed to send MFA OTP email:', err));

    await logSecurityEvent({
      company_id: user.company_id,
      user_id: user._id,
      email: user.email,
      event_type: 'mfa_challenge',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      req,
    });

    const tempToken = signMfaToken({ mfaUserId: user._id.toString() });

    return res.status(200).json({
      success: true,
      data: {
        requires_mfa: true,
        temp_token: tempToken
      }
    });
  }

  // Sign tokens
  const accessToken = signAccessToken({
    userId: user._id.toString(),
    email: user.email,
    user_role: userRole,
    company_id: user.company_id.toString()
  });

  // Create a raw refresh token and its hash
  const rawRefreshToken = signRefreshToken({ userId: user._id.toString() });
  const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

  user.mfa_otp = undefined;
  user.mfa_otp_expires_at = undefined;
  user.refresh_token_hash = refreshTokenHash;
  user.last_login = new Date();
  user.locked_until = undefined;
  await user.save();

  let sessionTimeoutMs = REFRESH_TOKEN_MAX_AGE;
  let maxConcurrent = 3;
  const globalPolicy = await getAggregatedSecurityPolicy(user);
  if (globalPolicy?.settings) {
    sessionTimeoutMs = globalPolicy.settings.session_timeout_minutes ? globalPolicy.settings.session_timeout_minutes * 60 * 1000 : sessionTimeoutMs;
    maxConcurrent = globalPolicy.settings.max_concurrent_sessions || 3;
  }

  // Create RefreshToken record
  await RefreshToken.create({
    user_id: user._id,
    token_hash: refreshTokenHash,
    expires_at: new Date(Date.now() + sessionTimeoutMs),
    last_activity_at: new Date(),
    ip_address: req.ip,
    user_agent: req.headers['user-agent']
  });

  // Enforce max concurrent sessions
  const activeTokens = await RefreshToken.find({ user_id: user._id, is_revoked: false }).sort({ last_activity_at: -1 });
  if (activeTokens.length > maxConcurrent) {
    const tokensToRevoke = activeTokens.slice(maxConcurrent);
    const tokenIds = tokensToRevoke.map(t => t._id);
    await RefreshToken.updateMany({ _id: { $in: tokenIds } }, { $set: { is_revoked: true } });
  }

  // Log successful login
  await logSecurityEvent({
    company_id: user.company_id,
    user_id: user._id,
    email: user.email,
    event_type: 'login_success',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    req,
    metadata: { lifecycle_state: user.lifecycle_state },
  });

  // Set the refresh cookie
  res.cookie('refreshToken', rawRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: sessionTimeoutMs,
    path: '/api/v1/auth/refresh' // only sent to refresh endpoint to save bandwidth
  });

  res.status(200).json({
    success: true,
    data: {
      accessToken,
      user: {
        _id: user._id,
        email: user.email,
        full_name: user.full_name,
        company_id: user.company_id,
        role: userRole,
      }
    }
  });
});

const VerifyMfaSchema = z.object({
  temp_token: z.string().min(1),
  otp_code: z.string().length(6),
});

export const verifyMfa = asyncHandler(async (req: Request, res: Response) => {
  const result = VerifyMfaSchema.safeParse(req.body);
  if (!result.success) {
    throw new AppError('Invalid request format', 400, 'BAD_REQUEST');
  }

  const { temp_token, otp_code } = result.data;
  let decoded;
  try {
    decoded = verifyMfaToken(temp_token);
  } catch (err) {
    throw new AppError('Session expired or invalid. Please log in again.', 401, 'INVALID_TOKEN');
  }

  const user = await User.findById(decoded.mfaUserId);
  if (!user || user.mfa_otp !== otp_code || !user.mfa_otp_expires_at) {
    if (user) {
      await logSecurityEvent({
        company_id: user.company_id,
        user_id: user._id,
        email: user.email,
        event_type: 'mfa_failed',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        req,
        metadata: { reason: 'invalid_otp' }
      });
    }
    throw new AppError('Invalid verification code.', 401, 'UNAUTHORIZED');
  }

  if (new Date() > user.mfa_otp_expires_at) {
    await logSecurityEvent({
      company_id: user.company_id,
      user_id: user._id,
      email: user.email,
      event_type: 'mfa_failed',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      req,
      metadata: { reason: 'expired_otp' }
    });
    throw new AppError('Verification code expired. Please log in again.', 401, 'UNAUTHORIZED');
  }

  // OTP verified successfully
  user.mfa_otp = undefined;
  user.mfa_otp_expires_at = undefined;
  // Automatically opt them in if they aren't already, since they just successfully verified
  user.mfa_enabled = true;
  user.last_login = new Date();
  
  await logSecurityEvent({
    company_id: user.company_id,
    user_id: user._id,
    email: user.email,
    event_type: 'mfa_verified',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    req,
  });

  await logSecurityEvent({
    company_id: user.company_id,
    user_id: user._id,
    email: user.email,
    event_type: 'login_success',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    req,
    metadata: { lifecycle_state: user.lifecycle_state },
  });

  // Re-fetch role
  const userRoleAssignment = await UserRole.findOne({ user_id: user._id }).populate('role_id');
  const userRole = (userRoleAssignment?.role_id as any)?.name as AdminClaim['user_role'] || 'Employee';

  const accessToken = signAccessToken({
    userId: user._id.toString(),
    email: user.email,
    user_role: userRole,
    company_id: user.company_id.toString()
  });

  const rawRefreshToken = signRefreshToken({ userId: user._id.toString() });
  const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

  user.refresh_token_hash = refreshTokenHash;
  await user.save();

  const globalPolicy = await getAggregatedSecurityPolicy(user);
  let sessionTimeoutMs = REFRESH_TOKEN_MAX_AGE;
  let maxConcurrent = 3;
  if (globalPolicy?.settings) {
    sessionTimeoutMs = globalPolicy.settings.session_timeout_minutes ? globalPolicy.settings.session_timeout_minutes * 60 * 1000 : sessionTimeoutMs;
    maxConcurrent = globalPolicy.settings.max_concurrent_sessions || 3;
  }

  await RefreshToken.create({
    user_id: user._id,
    token_hash: refreshTokenHash,
    expires_at: new Date(Date.now() + sessionTimeoutMs),
    last_activity_at: new Date(),
    ip_address: req.ip,
    user_agent: req.headers['user-agent']
  });

  const activeTokens = await RefreshToken.find({ user_id: user._id, is_revoked: false }).sort({ last_activity_at: -1 });
  if (activeTokens.length > maxConcurrent) {
    const tokensToRevoke = activeTokens.slice(maxConcurrent);
    const tokenIds = tokensToRevoke.map(t => t._id);
    await RefreshToken.updateMany({ _id: { $in: tokenIds } }, { $set: { is_revoked: true } });
  }

  res.cookie('refreshToken', rawRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: sessionTimeoutMs,
    path: '/api/v1/auth/refresh'
  });

  res.status(200).json({
    success: true,
    data: {
      accessToken,
      user: {
        _id: user._id,
        email: user.email,
        full_name: user.full_name,
        company_id: user.company_id,
        role: userRole,
      }
    }
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  
  if (!token) {
    throw new AppError('No refresh token provided', 401, 'NO_TOKEN');
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // Verify in DB
  const validTokenRecord = await RefreshToken.findOne({
    token_hash: tokenHash,
    is_revoked: false,
    expires_at: { $gt: new Date() }
  });

  if (!validTokenRecord) {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_TOKEN');
  }

  const user = await User.findById(validTokenRecord.user_id);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  if (user.refresh_token_hash !== tokenHash) {
    throw new AppError('Token was invalidated globally', 401, 'INVALID_TOKEN');
  }

  if (user.lifecycle_state === 'deactivated' || user.lifecycle_state === 'archived' || user.lifecycle_state === 'terminated') {
    throw new AppError('Your account is currently inactive. Please contact support if you believe this is an error.', 403, 'FORBIDDEN');
  }

  // Issue new access token with actual role
  const userRoleAssignment = await UserRole.findOne({ user_id: user._id }).populate('role_id');
  const userRole = (userRoleAssignment?.role_id as any)?.name as AdminClaim['user_role'] || 'Employee';

  const accessToken = signAccessToken({
    userId: user._id.toString(),
    email: user.email,
    user_role: userRole,
    company_id: user.company_id.toString()
  });

  // Log token refresh security event
  await logSecurityEvent({
    company_id: user.company_id,
    user_id: user._id,
    email: user.email,
    event_type: 'token_refresh',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    req,
    metadata: { lifecycle_state: user.lifecycle_state },
  });

  const globalPolicy = await getAggregatedSecurityPolicy(user);
  const sessionTimeoutMs = globalPolicy?.settings?.session_timeout_minutes 
    ? globalPolicy.settings.session_timeout_minutes * 60 * 1000 
    : REFRESH_TOKEN_MAX_AGE;

  validTokenRecord.last_activity_at = new Date();
  validTokenRecord.expires_at = new Date(Date.now() + sessionTimeoutMs);
  await validTokenRecord.save();

  res.status(200).json({
    success: true,
    data: {
      accessToken
    }
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;

  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Invalidate RefreshToken record
    await RefreshToken.updateMany(
      { token_hash: tokenHash },
      { $set: { is_revoked: true } }
    );

    // Optionally clear hash from User
    if (req.user) {
      await User.findByIdAndUpdate(req.user.userId, { $unset: { refresh_token_hash: 1 } });
      
      // Log logout security event
      await logSecurityEvent({
        company_id: req.user.company_id,
        user_id: req.user.userId,
        event_type: 'logout',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        req,
        metadata: { token_revoked: true },
      });

      // Log token revocation event
      await logSecurityEvent({
        company_id: req.user.company_id,
        user_id: req.user.userId,
        event_type: 'token_revoked',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        req,
        metadata: { reason: 'user_logout' },
      });
    }
  }

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth/refresh'
  });

  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user.userId).select('-password_hash -refresh_token_hash');
  
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  res.status(200).json({
    success: true,
    data: {
      user
    }
  });
});

export const getMyPermissions = asyncHandler(async (req: Request, res: Response) => {
  const permissions = await resolveUserPermissions(
    req.user.userId,
    req.user.company_id
  );

  res.status(200).json({
    success: true,
    data: permissions
  });
});

const SetupPasswordSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase()),
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

export const setupPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = SetupPasswordSchema.safeParse(req.body);
  if (!result.success) {
    throw new AppError(result.error.issues[0].message, 400, 'BAD_REQUEST');
  }
  const { email, token, newPassword } = result.data;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const inviteRecord = await InviteToken.findOne({
    token_hash: tokenHash,
    is_used: false,
    expires_at: { $gt: new Date() },
  });

  if (!inviteRecord) {
    await logSecurityEvent({
      company_id: null,
      event_type: 'password_setup_failure',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      req,
      is_suspicious: true,
      metadata: { reason: 'invalid_or_expired_token' },
    });
    throw new AppError('Invalid or expired token', 400, 'INVALID_TOKEN');
  }

  const user = await User.findOne({
    _id: inviteRecord.user_id,
    email: email.toLowerCase(),
  }).select('+password_hash');

  if (!user) {
    await logSecurityEvent({
      company_id: null,
      event_type: 'password_setup_failure',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      req,
      is_suspicious: true,
      metadata: { reason: 'invalid_email_or_token' },
    });
    throw new AppError('Invalid or expired token', 400, 'INVALID_TOKEN');
  }

  // Fetch policy and validate password
  const policy = await getAggregatedSecurityPolicy(user);
  const validation = await validatePasswordAgainstPolicy(newPassword, policy?.settings, user);
  if (!validation.isValid) {
    throw new AppError(validation.error || 'Password does not meet policy requirements', 400, 'BAD_REQUEST');
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(newPassword, salt);

  // Update history
  const previousHashes = user.previous_password_hashes || [];
  if (user.password_hash) {
    previousHashes.unshift(user.password_hash);
  }
  const maxHistory = policy?.settings?.password_history_count || 5;
  user.previous_password_hashes = previousHashes.slice(0, maxHistory);
  user.password_changed_at = new Date();

  // Update user
  const oldState = user.lifecycle_state;
  user.password_hash = password_hash;
  user.lifecycle_state = 'active'; // Transition to active
  user.is_active = true;
  await user.save();

  inviteRecord.is_used = true;
  inviteRecord.used_at = new Date();
  await inviteRecord.save();

  // Log Security Event
  await logSecurityEvent({
    company_id: user.company_id,
    user_id: user._id,
    email: email.toLowerCase(),
    event_type: 'password_setup_success',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    req,
    metadata: { 
      previous_state: oldState,
      new_state: 'active'
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

    const resetLink = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;
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
  }).select('+password_hash +previous_password_hashes');

  if (!user) {
    throw new AppError('Invalid or expired reset token', 400, 'INVALID_TOKEN');
  }

  const policy = await getAggregatedSecurityPolicy(user);
  const validation = await validatePasswordAgainstPolicy(newPassword, policy?.settings, user);
  
  if (!validation.isValid) {
    throw new AppError(validation.error || 'Password does not meet policy requirements', 400, 'BAD_REQUEST');
  }

  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(newPassword, salt);

  const previousHashes = user.previous_password_hashes || [];
  if (user.password_hash) {
    previousHashes.unshift(user.password_hash);
  }
  const maxHistory = policy?.settings?.password_history_count || 5;
  
  user.previous_password_hashes = previousHashes.slice(0, maxHistory);
  user.password_hash = password_hash;
  user.password_changed_at = new Date();
  user.locked_until = undefined;
  await user.save();

  resetRecord.is_used = true;
  resetRecord.used_at = new Date();
  await resetRecord.save();

  await logSecurityEvent({
    company_id: user.company_id,
    user_id: user._id,
    email,
    event_type: 'password_reset_complete',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    req,
  });

  // Optionally invalidate all existing sessions
  await RefreshToken.updateMany(
    { user_id: user._id },
    { $set: { is_revoked: true } }
  );

  res.status(200).json({
    success: true,
    message: 'Password reset successfully. You can now log in.',
  });
});

