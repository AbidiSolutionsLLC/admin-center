// server/src/controllers/people.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { asyncHandler } from '../utils/asyncHandler';
import { User, EmploymentType } from '../models/User.model';
import { Company } from '../models/Company.model';
import { RefreshToken } from '../models/RefreshToken.model';
import { Role } from '../models/Role.model';
import { UserRole } from '../models/UserRole.model';
import { TeamMember } from '../models/TeamMember.model';
import { auditLogger } from '../lib/auditLogger';
import { sendWelcomeEmail, sendBulkWelcomeEmails, sendEmail } from '../lib/emailService';
import { isValidTransition, getTransitionErrorMessage, LifecycleState } from '../lib/lifecycle';
import { AppError } from '../utils/AppError';
import { Types } from 'mongoose';
import { Department } from '../models/Department.model';
import { Location } from '../models/Location.model';
import { Team } from '../models/Team.model';
import { handleLifecycleEvent } from '../lib/workflowEngine';
import { deliverNotification } from '../lib/notificationEngine';
import { PERMISSION_GROUPS } from '../constants/roles';
import { NotificationTemplate } from '../models/NotificationTemplate.model';

// ── Types & Interfaces ───────────────────────────────────────────────────────

interface UserFilter {
  company_id: string | Types.ObjectId;
  _id?: string | Types.ObjectId | { $in: (string | Types.ObjectId)[] } | { $ne: string | Types.ObjectId };
  email?: string;
  lifecycle_state?: LifecycleState | { $in: LifecycleState[] };
  department_id?: string | Types.ObjectId | null;
  team_id?: string | Types.ObjectId | null;
  manager_id?: string | Types.ObjectId | null;
  employment_type?: EmploymentType;
  is_active?: boolean;
  $or?: Array<Record<string, unknown>>;
}

const getRouteId = (param: string | string[]): string =>
  Array.isArray(param) ? param[0] : param;

import crypto from 'crypto';
import { InviteToken } from '../models/InviteToken.model';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const InviteUserSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(100),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional().nullable(),
  department_id: z.string().optional().nullable(),
  team_id: z.string().optional().nullable(),
  manager_id: z.string().optional().nullable(),
  role: z.enum(['Super Admin', 'Admin', 'HR', 'Manager', 'Employee', 'Technician']).optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contractor', 'intern']).optional(),
  hire_date: z.string().optional().nullable(),
  location_id: z.string().optional().nullable(),
  custom_fields: z.record(z.string(), z.any()).optional(),
});

const UpdateUserSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  phone: z.string().optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
  department_id: z.string().optional().nullable(),
  team_id: z.string().optional().nullable(),
  manager_id: z.string().optional().nullable(),
  role: z.enum(['Super Admin', 'Admin', 'HR', 'Manager', 'Employee', 'Technician']).optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contractor', 'intern']).optional(),
  hire_date: z.string().optional().nullable(),
  termination_date: z.string().optional().nullable(),
  location_id: z.string().optional().nullable(),
  custom_fields: z.record(z.string(), z.any()).optional(),
});

const UpdateLifecycleSchema = z.object({
  lifecycle_state: z.enum(['invited', 'onboarding', 'active', 'probation', 'on_leave', 'terminated', 'archived']),
});

const BulkInviteRowSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(100),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  department_id: z.string().optional(),
  team_id: z.string().optional(),
  manager_id: z.string().optional(),
  role: z.enum(['Super Admin', 'Admin', 'HR', 'Manager', 'Employee', 'Technician']).optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contractor', 'intern']).optional(),
  hire_date: z.string().optional(),
  location_id: z.string().optional(),
  custom_fields: z.record(z.string(), z.any()).optional(),
});

const BulkInviteSchema = z.object({
  users: z.array(BulkInviteRowSchema).min(1, 'At least one user is required').max(500, 'Maximum 500 users per bulk invite'),
});

// ── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Generates a temporary password for new users
 */
const generateTemporaryPassword = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

async function enrichUsers(
  users: ReturnType<(typeof User.prototype.toObject)>[],
  companyId: string
): Promise<any[]> {
  const userIds = users.map(u => u._id);

  // Fetch all team memberships for these users in one query
  const memberships = await TeamMember.find({
    company_id: companyId,
    user_id: { $in: userIds }
  }).populate('team_id', 'name slug').lean();

  // Fetch all role assignments for these users in one query
  const roleAssignments = await UserRole.find({
    user_id: { $in: userIds }
  }).populate('role_id', 'name type').lean();

  // Group memberships by user_id
  const membershipMap = new Map<string, any[]>();
  memberships.forEach(m => {
    const userId = m.user_id.toString();
    if (!membershipMap.has(userId)) {
      membershipMap.set(userId, []);
    }
    membershipMap.get(userId)!.push(m.team_id);
  });

  // Group role assignments by user_id
  const roleMap = new Map<string, any[]>();
  roleAssignments.forEach(ra => {
    const userId = ra.user_id.toString();
    if (!roleMap.has(userId)) {
      roleMap.set(userId, []);
    }
    roleMap.get(userId)!.push(ra.role_id);
  });

  return users.map((user) => {
    const data = { ...user };
    const userId = user._id.toString();

    // Attach teams
    data.teams = membershipMap.get(userId) || [];

    // Attach roles (plural, expected by frontend)
    data.roles = roleMap.get(userId) || [];

    // Map populated objects to the names expected by the frontend
    if (data.department_id && typeof data.department_id === 'object') {
      data.department = data.department_id;
    }
    if (data.team_id && typeof data.team_id === 'object') {
      data.team = data.team_id;
    }
    if (data.location_id && typeof data.location_id === 'object') {
      data.location = data.location_id;
    }
    if (data.manager_id && typeof data.manager_id === 'object') {
      data.manager = data.manager_id;
    }
    return data;
  });
}

async function runLifecycleAutomations(
  user: any,
  currentState: LifecycleState,
  targetState: LifecycleState,
  req: Request,
): Promise<void> {
  const transitionKey = `${currentState}_to_${targetState}`;
  const company = await Company.findById(req.user.company_id);

  if (!company) {
    return;
  }

  const originalUserEmail = user.email;
  const originalUserFullName = user.full_name;
  const originalUserFirstName = originalUserFullName.split(' ')[0];

  // 1. Target-Specific Side Effects (Revocation, Anonymization, etc.)
  if (targetState === 'terminated') {
    user.refresh_token_hash = undefined;
    user.is_active = false;
    await user.save();

    await RefreshToken.updateMany(
      { user_id: user._id, is_revoked: false },
      { $set: { is_revoked: true } }
    );

    await auditLogger.log({
      req,
      action: 'user.lifecycle_automation',
      module: 'people',
      object_type: 'User',
      object_id: user._id.toString(),
      object_label: user.full_name,
      before_state: { transition: transitionKey },
      after_state: { automation: 'sessions_revoked', refresh_tokens_invalidated: true },
    });
  }

  if (targetState === 'archived') {
    user.full_name = 'Archived User';
    user.email = `archived-${user._id}@archived.local`;
    user.phone = undefined;
    user.avatar_url = undefined;
    user.employee_id = `ARCHIVED-${user._id.toString().slice(-8)}`;
    user.is_active = false;
    (user as any).department_id = undefined;
    (user as any).team_id = undefined;
    (user as any).manager_id = undefined;
    (user as any).location_id = undefined;
    (user as any).hire_date = undefined;
    (user as any).termination_date = undefined;
    (user as any).custom_fields = {};

    await user.save();

    await auditLogger.log({
      req,
      action: 'user.lifecycle_automation',
      module: 'people',
      object_type: 'User',
      object_id: user._id.toString(),
      object_label: user.full_name,
      before_state: { transition: transitionKey },
      after_state: { automation: 'pii_anonymized' },
    });
  }

  // 2. Transition-Specific Automations (Invite Link, etc.)
  if (transitionKey === 'invited_to_onboarding') {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await InviteToken.create({
      user_id: user._id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });

    await sendWelcomeEmail({
      email: user.email,
      full_name: user.full_name,
      employee_id: user.employee_id,
      company_name: company.name,
      invite_link: `${process.env.CLIENT_URL}/onboarding?token=${rawToken}&email=${encodeURIComponent(user.email)}`,
    });

    await auditLogger.log({
      req,
      action: 'user.lifecycle_automation',
      module: 'people',
      object_type: 'User',
      object_id: user._id.toString(),
      object_label: user.full_name,
      before_state: { transition: transitionKey },
      after_state: { automation: 'welcome_email_sent', email: user.email },
    });
  }

  // 3. Smooth Notifications: Send mail and notification to user, manager, and admins for ALL transitions
  const notificationPayload = {
    companyId: req.user.company_id,
    templateKey: `lifecycle_${targetState}`, // e.g., lifecycle_active, lifecycle_probation
    user_id: user._id.toString(),
    user_name: originalUserFirstName,
    user_full_name: originalUserFullName,
    user_email: originalUserEmail,
    company_name: company.name,
    detail: `Status changed from ${currentState} to ${targetState}.`,
    triggered_by_event: 'user.lifecycle_changed',
    triggered_by_object_type: 'User',
    triggered_by_object_id: user._id.toString(),
    forceEmail: true,
  };

  const sendLifecycleEmailFallback = async (recipient: {
    email: string;
    full_name: string;
    detail: string;
    subject: string;
  }) => {
    const html = `<p>Hi ${recipient.full_name},</p><p>${recipient.detail}</p><p>Regards,<br/>${company.name}</p>`;
    const text = `Hi ${recipient.full_name},\n\n${recipient.detail}\n\nRegards,\n${company.name}`;

    try {
      await sendEmail({
        to: recipient.email,
        subject: recipient.subject,
        html,
        text,
      });
    } catch (error) {
      console.warn(`[Lifecycle Email Fallback] Failed to send email to ${recipient.email}:`, error instanceof Error ? error.message : 'Unknown');
    }
  };

  const sendLifecycleNotification = async (payload: {
    templateKey: string;
    user_id: string;
    user_name: string;
    user_full_name: string;
    user_email: string;
    detail: string;
    emailSubject: string;
  }) => {
    const results = await deliverNotification({
      ...notificationPayload,
      ...payload,
      forceEmail: true,
    }).catch(err => {
      console.warn(`[Lifecycle Automation] Notification failed for ${payload.user_id}:`, err instanceof Error ? err.message : 'Unknown');
      return [] as any[];
    });

    const emailSent = Array.isArray(results) && results.some(r => r.channel === 'email' && r.status === 'sent');
    if (!emailSent) {
      await sendLifecycleEmailFallback({
        email: payload.user_email,
        full_name: payload.user_full_name,
        detail: payload.detail,
        subject: payload.emailSubject,
      });
    }
  };

  // Notify the user
  await sendLifecycleNotification({
    templateKey: notificationPayload.templateKey,
    user_id: notificationPayload.user_id,
    user_name: notificationPayload.user_name,
    user_full_name: notificationPayload.user_full_name,
    user_email: notificationPayload.user_email,
    detail: notificationPayload.detail,
    emailSubject: `${company.name}: Lifecycle update for ${originalUserFullName}`,
  });

  // Notify the manager
  if (user.manager_id) {
    const manager = await User.findById(user.manager_id);
    if (manager) {
      await sendLifecycleNotification({
        templateKey: 'manager_lifecycle_alert',
        user_id: manager._id.toString(),
        user_name: manager.full_name.split(' ')[0],
        user_full_name: manager.full_name,
        user_email: manager.email,
        detail: `Team member ${originalUserFullName} transitioned from ${currentState} to ${targetState}.`,
        emailSubject: `${company.name}: ${originalUserFullName} lifecycle changed`,
      });
    }
  }

  // Notify people admins
  const adminTemplate = await NotificationTemplate.findOne({
    company_id: req.user.company_id,
    key: 'admin_lifecycle_alert',
    is_active: true,
  });
  const adminTemplateKey = adminTemplate ? 'admin_lifecycle_alert' : notificationPayload.templateKey;

  const adminRecipients = await User.find({
    company_id: req.user.company_id,
    role: { $in: PERMISSION_GROUPS.PEOPLE_ADMINS },
    is_active: true,
    email: { $exists: true, $ne: '' },
  });

  const excludedIds = new Set<string>([
    user._id.toString(),
    user.manager_id?.toString(),
  ].filter(Boolean) as string[]);

  for (const admin of adminRecipients) {
    if (excludedIds.has(admin._id.toString())) {
      continue;
    }

    await sendLifecycleNotification({
      templateKey: adminTemplateKey,
      user_id: admin._id.toString(),
      user_name: admin.full_name.split(' ')[0],
      user_full_name: admin.full_name,
      user_email: admin.email,
      detail: `User ${originalUserFullName} transitioned from ${currentState} to ${targetState}.`,
      emailSubject: `${company.name}: ${originalUserFullName} lifecycle transitioned`,
    });
  }
}

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /people
 * Returns all users for the requesting company with optional filters.
 * Supports filtering by lifecycle_state, department_id, employment_type.
 */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { lifecycle_state, department_id, employment_type, search } = req.query;

  // Build filter query
  const filter: UserFilter = {
    company_id: req.user.company_id,
  };

  // ── Input Sanitization ─────────────────────────────────────────────────────

  if (lifecycle_state) {
    // Validate lifecycle_state is a valid value
    const VALID_LIFECYCLE_STATES: LifecycleState[] = ['invited', 'onboarding', 'active', 'probation', 'on_leave', 'terminated', 'archived'];
    if (VALID_LIFECYCLE_STATES.includes(lifecycle_state as LifecycleState)) {
      filter.lifecycle_state = lifecycle_state as LifecycleState;
    }
  }

  if (department_id) {
    filter.department_id = String(department_id);
  }

  if (employment_type) {
    const VALID_EMPLOYMENT_TYPES: EmploymentType[] = ['full_time', 'part_time', 'contractor', 'intern'];
    if (VALID_EMPLOYMENT_TYPES.includes(employment_type as EmploymentType)) {
      filter.employment_type = employment_type as EmploymentType;
    }
  }

  // Search by name, email, or employee_id with regex sanitization
  if (search && typeof search === 'string') {
    const sanitizedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex specials
    filter.$or = [
      { full_name: { $regex: sanitizedSearch, $options: 'i' } },
      { email: { $regex: sanitizedSearch, $options: 'i' } },
      { employee_id: { $regex: sanitizedSearch, $options: 'i' } },
    ];
  }

  const users = await User.find(filter)
    .select('-password_hash -refresh_token_hash')
    .populate('department_id', 'name slug')
    .populate('team_id', 'name slug')
    .populate('manager_id', 'full_name email avatar_url')
    .populate('location_id', 'name timezone')
    .sort({ created_at: -1 })
    .lean();

  const enriched = await enrichUsers(users, req.user.company_id);
  res.status(200).json({ success: true, data: enriched });
});

/**
 * GET /people/:id
 * Returns a single user by ID, scoped to the company.
 */
export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const filter: UserFilter = {
    _id: getRouteId(req.params.id),
    company_id: req.user.company_id,
  };

  const user = await User.findOne(filter)
    .select('-password_hash -refresh_token_hash')
    .populate('department_id', 'name slug')
    .populate('team_id', 'name slug')
    .populate('manager_id', 'full_name email avatar_url')
    .populate('location_id', 'name timezone');

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const [enriched] = await enrichUsers([user.toObject()], req.user.company_id);
  res.status(200).json({ success: true, data: enriched });
});

/**
 * POST /people/invite
 * Invites a new user to the company.
 * - Generates employee_id automatically via User model hook
 * - Creates user with 'invited' lifecycle state
 * - Sends welcome email via emailService
 * - Produces audit event
 */
export const inviteUser = asyncHandler(async (req: Request, res: Response) => {
  const input = InviteUserSchema.parse(req.body);

  // ── Validation ─────────────────────────────────────────────────────────────

  // 1. Check if user with this email already exists
  const existingUser = await User.findOne({
    company_id: req.user.company_id,
    email: input.email,
  });

  if (existingUser) {
    throw new AppError('User with this email already exists', 400, 'DUPLICATE_EMAIL');
  }

  // 2. Validate department (if provided)
  if (input.department_id) {
    const dept = await Department.findOne({
      _id: input.department_id,
      company_id: req.user.company_id,
      is_active: true,
    });
    if (!dept) throw new AppError('Department not found or inactive', 404, 'NOT_FOUND');
  }

  // 3. Validate team (if provided)
  if (input.team_id) {
    const team = await Team.findOne({
      _id: input.team_id,
      company_id: req.user.company_id,
      is_active: true,
    });
    if (!team) throw new AppError('Team not found or inactive', 404, 'NOT_FOUND');
  }

  // 4. Validate manager (if provided)
  if (input.manager_id) {
    const manager = await User.findOne({
      _id: input.manager_id,
      company_id: req.user.company_id,
      is_active: true,
    });
    if (!manager) throw new AppError('Manager not found or inactive', 404, 'NOT_FOUND');
  }

  // 5. Validate location (if provided)
  if (input.location_id) {
    const loc = await Location.findOne({
      _id: input.location_id,
      company_id: req.user.company_id,
      is_active: true,
    });
    if (!loc) throw new AppError('Location not found or inactive', 404, 'NOT_FOUND');
  }

  // Get company info for email
  const company = await Company.findById(req.user.company_id);
  if (!company) {
    throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');
  }

  // Generate temporary password
  const tempPassword = generateTemporaryPassword();
  const password_hash = await bcrypt.hash(tempPassword, 10);

  // Create user (employee_id will be auto-generated by pre-save hook)
  const user = await User.create({
    ...input,
    company_id: req.user.company_id as any, // Needed due to Mongoose Types.ObjectId vs string mismatch
    password_hash,
    role: input.role || 'Employee', // Default to 'Employee' if not provided
    lifecycle_state: 'invited',
    is_active: false, // User is not active until they complete onboarding
    phone: input.phone ?? undefined,
    // Normalize empty strings → undefined
    department_id: input.department_id || undefined,
    team_id: input.team_id || undefined,
    manager_id: input.manager_id || undefined,
    location_id: input.location_id || undefined,
    hire_date: input.hire_date ? new Date(input.hire_date) : undefined,
  });

  // Generate secure invite token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  await InviteToken.create({
    user_id: user._id,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72 hours
  });

  // Send welcome email
  try {
    await sendWelcomeEmail({
      email: user.email,
      full_name: user.full_name,
      employee_id: user.employee_id,
      company_name: company.name,
      invite_link: `${process.env.CLIENT_URL}/onboarding?token=${rawToken}&email=${encodeURIComponent(user.email)}`,
    });
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    // Don't fail the invite if email fails, just log it
  }

  // Audit log
  await auditLogger.log({
    req,
    action: 'user.invited',
    module: 'people',
    object_type: 'User',
    object_id: user._id.toString(),
    object_label: user.full_name,
    before_state: null,
    after_state: user.toObject(),
  });

  // Return enriched user without sensitive fields
  const [enriched] = await enrichUsers([user.toObject()], req.user.company_id);
  const { password_hash: _ph, refresh_token_hash: _rth, ...safeUser } = enriched;

  res.status(201).json({ success: true, data: safeUser });
});

/**
 * PUT /people/:id
 * Updates an existing user's profile information.
 * Does NOT change lifecycle_state (use PUT /people/:id/lifecycle for that).
 */
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateUserSchema.parse(req.body);

  const filter: UserFilter = {
    _id: getRouteId(req.params.id),
    company_id: req.user.company_id,
  };

  const user = await User.findOne(filter);

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  // 1. Validate department (if changed)
  if (input.department_id) {
    const dept = await Department.findOne({
      _id: input.department_id,
      company_id: req.user.company_id,
      is_active: true,
    });
    if (!dept) throw new AppError('Department not found or inactive', 404, 'NOT_FOUND');
  }

  // 2. Validate team (if changed)
  if (input.team_id) {
    const team = await Team.findOne({
      _id: input.team_id,
      company_id: req.user.company_id,
      is_active: true,
    });
    if (!team) throw new AppError('Team not found or inactive', 404, 'NOT_FOUND');
  }

  // 3. Validate manager (if changed)
  if (input.manager_id) {
    const manager = await User.findOne({
      _id: input.manager_id,
      company_id: req.user.company_id,
      is_active: true,
    });
    if (!manager) throw new AppError('Manager not found or inactive', 404, 'NOT_FOUND');
  }

  // 4. Validate location (if changed)
  if (input.location_id) {
    const loc = await Location.findOne({
      _id: input.location_id,
      company_id: req.user.company_id,
      is_active: true,
    });
    if (!loc) throw new AppError('Location not found or inactive', 404, 'NOT_FOUND');
  }

  const beforeState = user.toObject();

  // Normalize empty strings → null
  const updates: Record<string, unknown> = { ...input };
  if (updates.department_id === '') updates.department_id = null;
  if (updates.team_id === '') updates.team_id = null;
  if (updates.manager_id === '') updates.manager_id = null;
  if (updates.location_id === '') updates.location_id = null;
  if (updates.hire_date === '') updates.hire_date = null;
  if (updates.termination_date === '') updates.termination_date = null;
  if (updates.avatar_url === '') updates.avatar_url = null;
  if (updates.phone === '') updates.phone = null;
  if (updates.role === '') updates.role = null;

  // Convert date strings to Date objects
  if (updates.hire_date && typeof updates.hire_date === 'string') {
    updates.hire_date = new Date(updates.hire_date);
  }
  if (updates.termination_date && typeof updates.termination_date === 'string') {
    updates.termination_date = new Date(updates.termination_date);
  }

  Object.assign(user, updates);
  await user.save();

  // Audit log — location change fires a dedicated event
  if (updates.location_id && updates.location_id !== beforeState.location_id) {
    await auditLogger.log({
      req,
      action: 'user.location_assigned',
      module: 'people',
      object_type: 'User',
      object_id: user._id.toString(),
      object_label: user.full_name,
      before_state: { location_id: beforeState.location_id?.toString() ?? null },
      after_state: { location_id: updates.location_id },
    });
  }

  // Audit log
  await auditLogger.log({
    req,
    action: 'user.updated',
    module: 'people',
    object_type: 'User',
    object_id: user._id.toString(),
    object_label: user.full_name,
    before_state: beforeState,
    after_state: user.toObject(),
  });

  // Return enriched user without sensitive fields
  const [enriched] = await enrichUsers([user.toObject()], req.user.company_id);
  const { password_hash: _ph, refresh_token_hash: _rth, ...safeUser } = enriched;

  res.status(200).json({ success: true, data: safeUser });
});

/**
 * PUT /people/:id/lifecycle
 * Transitions a user to a new lifecycle state.
 * Validates transition against VALID_TRANSITIONS.
 * Automatically updates lifecycle_changed_at via model hook.
 * Fires automation handlers for specific transitions.
 * Produces audit events for all state changes and automations.
 */
export const updateUserLifecycle = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateLifecycleSchema.parse(req.body);

  const filter: UserFilter = {
    _id: getRouteId(req.params.id),
    company_id: req.user.company_id,
  };

  const user = await User.findOne(filter);

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const currentState = user.lifecycle_state as LifecycleState;
  const targetState = input.lifecycle_state as LifecycleState;

  // Validate transition against VALID_TRANSITIONS
  if (!isValidTransition(currentState, targetState)) {
    throw new AppError(
      getTransitionErrorMessage(currentState, targetState),
      400,
      'INVALID_LIFECYCLE_TRANSITION'
    );
  }

  const beforeState = user.toObject();

  // Update lifecycle state (lifecycle_changed_at will be auto-updated by pre-save hook)
  user.lifecycle_state = targetState;

  // Handle specific transitions
  if (targetState === 'active') {
    user.is_active = true;
  }

  if (targetState === 'terminated' && !user.termination_date) {
    user.termination_date = new Date();
  }

  if (targetState === 'archived') {
    user.is_active = false;
  }

  await user.save();

  // ── Lifecycle Automations ─────────────────────────────────────────────
  // Each automation fires an audit event and performs its specific action
  try {
    await runLifecycleAutomations(user, currentState, targetState, req);
  } catch (automationError) {
    const transitionKey = `${currentState}_to_${targetState}`;
    console.error(`[Lifecycle Automation Error] ${transitionKey}:`, automationError);

    await auditLogger.log({
      req,
      action: 'user.lifecycle_automation_error',
      module: 'people',
      object_type: 'User',
      object_id: user._id.toString(),
      object_label: user.full_name,
      before_state: { transition: `${currentState}_to_${targetState}` },
      after_state: { error: automationError instanceof Error ? automationError.message : 'Unknown error' },
    });
  }

  // MANDATORY: Main audit log for lifecycle change
  await auditLogger.log({
    req,
    action: 'user.lifecycle_changed',
    module: 'people',
    object_type: 'User',
    object_id: user._id.toString(),
    object_label: user.full_name,
    before_state: beforeState,
    after_state: user.toObject(),
  });

  // ── Workflow Engine: Fire lifecycle event to matching workflows ─────────
  // Fire-and-forget: workflows execute asynchronously, don't block the response
  handleLifecycleEvent({
    companyId: req.user.company_id,
    userId: user._id.toString(),
    userName: user.full_name,
    userEmail: user.email,
    lifecycleFrom: currentState,
    lifecycleTo: targetState,
  }).catch((workflowError) => {
    console.error('[Workflow Engine Error]', workflowError);
    // Don't fail the lifecycle transition if workflow execution fails
  });

  // Return enriched user without sensitive fields
  const [enriched] = await enrichUsers([user.toObject()], req.user.company_id);
  const { password_hash: _ph, refresh_token_hash: _rth, ...safeUser } = enriched;

  res.status(200).json({ success: true, data: safeUser });
});

/**
 * POST /people/bulk-invite
 * Bulk invites up to 500 users.
 * Validates each row, returns per-row success/error status.
 * Sends welcome emails in bulk.
 */
export const bulkInviteUsers = asyncHandler(async (req: Request, res: Response) => {
  const input = BulkInviteSchema.parse(req.body);

  // Get company info for emails
  const company = await Company.findById(req.user.company_id);
  if (!company) {
    throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');
  }

  const results: Array<{
    row: number;
    email: string;
    success: boolean;
    employee_id?: string;
    error?: string;
  }> = [];

  const createdUsers: Array<{ email: string; full_name: string; employee_id: string; token: string }> = [];

  // Process each user
  for (let i = 0; i < input.users.length; i++) {
    const row = input.users[i];
    const rowNumber = i + 1;

    try {
      // Validate row
      const validatedRow = BulkInviteRowSchema.parse(row);

      // Check for duplicate email in this company
      const existingUser = await User.findOne({
        company_id: req.user.company_id,
        email: validatedRow.email,
      });

      if (existingUser) {
        results.push({
          row: rowNumber,
          email: validatedRow.email,
          success: false,
          error: 'User with this email already exists',
        });
        continue;
      }

      // Generate temporary password
      const tempPassword = generateTemporaryPassword();
      const password_hash = await bcrypt.hash(tempPassword, 10);

      // Create user
      const user = await User.create({
        ...validatedRow,
        company_id: req.user.company_id as any,
        password_hash,
        role: validatedRow.role || 'Employee', // Default to 'Employee' if not provided
        lifecycle_state: 'invited',
        is_active: false,
        department_id: validatedRow.department_id || undefined,
        team_id: validatedRow.team_id || undefined,
        manager_id: validatedRow.manager_id || undefined,
        location_id: validatedRow.location_id || undefined,
        hire_date: validatedRow.hire_date ? new Date(validatedRow.hire_date) : undefined,
      });

      // Track created user for email sending
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await InviteToken.create({
        user_id: user._id,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72 hours
      });

      createdUsers.push({
        email: user.email,
        full_name: user.full_name,
        employee_id: user.employee_id,
        token: rawToken,
      });

      // Audit log
      await auditLogger.log({
        req,
        action: 'user.bulk_invited',
        module: 'people',
        object_type: 'User',
        object_id: user._id.toString(),
        object_label: user.full_name,
        before_state: null,
        after_state: user.toObject(),
      });

      results.push({
        row: rowNumber,
        email: validatedRow.email,
        success: true,
        employee_id: user.employee_id,
      });
    } catch (error) {
      results.push({
        row: rowNumber,
        email: row.email,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Send welcome emails in bulk
  if (createdUsers.length > 0) {
    try {
      const emailResults = await sendBulkWelcomeEmails(
        createdUsers.map(u => ({
          email: u.email,
          full_name: u.full_name,
          employee_id: u.employee_id,
          company_name: company.name,
          invite_link: `${process.env.CLIENT_URL}/onboarding?token=${(u as any).token}&email=${encodeURIComponent(u.email)}`,
        }))
      );

      // Log email failures
      emailResults.forEach(result => {
        if (!result.success) {
          console.error(`Failed to send welcome email to ${result.email}:`, result.error);
        }
      });
    } catch (error) {
      console.error('Bulk email sending failed:', error);
      // Don't fail the entire operation if emails fail
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  res.status(200).json({
    success: true,
    data: {
      total: input.users.length,
      successful: successCount,
      failed: failureCount,
      results,
    },
  });
});

/**
 * DELETE /people/:id
 * Soft-deletes (archives) a user by transitioning to 'archived' state.
 * This is a convenience endpoint that validates the lifecycle transition.
 */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const filter: UserFilter = {
    _id: getRouteId(req.params.id),
    company_id: req.user.company_id,
  };

  const user = await User.findOne(filter);

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  // ── Cascading Validation ───────────────────────────────────────────────────

  // 1. Check if user is a primary manager of any active department
  const manageDept = await Department.findOne({
    company_id: req.user.company_id,
    primary_manager_id: user._id,
    is_active: true,
  });

  if (manageDept) {
    throw new AppError(
      `Cannot archive user "${user.full_name}" — they are the primary manager of department "${manageDept.name}". Reassign the department manager before archiving.`,
      409,
      'USER_IS_DEPARTMENT_MANAGER'
    );
  }

  // 2. Check if user is a team lead of any active team
  const leadTeam = await Team.findOne({
    company_id: req.user.company_id,
    team_lead_id: user._id,
    is_active: true,
  });

  if (leadTeam) {
    throw new AppError(
      `Cannot archive user "${user.full_name}" — they are the lead of team "${leadTeam.name}". Reassign the team lead before archiving.`,
      409,
      'USER_IS_TEAM_LEAD'
    );
  }

  const currentState = user.lifecycle_state as LifecycleState;
  const targetState: LifecycleState = 'archived';

  // Check if user can be archived from current state
  // Users can only be archived from 'invited' or 'terminated' states
  if (!isValidTransition(currentState, targetState)) {
    throw new AppError(
      `Cannot archive user in '${currentState}' state. Valid transitions: ${getTransitionErrorMessage(currentState, targetState)}`,
      400,
      'INVALID_LIFECYCLE_TRANSITION'
    );
  }

  const beforeState = user.toObject();

  user.lifecycle_state = targetState;
  user.is_active = false;
  await user.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'user.archived',
    module: 'people',
    object_type: 'User',
    object_id: user._id.toString(),
    object_label: user.full_name,
    before_state: beforeState,
    after_state: user.toObject(),
  });

  res.status(200).json({ success: true, data: {} });
});

// ── Bulk Actions ──────────────────────────────────────────────────────────────

const BulkLifecycleSchema = z.object({
  user_ids: z.array(z.string()).min(1, 'At least one user ID is required').max(500),
  lifecycle_state: z.enum(['invited', 'onboarding', 'active', 'probation', 'on_leave', 'terminated', 'archived']),
});

const BulkAssignRoleSchema = z.object({
  user_ids: z.array(z.string()).min(1).max(500),
  role_id: z.string().min(1, 'Role ID is required'),
});

/**
 * PUT /people/bulk-lifecycle
 * Bulk lifecycle state change for multiple users.
 * Each user is validated individually against VALID_TRANSITIONS.
 * Invalid transitions are skipped with per-row error reporting.
 * Each successful transition produces an individual audit event.
 */
export const bulkUpdateLifecycle = asyncHandler(async (req: Request, res: Response) => {
  const input = BulkLifecycleSchema.parse(req.body);

  const results: Array<{ user_id: string; user_name: string; success: boolean; error?: string }> = [];
  let successCount = 0;
  let skippedCount = 0;

  for (const userId of input.user_ids) {
    const user = await User.findOne({
      _id: userId,
      company_id: req.user.company_id,
    });

    if (!user) {
      results.push({ user_id: userId, user_name: 'Unknown', success: false, error: 'User not found' });
      skippedCount++;
      continue;
    }

    const currentState = user.lifecycle_state as LifecycleState;
    const targetState = input.lifecycle_state as LifecycleState;

    if (!isValidTransition(currentState, targetState)) {
      results.push({
        user_id: userId,
        user_name: user.full_name,
        success: false,
        error: getTransitionErrorMessage(currentState, targetState),
      });
      skippedCount++;
      continue;
    }

    const beforeState = user.toObject();
    user.lifecycle_state = targetState;
    await user.save();

    try {
      await runLifecycleAutomations(user, currentState, targetState, req);
    } catch (automationError) {
      console.error(`[Bulk Lifecycle Automation Error] ${user._id}:`, automationError);
    }

    // Individual audit event for each user
    await auditLogger.log({
      req,
      action: 'user.lifecycle_changed',
      module: 'people',
      object_type: 'User',
      object_id: user._id.toString(),
      object_label: user.full_name,
      before_state: beforeState,
      after_state: user.toObject(),
    });

    successCount++;
    results.push({ user_id: userId, user_name: user.full_name, success: true });

    // ── Workflow Engine: Fire lifecycle event for each successful transition ──
    handleLifecycleEvent({
      companyId: req.user.company_id,
      userId: user._id.toString(),
      userName: user.full_name,
      userEmail: user.email,
      lifecycleFrom: currentState,
      lifecycleTo: targetState,
    }).catch((workflowError) => {
      console.error(`[Bulk Workflow Error] ${user._id}:`, workflowError);
    });
  }

  // Summary audit event for the bulk operation
  await auditLogger.log({
    req,
    action: 'user.bulk_lifecycle_changed',
    module: 'people',
    object_type: 'User',
    object_id: req.user.userId,
    object_label: `Bulk lifecycle change to ${input.lifecycle_state}`,
    before_state: null,
    after_state: {
      target_state: input.lifecycle_state,
      total: input.user_ids.length,
      successful: successCount,
      skipped: skippedCount,
    },
  });

  res.status(200).json({
    success: true,
    data: {
      total: input.user_ids.length,
      successful: successCount,
      skipped: skippedCount,
      results,
    },
  });
});

/**
 * POST /people/bulk-assign-role
 * Bulk assign a role to multiple users.
 * Each assignment produces an individual audit event.
 * Duplicate assignments (user already has the role) are silently skipped.
 */
export const bulkAssignRole = asyncHandler(async (req: Request, res: Response) => {
  const input = BulkAssignRoleSchema.parse(req.body);

  // Verify role exists and belongs to company
  const role = await Role.findOne({
    _id: input.role_id,
    company_id: req.user.company_id,
    is_active: true,
  });

  if (!role) {
    throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  }

  const results: Array<{ user_id: string; user_name: string; success: boolean; error?: string }> = [];
  let successCount = 0;
  let skippedCount = 0;

  for (const userId of input.user_ids) {
    const user = await User.findOne({
      _id: userId,
      company_id: req.user.company_id,
    });

    if (!user) {
      results.push({ user_id: userId, user_name: 'Unknown', success: false, error: 'User not found' });
      skippedCount++;
      continue;
    }

    // Check for duplicate assignment
    const existing = await UserRole.findOne({
      user_id: user._id,
      role_id: role._id,
    });

    if (existing) {
      results.push({ user_id: userId, user_name: user.full_name, success: false, error: 'Role already assigned' });
      skippedCount++;
      continue;
    }

    // Assign the role
    await UserRole.create({
      user_id: user._id,
      role_id: role._id,
      assigned_by: new Types.ObjectId(req.user.userId),
      assigned_at: new Date(),
    });

    // Audit event for each assignment
    await auditLogger.log({
      req,
      action: 'user.role_assigned',
      module: 'people',
      object_type: 'User',
      object_id: user._id.toString(),
      object_label: user.full_name,
      before_state: null,
      after_state: { role_id: role._id.toString(), role_name: role.name },
    });

    successCount++;
    results.push({ user_id: userId, user_name: user.full_name, success: true });
  }

  // Summary audit event
  await auditLogger.log({
    req,
    action: 'user.bulk_role_assigned',
    module: 'people',
    object_type: 'Role',
    object_id: role._id.toString(),
    object_label: role.name,
    before_state: null,
    after_state: {
      role_id: role._id.toString(),
      role_name: role.name,
      total: input.user_ids.length,
      successful: successCount,
      skipped: skippedCount,
    },
  });

  res.status(200).json({
    success: true,
    data: {
      total: input.user_ids.length,
      successful: successCount,
      skipped: skippedCount,
      results,
    },
  });
});

/**
 * GET /people/export
 * Exports users as CSV with all visible columns.
 * Audit event logged with filter params and row count.
 */
export const exportUsers = asyncHandler(async (req: Request, res: Response) => {
  const { lifecycle_state, department_id, employment_type } = req.query;

  const filter: UserFilter = {
    company_id: req.user.company_id,
  };

  if (lifecycle_state) {
    const VALID_LIFECYCLE_STATES: LifecycleState[] = ['invited', 'onboarding', 'active', 'probation', 'on_leave', 'terminated', 'archived'];
    if (VALID_LIFECYCLE_STATES.includes(lifecycle_state as LifecycleState)) {
      filter.lifecycle_state = lifecycle_state as LifecycleState;
    }
  }

  if (department_id) {
    filter.department_id = String(department_id);
  }

  if (employment_type) {
    const VALID_EMPLOYMENT_TYPES: EmploymentType[] = ['full_time', 'part_time', 'contractor', 'intern'];
    if (VALID_EMPLOYMENT_TYPES.includes(employment_type as EmploymentType)) {
      filter.employment_type = employment_type as EmploymentType;
    }
  }

  const users = await User.find(filter)
    .populate('department_id', 'name')
    .populate('manager_id', 'full_name')
    .populate('location_id', 'name')
    .sort({ created_at: -1 })
    .lean();

  // Build CSV
  const headers = ['Employee ID', 'Full Name', 'Email', 'Phone', 'Department', 'Manager', 'Location', 'Lifecycle State', 'Employment Type', 'Hire Date', 'Last Login', 'Created At'];

  const rows = users.map((u: any) => {
    const dept = typeof u.department_id === 'object' ? u.department_id?.name : '';
    const manager = typeof u.manager_id === 'object' ? u.manager_id?.full_name : '';
    const location = typeof u.location_id === 'object' ? u.location_id?.name : '';

    return [
      u.employee_id,
      `"${(u.full_name || '').replace(/"/g, '""')}"`,
      u.email,
      u.phone || '',
      dept,
      manager,
      location,
      u.lifecycle_state,
      u.employment_type,
      u.hire_date ? new Date(u.hire_date).toISOString().split('T')[0] : '',
      u.last_login ? new Date(u.last_login).toISOString() : '',
      u.created_at ? new Date(u.created_at).toISOString() : '',
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');

  // Audit log
  await auditLogger.log({
    req,
    action: 'user.exported',
    module: 'people',
    object_type: 'User',
    object_id: req.user.userId,
    object_label: `Export: ${users.length} users`,
    before_state: null,
    after_state: {
      row_count: users.length,
      filters: { lifecycle_state, department_id, employment_type },
    },
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=users_export_${new Date().toISOString().split('T')[0]}.csv`);
  res.status(200).send(csvContent);
});

/**
 * POST /api/v1/people/verify-invite
 * Verifies an invite token and returns user info.
 * This endpoint is public (no authentication required).
 */
export const verifyInviteToken = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) throw new AppError('Token is required', 400, 'BAD_REQUEST');

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const record = await InviteToken.findOne({
    token_hash: tokenHash,
    is_used: false,
    expires_at: { $gt: new Date() },
  });

  if (!record) throw new AppError('Invalid or expired invite link', 400, 'INVALID_INVITE_TOKEN');

  const user = await User.findById(record.user_id).select('email full_name company_id');
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

  // Do not consume the invite token here. The token is validated on page load,
  // and it should be consumed only when the user successfully sets their password.
  res.json({ success: true, data: { email: user.email, full_name: user.full_name, company_id: user.company_id } });
});

/**
 * POST /people/:id/resend-invite
 * Resends the invitation email with a fresh secure token.
 */
export const resendInvite = asyncHandler(async (req: Request, res: Response) => {
  const userId = getRouteId(req.params.id);
  const user = await User.findOne({
    _id: userId,
    company_id: req.user.company_id,
  });

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  if (user.lifecycle_state !== 'invited') {
    throw new AppError('Only users in "invited" state can have their invitation resent', 400, 'BAD_REQUEST');
  }

  const company = await Company.findById(req.user.company_id);
  if (!company) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');

  // Generate a new secure token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  await InviteToken.create({
    user_id: user._id,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
  });

  await sendWelcomeEmail({
    email: user.email,
    full_name: user.full_name,
    employee_id: user.employee_id,
    company_name: company.name,
    invite_link: `${process.env.CLIENT_URL}/onboarding?token=${rawToken}&email=${encodeURIComponent(user.email)}`,
  });

  await auditLogger.log({
    req,
    action: 'user.invite_resent',
    module: 'people',
    object_type: 'User',
    object_id: user._id.toString(),
    object_label: user.full_name,
    before_state: null,
    after_state: { email: user.email },
  });

  res.json({ success: true, message: 'Invitation resent successfully' });
});
