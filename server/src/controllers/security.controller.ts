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
 * GET /api/v1/security/policies
 * Returns all security policies for the current company.
 */
export const getSecurityPolicies = asyncHandler(async (req: Request, res: Response) => {
  const policies = await SecurityPolicy.find({
    company_id: req.user.company_id,
  }).sort({ created_at: -1 });

  // If no policies exist, create a default "All Users" policy
  if (policies.length === 0) {
    const defaultPolicy = await SecurityPolicy.create({
      company_id: req.user.company_id,
      policy_name: 'Default Security Policy',
      description: 'Default security policy with standard protection settings',
      is_enabled: true,
      target_type: 'all',
      target_id: 'all',
      target_label: 'All Users',
      settings: {}, // Mongoose defaults will fill this
    });
    return res.status(200).json({ success: true, data: [defaultPolicy] });
  }

  res.status(200).json({ success: true, data: policies });
});

/**
 * POST /api/v1/security/policies
 * Creates a new security policy.
 */
export const createSecurityPolicy = asyncHandler(async (req: Request, res: Response) => {
  const CreateSchema = z.object({
    policy_name: z.string().trim().min(1, 'Policy name is required'),
    description: z.string().trim().optional(),
    is_enabled: z.boolean().optional(),
    target_type: z.enum(['all', 'role', 'department', 'group', 'user']),
    target_id: z.string().trim(),
    target_label: z.string().trim(),
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
      ip_whitelist: z.array(z.string().trim()).optional(),
    }).optional(),
  });

  const input = CreateSchema.parse(req.body);

  const existing = await SecurityPolicy.findOne({
    policy_name: { $regex: `^${input.policy_name}$`, $options: 'i' },
    company_id: req.user.company_id,
  });

  if (existing) {
    throw new AppError('A policy with this name already exists', 400, 'DUPLICATE_RESOURCE');
  }

  const policy = await SecurityPolicy.create({
    ...input,
    company_id: req.user.company_id,
  });

  await auditLogger.log({
    req,
    action: 'security_policy.created',
    module: 'security',
    object_type: 'SecurityPolicy',
    object_id: policy._id.toString(),
    object_label: policy.policy_name,
    before_state: null,
    after_state: policy.toObject(),
  });

  res.status(201).json({ success: true, data: policy });
});

/**
 * PUT /api/v1/security/policies/:id
 * Updates a specific security policy.
 */
export const updateSecurityPolicy = asyncHandler(async (req: Request, res: Response) => {
  const UpdateSchema = z.object({
    policy_name: z.string().trim().min(1, 'Policy name is required').optional(),
    description: z.string().trim().optional(),
    is_enabled: z.boolean().optional(),
    target_type: z.enum(['all', 'role', 'department', 'group', 'user']).optional(),
    target_id: z.string().trim().optional(),
    target_label: z.string().trim().optional(),
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
      ip_whitelist: z.array(z.string().trim()).optional(),
    }).optional(),
  });

  const input = UpdateSchema.parse(req.body);

  const existingPolicy = await SecurityPolicy.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!existingPolicy) {
    throw new AppError('Policy not found', 404, 'NOT_FOUND');
  }

  if (input.policy_name && input.policy_name !== existingPolicy.policy_name) {
    const duplicate = await SecurityPolicy.findOne({
      policy_name: { $regex: `^${input.policy_name}$`, $options: 'i' },
      company_id: req.user.company_id,
    });
    if (duplicate) {
      throw new AppError('A policy with this name already exists', 400, 'DUPLICATE_RESOURCE');
    }
  }

  const before_state = existingPolicy.toObject();

  Object.assign(existingPolicy, input);
  const updatedPolicy = await existingPolicy.save();

  // MANDATORY: audit log
  await auditLogger.log({
    req,
    action: 'security_policy.updated',
    module: 'security',
    object_type: 'SecurityPolicy',
    object_id: updatedPolicy._id.toString(),
    object_label: updatedPolicy.policy_name,
    before_state,
    after_state: updatedPolicy.toObject(),
  });

  res.status(200).json({ success: true, data: updatedPolicy });
});

/**
 * DELETE /api/v1/security/policies/:id
 * Deletes a security policy.
 */
export const deleteSecurityPolicy = asyncHandler(async (req: Request, res: Response) => {
  const policy = await SecurityPolicy.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!policy) {
    throw new AppError('Policy not found', 404, 'NOT_FOUND');
  }

  if (policy.target_type === 'all') {
    throw new AppError('Cannot delete the default global policy', 400, 'BAD_REQUEST');
  }

  await SecurityPolicy.deleteOne({ _id: policy._id });

  await auditLogger.log({
    req,
    action: 'security_policy.deleted',
    module: 'security',
    object_type: 'SecurityPolicy',
    object_id: policy._id.toString(),
    object_label: policy.policy_name,
    before_state: policy.toObject(),
    after_state: null,
  });

  res.status(200).json({ success: true, message: 'Policy deleted' });
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
