// server/src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler';
import { User, LifecycleState } from '../models/User.model';
import { RefreshToken } from '../models/RefreshToken.model';
import { SecurityEvent } from '../models/SecurityEvent.model';
import { SecurityPolicy } from '../models/SecurityPolicy.model';
import { signAccessToken, signRefreshToken, AdminClaim } from '../lib/tokenService';
import { AppError } from '../utils/AppError';
import { z } from 'zod';
import { auditLogger } from '../lib/auditLogger';

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
}) {
  const eventDoc: any = {
    company_id: params.company_id,
    event_type: params.event_type,
    is_suspicious: params.is_suspicious || false,
  };

  if (params.user_id) eventDoc.user_id = params.user_id;
  if (params.email) eventDoc.email = params.email;
  if (params.ip_address) eventDoc.ip_address = params.ip_address;
  if (params.user_agent) eventDoc.user_agent = params.user_agent;
  if (params.metadata) eventDoc.metadata = params.metadata;

  await SecurityEvent.create(eventDoc);
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
      is_suspicious: isSuspicious,
      metadata: { reason: 'user_not_found' },
    });

    throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    // Check recent failures for this email/user
    const recentFailures = await SecurityEvent.countDocuments({
      email: email.toLowerCase(),
      event_type: 'login_failure',
      created_at: { $gte: new Date(Date.now() - 30 * 60 * 1000) }, // Last 30 minutes
    });

    const securityPolicy = await SecurityPolicy.findOne({ company_id: user.company_id });
    const maxAttempts = securityPolicy?.settings.max_failed_login_attempts || 5;
    
    // is_suspicious = true if we've reached or exceeded the threshold
    const isSuspicious = (recentFailures + 1) >= maxAttempts;

    // Log login failure
    await logSecurityEvent({
      company_id: user.company_id,
      user_id: user._id,
      email: email.toLowerCase(),
      event_type: 'login_failure',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      is_suspicious: isSuspicious,
      metadata: { 
        reason: 'invalid_password',
        failure_count: recentFailures + 1,
        max_attempts: maxAttempts,
      },
    });

    throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
  }

  if (user.lifecycle_state === 'terminated' || user.lifecycle_state === 'archived') {
    throw new AppError('Account is terminated or archived', 403, 'FORBIDDEN');
  }

  // Determine user role (for now, default to employee if not fully implemented in RBAC)
  const userRole: AdminClaim['user_role'] = 'employee';

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

  // Save refresh token hash in DB
  user.refresh_token_hash = refreshTokenHash;
  user.last_login = new Date();
  await user.save();

  // Create RefreshToken record
  await RefreshToken.create({
    user_id: user._id,
    token_hash: refreshTokenHash,
    expires_at: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE),
    ip_address: req.ip,
    user_agent: req.headers['user-agent']
  });

  // Log successful login
  await logSecurityEvent({
    company_id: user.company_id,
    user_id: user._id,
    email: user.email,
    event_type: 'login_success',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    metadata: { lifecycle_state: user.lifecycle_state },
  });

  // Set the refresh cookie
  res.cookie('refreshToken', rawRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_MAX_AGE,
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

  if (user.lifecycle_state === 'terminated' || user.lifecycle_state === 'archived') {
    throw new AppError('Account is terminated or archived', 403, 'FORBIDDEN');
  }

  // Issue new access token
  const accessToken = signAccessToken({
    userId: user._id.toString(),
    email: user.email,
    user_role: 'employee',
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
    metadata: { lifecycle_state: user.lifecycle_state },
  });

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
        metadata: { token_revoked: true },
      });

      // Log token revocation event
      await logSecurityEvent({
        company_id: req.user.company_id,
        user_id: req.user.userId,
        event_type: 'token_revoked',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
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

const SetupPasswordSchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

export const setupPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = SetupPasswordSchema.safeParse(req.body);
  if (!result.success) {
    throw new AppError(result.error.issues[0].message, 400, 'BAD_REQUEST');
  }
  const { email, token, newPassword } = result.data;

  // Find user by email
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password_hash');
  
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  // Verify token (current temporary password)
  const isMatch = await bcrypt.compare(token, user.password_hash);
  if (!isMatch) {
    await logSecurityEvent({
      company_id: user.company_id,
      user_id: user._id,
      email: email.toLowerCase(),
      event_type: 'password_setup_failure',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      is_suspicious: true,
      metadata: { reason: 'invalid_token' },
    });
    throw new AppError('Invalid or expired token', 400, 'INVALID_TOKEN');
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(newPassword, salt);

  // Update user
  const oldState = user.lifecycle_state;
  user.password_hash = password_hash;
  user.lifecycle_state = 'active'; // Transition to active
  user.is_active = true;
  await user.save();

  // Log Security Event
  await logSecurityEvent({
    company_id: user.company_id,
    user_id: user._id,
    email: email.toLowerCase(),
    event_type: 'password_setup_success',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
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
