// server/src/controllers/security.controller.ts
/**
 * Security Controller
 * Handles security policy management, access logs, and session management.
 * Used on: SecurityPage
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { SecurityPolicy } from '../models/SecurityPolicy.model';
import { SecurityEvent } from '../models/SecurityEvent.model';
import { User } from '../models/User.model';
import { RefreshToken } from '../models/RefreshToken.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';

/**
 * GET /api/v1/security/policy
 * Returns the security policy for the current company.
 */
export const getSecurityPolicy = asyncHandler(async (req: Request, res: Response) => {
  const policy = await SecurityPolicy.findOne({
    company_id: req.user.company_id,
  });

  if (!policy) {
    throw new AppError('Security policy not found', 404, 'NOT_FOUND');
  }

  res.status(200).json({ success: true, data: policy });
});

/**
 * PUT /api/v1/security/policy
 * Updates the security policy for the current company.
 */
export const updateSecurityPolicy = asyncHandler(async (req: Request, res: Response) => {
  const UpdateSchema = z.object({
    policy_name: z.string().min(1).optional(),
    description: z.string().optional(),
    is_enabled: z.boolean().optional(),
    settings: z.object({
      max_failed_login_attempts: z.number().min(1).max(20).optional(),
      lockout_duration_minutes: z.number().min(1).optional(),
      session_timeout_minutes: z.number().min(1).optional(),
      require_mfa: z.boolean().optional(),
      password_min_length: z.number().min(4).max(128).optional(),
      password_require_uppercase: z.boolean().optional(),
      password_require_lowercase: z.boolean().optional(),
      password_require_numbers: z.boolean().optional(),
      password_require_special_chars: z.boolean().optional(),
      password_expiry_days: z.number().min(0).optional(),
      ip_whitelist_enabled: z.boolean().optional(),
      ip_whitelist: z.array(z.string()).optional(),
    }).optional(),
  });

  const input = UpdateSchema.parse(req.body);

  const policy = await SecurityPolicy.findOneAndUpdate(
    { company_id: req.user.company_id },
    { $set: input },
    { new: true, runValidators: true },
  );

  if (!policy) {
    throw new AppError('Security policy not found', 404, 'NOT_FOUND');
  }

  // MANDATORY: audit log
  await auditLogger.log({
    req,
    action: 'security_policy.updated',
    module: 'security',
    object_type: 'SecurityPolicy',
    object_id: policy._id.toString(),
    object_label: policy.policy_name,
    before_state: null,
    after_state: policy.toObject(),
  });

  res.status(200).json({ success: true, data: policy });
});

/**
 * GET /api/v1/security/events
 * Returns security events (access log) for the current company.
 * Query params: page, limit, event_type, is_suspicious, email
 */
export const getSecurityEvents = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {
    company_id: req.user.company_id,
  };

  if (req.query.event_type) {
    filter.event_type = req.query.event_type;
  }

  if (req.query.is_suspicious === 'true') {
    filter.is_suspicious = true;
  }

  if (req.query.email) {
    filter.email = (req.query.email as string).toLowerCase();
  }

  const [events, total] = await Promise.all([
    SecurityEvent.find(filter)
      .populate('user_id', 'full_name email')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit),
    SecurityEvent.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * POST /api/v1/security/force-logout/:userId
 * Force logs out a user by invalidating their refresh token.
 * Used by admins to terminate suspicious sessions.
 */
export const forceLogoutUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;

  if (!userId) {
    throw new AppError('User ID is required', 400, 'BAD_REQUEST');
  }

  const user = await User.findOne({
    _id: userId,
    company_id: req.user.company_id,
  });

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  // Invalidate ALL refresh tokens for this user
  await RefreshToken.updateMany(
    { user_id: user._id, is_revoked: false },
    { $set: { is_revoked: true } },
  );

  // Clear refresh_token_hash from User document
  user.refresh_token_hash = undefined;
  await user.save();

  // Log security event
  await SecurityEvent.create({
    company_id: req.user.company_id,
    user_id: user._id,
    email: user.email,
    event_type: 'token_revoked',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    is_suspicious: false,
    metadata: {
      reason: 'force_logout_by_admin',
      revoked_by: req.user.userId,
    },
  });

  // MANDATORY: audit log
  await auditLogger.log({
    req,
    action: 'security.force_logout',
    module: 'security',
    object_type: 'User',
    object_id: user._id.toString(),
    object_label: user.full_name,
    before_state: null,
    after_state: { session_status: 'terminated', refresh_tokens_revoked: true },
  });

  res.status(200).json({
    success: true,
    message: 'User logged out successfully',
    data: { userId: user._id },
  });
});
