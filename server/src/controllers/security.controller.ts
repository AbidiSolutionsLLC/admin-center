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
import { Session } from '../models/Session.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
import { runInTransaction, correlationIdFor } from '../lib/platformEvents';
import { revokeSessionsTx, destroyProviderSession } from '../identity/sessions';

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
      max_concurrent_sessions: z.number().min(1).max(10).optional(),
      require_mfa: z.boolean().optional(),
      terminate_session_on_risk: z.boolean().optional(),
      risk_threshold_for_termination: z.number().min(1).max(100).optional(),
      password_min_length: z.number().min(4).max(128).optional(),
      password_require_uppercase: z.boolean().optional(),
      password_require_lowercase: z.boolean().optional(),
      password_require_numbers: z.boolean().optional(),
      password_require_special_chars: z.boolean().optional(),
      password_expiry_days: z.number().min(0).optional(),
      password_history_count: z.number().min(0).max(24).optional(),
      ip_whitelist_enabled: z.boolean().optional(),
      ip_whitelist: z.array(z.string().trim()).optional(),
      ip_blacklist_enabled: z.boolean().optional(),
      ip_blacklist: z.array(z.string().trim()).optional(),
      alert_settings: z.object({
        notify_on_failed_logins: z.boolean().optional(),
        failed_logins_threshold: z.number().min(1).optional(),
        notify_on_suspicious_login: z.boolean().optional(),
        notify_on_risk_flags: z.boolean().optional(),
        alert_emails: z.array(z.string().trim().email()).optional(),
      }).optional(),
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
      max_concurrent_sessions: z.number().min(1).max(10).optional(),
      require_mfa: z.boolean().optional(),
      terminate_session_on_risk: z.boolean().optional(),
      risk_threshold_for_termination: z.number().min(1).max(100).optional(),
      password_min_length: z.number().min(4).max(128).optional(),
      password_require_uppercase: z.boolean().optional(),
      password_require_lowercase: z.boolean().optional(),
      password_require_numbers: z.boolean().optional(),
      password_require_special_chars: z.boolean().optional(),
      password_expiry_days: z.number().min(0).optional(),
      password_history_count: z.number().min(0).max(24).optional(),
      ip_whitelist_enabled: z.boolean().optional(),
      ip_whitelist: z.array(z.string().trim()).optional(),
      ip_blacklist_enabled: z.boolean().optional(),
      ip_blacklist: z.array(z.string().trim()).optional(),
      alert_settings: z.object({
        notify_on_failed_logins: z.boolean().optional(),
        failed_logins_threshold: z.number().min(1).optional(),
        notify_on_suspicious_login: z.boolean().optional(),
        notify_on_risk_flags: z.boolean().optional(),
        alert_emails: z.array(z.string().trim().email()).optional(),
      }).optional(),
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

  await SecurityPolicy.deleteOne({ _id: policy._id, company_id: policy.company_id });

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

  const actor = { type: 'member' as const, id: req.user.userId };
  const correlationId = correlationIdFor(req);

  // Token + Session revocation, security event, audit and session.revoked events commit atomically (06 §1)
  const revokedSids = await runInTransaction(async (session) => {
    // Invalidate ALL refresh tokens for this user
    await RefreshToken.updateMany(
      { user_id: user._id, is_revoked: false },
      { $set: { is_revoked: true } },
      { session },
    );

    // Clear refresh_token_hash from User document
    user.refresh_token_hash = undefined;
    await user.save({ session });

    const sids = await revokeSessionsTx(session, { member_id: user._id }, 'force_logout', { actor, correlation_id: correlationId });

    // Log security event
    await SecurityEvent.create([{
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
    }], { session });

    // MANDATORY: audit log
    await auditLogger.logTx(session, {
      req,
      action: 'security.force_logout',
      module: 'security',
      object_type: 'User',
      object_id: user._id.toString(),
      object_label: user.full_name,
      before_state: { session_status: 'active' },
      after_state: { session_status: 'terminated', refresh_tokens_revoked: true },
    });
    return sids;
  });

  // After commit: provider-side teardown (admin-change alert fires via logTx onCommit)
  for (const sid of revokedSids) {
    await destroyProviderSession(sid).catch((e) => console.error('[Security] provider session teardown failed', sid, e));
  }

  res.status(200).json({
    success: true,
    message: 'User logged out successfully',
    data: { userId: user._id },
  });
});

/**
 * GET /api/v1/security/sessions
 * Returns the live tenant-realm sessions of the current company (elevation 5.2). A session is live when
 * it is not revoked and neither its idle nor its absolute expiry has passed. The response keeps the shape
 * the client already reads (`ip_address`, `user_agent`, `last_activity_at`, `expires_at`).
 */
export const getActiveSessions = asyncHandler(async (req: Request, res: Response) => {
  const users = await User.find({ company_id: req.user.company_id }).select('_id full_name email role');
  let memberIds = users.map(u => u._id);

  if (req.query.roleFilter === 'admin') {
    const adminRoles = ['Super Admin', 'HR Admin', 'IT Admin', 'Ops Admin', 'Admin'];
    memberIds = users.filter(u => adminRoles.includes(u.role)).map(u => u._id);
  }

  const now = new Date();
  const live = await Session.find({
    company_id: req.user.company_id,
    realm: 'tenant',
    member_id: { $in: memberIds },
    revoked_at: { $exists: false },
    idle_expires_at: { $gt: now },
    absolute_expires_at: { $gt: now },
  }).sort({ last_seen_at: -1 });

  const byId = new Map(users.map(u => [u._id.toString(), u]));
  const sessions = live.map(sess => {
    const user = byId.get(sess.member_id.toString());
    return {
      _id: sess._id,
      user: user ? { _id: user._id, full_name: user.full_name, email: user.email, role: user.role } : null,
      ip_address: sess.ip,
      user_agent: sess.user_agent,
      created_at: sess.created_at,
      last_activity_at: sess.last_seen_at,
      expires_at: sess.idle_expires_at < sess.absolute_expires_at ? sess.idle_expires_at : sess.absolute_expires_at,
    };
  });

  res.status(200).json({ success: true, data: sessions });
});

/**
 * DELETE /api/v1/security/sessions/:tokenId
 * Terminates one live session of this company (`:tokenId` is the session id, the `sid`). Revocation, security event,
 * audit and `session.revoked` commit together; provider-side teardown follows the commit (same pattern as force-logout).
 */
export const terminateSession = asyncHandler(async (req: Request, res: Response) => {
  const { tokenId } = req.params;

  const target = await Session.findOne({
    _id: tokenId,
    company_id: req.user.company_id,
    realm: 'tenant',
    revoked_at: { $exists: false },
  });
  if (!target) {
    throw new AppError('Session not found', 404, 'NOT_FOUND');
  }
  const user = await User.findOne({ _id: target.member_id, company_id: req.user.company_id });
  if (!user) {
    throw new AppError('Session not found', 404, 'NOT_FOUND');
  }

  const actor = { type: 'member' as const, id: req.user.userId };
  const correlationId = correlationIdFor(req);

  const revoked = await runInTransaction(async (session) => {
    const sids = await revokeSessionsTx(
      session,
      { _id: target._id, company_id: req.user.company_id },
      'admin_terminated',
      { actor, correlation_id: correlationId },
    );
    if (sids.length === 0) return sids;

    await SecurityEvent.create([{
      company_id: req.user.company_id,
      user_id: user._id,
      email: user.email,
      event_type: 'token_revoked',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      is_suspicious: false,
      metadata: {
        reason: 'manual_termination_by_admin',
        revoked_by: req.user.userId,
        session_id: target._id,
      },
    }], { session });

    await auditLogger.logTx(session, {
      req,
      action: 'security.session_terminated',
      module: 'security',
      object_type: 'User',
      object_id: user._id.toString(),
      object_label: user.full_name,
      before_state: { session_status: 'active', session_id: target._id },
      after_state: { session_status: 'terminated', session_id: target._id },
    });
    return sids;
  });

  // Already revoked by someone else between the lookup and the transaction
  if (revoked.length === 0) {
    throw new AppError('Session not found', 404, 'NOT_FOUND');
  }

  for (const sid of revoked) {
    await destroyProviderSession(sid).catch((e) => console.error('[Security] provider session teardown failed', sid, e));
  }

  res.status(200).json({ success: true, message: 'Session terminated successfully' });
});
