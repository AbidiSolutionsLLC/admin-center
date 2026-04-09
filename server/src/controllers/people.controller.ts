// server/src/controllers/people.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { asyncHandler } from '../utils/asyncHandler';
import { User } from '../models/User.model';
import { Company } from '../models/Company.model';
import { RefreshToken } from '../models/RefreshToken.model';
import { auditLogger } from '../lib/auditLogger';
import { sendWelcomeEmail, sendBulkWelcomeEmails } from '../lib/emailService';
import { isValidTransition, getTransitionErrorMessage, LifecycleState } from '../lib/lifecycle';
import { handleLifecycleEvent } from '../lib/workflowEngine';
import { AppError } from '../utils/AppError';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const InviteUserSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(100),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional().nullable(),
  department_id: z.string().optional().nullable(),
  team_id: z.string().optional().nullable(),
  manager_id: z.string().optional().nullable(),
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

/**
 * Enriches user list with populated department and manager info
 */
/**
 * Enriches user list with populated department and manager info
 */
async function enrichUsers(users: any[]): Promise<any[]> {
  return users.map((user) => {
    const data = { ...user };
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

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /people
 * Returns all users for the requesting company with optional filters.
 * Supports filtering by lifecycle_state, department_id, employment_type.
 */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { lifecycle_state, department_id, employment_type, search } = req.query;

  // Build filter query
  const filter: Record<string, unknown> = {
    company_id: req.user.company_id,
  };

  if (lifecycle_state) {
    filter.lifecycle_state = lifecycle_state;
  }

  if (department_id) {
    filter.department_id = department_id;
  }

  if (employment_type) {
    filter.employment_type = employment_type;
  }

  // Search by name or email
  if (search && typeof search === 'string') {
    filter.$or = [
      { full_name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { employee_id: { $regex: search, $options: 'i' } },
    ];
  }

  const users = await User.find(filter as any)
    .select('-password_hash -refresh_token_hash')
    .populate('department_id', 'name slug')
    .populate('team_id', 'name slug')
    .populate('manager_id', 'full_name email avatar_url')
    .populate('location_id', 'name')
    .sort({ created_at: -1 })
    .lean();

  const enriched = await enrichUsers(users);
  res.status(200).json({ success: true, data: enriched });
});

/**
 * GET /people/:id
 * Returns a single user by ID, scoped to the company.
 */
export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  } as any)
    .select('-password_hash -refresh_token_hash')
    .populate('department_id', 'name slug')
    .populate('team_id', 'name slug')
    .populate('manager_id', 'full_name email avatar_url')
    .populate('location_id', 'name');

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  res.status(200).json({ success: true, data: user });
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

  // Check if user with this email already exists
  const existingUser = await User.findOne({
    company_id: req.user.company_id,
    email: input.email,
  } as any);

  if (existingUser) {
    throw new AppError('User with this email already exists', 400, 'DUPLICATE_EMAIL');
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
    company_id: req.user.company_id,
    password_hash,
    lifecycle_state: 'invited',
    is_active: false, // User is not active until they complete onboarding
    // Normalize empty strings → undefined
    department_id: input.department_id || undefined,
    team_id: input.team_id || undefined,
    manager_id: input.manager_id || undefined,
    location_id: input.location_id || undefined,
    hire_date: input.hire_date ? new Date(input.hire_date) : undefined,
  } as any);

  // Send welcome email
  try {
    await sendWelcomeEmail({
      email: user.email,
      full_name: user.full_name,
      employee_id: user.employee_id,
      company_name: company.name,
      invite_link: `${process.env.CLIENT_URL}/onboarding?token=${tempPassword}&email=${user.email}`,
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

  // Return user without sensitive fields
  const userResponse = user.toObject();
  const { password_hash: _ph, refresh_token_hash: _rth, ...safeUser } = userResponse;

  res.status(201).json({ success: true, data: safeUser });
});

/**
 * PUT /people/:id
 * Updates an existing user's profile information.
 * Does NOT change lifecycle_state (use PUT /people/:id/lifecycle for that).
 */
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  console.log("Update User Request Body:", req.body);
  const input = UpdateUserSchema.parse(req.body);

  const user = await User.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  } as any);

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
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

  // Convert date strings to Date objects
  if (updates.hire_date && typeof updates.hire_date === 'string') {
    updates.hire_date = new Date(updates.hire_date);
  }
  if (updates.termination_date && typeof updates.termination_date === 'string') {
    updates.termination_date = new Date(updates.termination_date);
  }

  Object.assign(user, updates);
  await user.save();

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

  // Return user without sensitive fields
  const userResponse = user.toObject();
  const { password_hash: _ph, refresh_token_hash: _rth, ...safeUser } = userResponse;

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

  const user = await User.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  } as any);

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

  const transitionKey = `${currentState}→${targetState}`;

  try {
    // AUTOMATION 1: invited → onboarding: Send welcome email
    if (transitionKey === 'invited→onboarding') {
      const company = await Company.findById(req.user.company_id);
      if (company) {
        await sendWelcomeEmail({
          email: user.email,
          full_name: user.full_name,
          employee_id: user.employee_id,
          company_name: company.name,
          invite_link: `${process.env.CLIENT_URL}/onboarding?email=${user.email}`,
        });

        // Audit event for welcome email
        await auditLogger.log({
          req,
          action: 'user.lifecycle_automation',
          module: 'people',
          object_type: 'User',
          object_id: user._id.toString(),
          object_label: user.full_name,
          before_state: { transition: 'invited→onboarding' },
          after_state: { automation: 'welcome_email_sent', email: user.email },
        });
      }
    }

    // AUTOMATION 2: onboarding → active: Assign default Employee role
    if (transitionKey === 'onboarding→active') {
      // TODO: Assign default Employee role from department's role mapping
      // For now, log the automation event
      await auditLogger.log({
        req,
        action: 'user.lifecycle_automation',
        module: 'people',
        object_type: 'User',
        object_id: user._id.toString(),
        object_label: user.full_name,
        before_state: { transition: 'onboarding→active' },
        after_state: { automation: 'default_role_assigned', note: 'Employee role assignment pending RBAC integration' },
      });
    }

    // AUTOMATION 3: active → terminated: Invalidate all refresh tokens
    if (transitionKey === 'active→terminated') {
      // Clear refresh token hash from user document
      user.refresh_token_hash = undefined;
      await user.save();

      // Revoke all active refresh tokens in the RefreshToken collection
      await RefreshToken.updateMany(
        { user_id: user._id, is_revoked: false },
        { $set: { is_revoked: true } }
      );

      // Audit event for session revocation
      await auditLogger.log({
        req,
        action: 'user.lifecycle_automation',
        module: 'people',
        object_type: 'User',
        object_id: user._id.toString(),
        object_label: user.full_name,
        before_state: { transition: 'active→terminated' },
        after_state: { automation: 'sessions_revoked', refresh_tokens_invalidated: true },
      });
    }

    // AUTOMATION 4: terminated → archived: Anonymize all PII
    if (transitionKey === 'terminated→archived') {
      const beforeAnonymize = user.toObject();

      // Clear all PII fields
      user.full_name = 'Archived User';
      user.email = `archived-${user._id}@archived.local`;
      user.phone = undefined;
      user.avatar_url = undefined;
      user.employee_id = `ARCHIVED-${user._id.toString().slice(-8)}`;
      
      // Clear optional PII
      (user as any).department_id = undefined;
      (user as any).team_id = undefined;
      (user as any).manager_id = undefined;
      (user as any).location_id = undefined;
      (user as any).hire_date = undefined;
      (user as any).termination_date = undefined;
      (user as any).custom_fields = {};

      await user.save();

      // Audit event for PII anonymization
      await auditLogger.log({
        req,
        action: 'user.lifecycle_automation',
        module: 'people',
        object_type: 'User',
        object_id: user._id.toString(),
        object_label: 'Archived User',
        before_state: beforeAnonymize,
        after_state: {
          automation: 'pii_anonymized',
          full_name: user.full_name,
          email: user.email,
          fields_cleared: ['full_name', 'email', 'phone', 'avatar_url', 'employee_id', 'department_id', 'team_id', 'manager_id', 'location_id', 'hire_date', 'termination_date', 'custom_fields'],
        },
      });
    }
  } catch (automationError) {
    // Log automation errors but don't fail the lifecycle transition
    console.error(`[Lifecycle Automation Error] ${transitionKey}:`, automationError);
    
    // Still log the error as an audit event
    await auditLogger.log({
      req,
      action: 'user.lifecycle_automation_error',
      module: 'people',
      object_type: 'User',
      object_id: user._id.toString(),
      object_label: user.full_name,
      before_state: { transition: transitionKey },
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

  // Return user without sensitive fields
  const userResponse = user.toObject();
  const { password_hash: _ph, refresh_token_hash: _rth, ...safeUser } = userResponse;

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

  const createdUsers: Array<{ email: string; full_name: string; employee_id: string }> = [];

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
      } as any);

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
        company_id: req.user.company_id,
        password_hash,
        lifecycle_state: 'invited',
        is_active: false,
        department_id: validatedRow.department_id || undefined,
        team_id: validatedRow.team_id || undefined,
        manager_id: validatedRow.manager_id || undefined,
        location_id: validatedRow.location_id || undefined,
        hire_date: validatedRow.hire_date ? new Date(validatedRow.hire_date) : undefined,
      } as any);

      // Track created user for email sending
      createdUsers.push({
        email: user.email,
        full_name: user.full_name,
        employee_id: user.employee_id,
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
          invite_link: `${process.env.CLIENT_URL}/onboarding?email=${u.email}`,
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
  const user = await User.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  } as any);

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
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
