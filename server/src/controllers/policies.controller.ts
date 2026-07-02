// server/src/controllers/policies.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { PolicyVersion } from '../models/PolicyVersion.model';
import { PolicyAcknowledgment } from '../models/PolicyAcknowledgment.model';
import { PolicyAssignment } from '../models/PolicyAssignment.model';
import { User } from '../models/User.model';
import { InAppNotification } from '../models/InAppNotification.model';
import { NotificationEvent } from '../models/NotificationEvent.model';
import { Insight } from '../models/Insight.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
import { Types } from 'mongoose';
import { Group } from '../models/Group.model';
import { Department } from '../models/Department.model';
import { Role } from '../models/Role.model';
import { escapeRegExp } from '../utils/regex';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const PublishPolicySchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  content: z.string().trim().min(1, 'Content is required'),
  category: z.enum(['hr', 'it', 'security', 'compliance', 'operations', 'other']),
  effective_date: z.string().trim().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  expiry_date: z.string().trim().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }).optional(),
  summary: z.string().trim().optional(),
  assignment_rules: z
    .array(
      z.object({
        target_type: z.enum(['all', 'role', 'department', 'group', 'user']),
        target_id: z.string().min(1, 'Target ID is required'),
      })
    )
    .min(1, 'At least one assignment rule is required'),
}).superRefine((data, ctx) => {
  if (data.expiry_date && data.effective_date) {
    const effective = new Date(data.effective_date);
    const expiry = new Date(data.expiry_date);
    
    if (!isNaN(expiry.getTime()) && !isNaN(effective.getTime())) {
      const now = new Date();
      now.setHours(0,0,0,0);
      
      if (expiry < now) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Expiry date must be in the future',
          path: ['expiry_date'],
        });
      } else if (expiry <= effective) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Expiry date must be after the effective date',
          path: ['expiry_date'],
        });
      }
    }
  }
});

const UpdateDraftPolicySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).optional(),
  category: z.enum(['hr', 'it', 'security', 'compliance', 'operations', 'other']).optional(),
  effective_date: z
    .string().trim()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' })
    .optional(),
  expiry_date: z
    .string().trim()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' })
    .optional(),
  summary: z.string().trim().optional(),
}).superRefine((data, ctx) => {
  if (data.expiry_date && data.effective_date) {
    const effective = new Date(data.effective_date);
    const expiry = new Date(data.expiry_date);
    
    if (!isNaN(expiry.getTime()) && !isNaN(effective.getTime())) {
      const now = new Date();
      now.setHours(0,0,0,0);
      
      if (expiry < now) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Expiry date must be in the future',
          path: ['expiry_date'],
        });
      } else if (expiry <= effective) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Expiry date must be after the effective date',
          path: ['expiry_date'],
        });
      }
    }
  }
});

// AcknowledgePolicySchema removed

const AssignmentRulesSchema = z.object({
  rules: z.array(
    z.object({
      target_type: z.enum(['all', 'role', 'department', 'group', 'user']),
      target_id: z.string().trim().min(1, 'Target ID is required'),
    })
  ).min(1, 'At least one assignment rule is required'),
});

// ── Label resolvers for assignment targets ───────────────────────────────────

const SimulatePolicySchema = z.object({
  assignment_rules: z.array(
    z.object({
      target_type: z.enum(['all', 'role', 'department', 'group', 'user']),
      target_id: z.string().trim().min(1, 'Target ID is required'),
    })
  ).min(1, 'At least one assignment rule is required'),
});

const TARGET_LABELS: Record<string, string> = {
  all: 'All Users',
  role: 'Role',
  department: 'Department',
  group: 'Group',
  user: 'User',
};

async function resolveTargetLabel(
  targetType: string,
  targetId: string,
  companyId: string
): Promise<string> {
  if (targetType === 'all') return TARGET_LABELS.all;

  if (targetType === 'user') {
    const { User } = await import('../models/User.model');
    const user = await User.findOne({ _id: targetId, company_id: new Types.ObjectId(companyId) }).select('full_name');
    if (user) return user.full_name;
  } else if (targetType === 'role') {
    const { Role } = await import('../models/Role.model');
    const role = await Role.findOne({ _id: targetId, company_id: new Types.ObjectId(companyId) }).select('name');
    if (role) return role.name;
  } else if (targetType === 'department') {
    const { Department } = await import('../models/Department.model');
    const dept = await Department.findOne({ _id: targetId, company_id: new Types.ObjectId(companyId) }).select('name');
    if (dept) return dept.name;
  } else if (targetType === 'group') {
    const { Group } = await import('../models/Group.model');
    const group = await Group.findOne({ _id: targetId, company_id: new Types.ObjectId(companyId) }).select('name');
    if (group) return group.name;
  }

  throw new AppError(`Target ${targetType} with ID ${targetId} not found`, 404, 'TARGET_NOT_FOUND');
}

// ── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Resolves targeted users based on assignment rules.
 * Handles target types: 'all', 'role', 'department', 'group', 'user'.
 */
async function resolveTargetedUsers(
  companyId: string,
  rules: Array<{ target_type: string; target_id: string }>
): Promise<Array<typeof User.prototype>> {
  const allUsers = await User.find({
    company_id: new Types.ObjectId(companyId),
    is_active: true,
  });

  const targetedUserIds = new Set<string>();

  for (const rule of rules) {
    switch (rule.target_type) {
      case 'all':
        // All active users
        allUsers.forEach((u) => targetedUserIds.add(u._id.toString()));
        break;

      case 'department':
        // Users in specific department
        allUsers
          .filter((u) => u.department_id?.toString() === rule.target_id)
          .forEach((u) => targetedUserIds.add(u._id.toString()));
        break;

      case 'role':
        // Users with specific role (via UserRole)
        const { UserRole } = await import('../models/UserRole.model');
        const userRoles = await UserRole.find({
          company_id: new Types.ObjectId(companyId),
          role_id: new Types.ObjectId(rule.target_id),
        });
        userRoles.forEach((ur) => targetedUserIds.add(ur.user_id.toString()));
        break;

      case 'user':
        // Direct user targeting
        targetedUserIds.add(rule.target_id);
        break;

      case 'group':
        // Users in specific group
        const { GroupMember } = await import('../models/GroupMember.model');
        const groupMembers = await GroupMember.find({
          group_id: new Types.ObjectId(rule.target_id),
        });
        groupMembers.forEach((gm) => targetedUserIds.add(gm.user_id.toString()));
        break;

      default:
        // Ignore unknown target types
        break;
    }
  }

  // Return unique users
  return allUsers.filter((u) => targetedUserIds.has(u._id.toString()));
}

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /policies/simulate
 * Simulates applying assignment rules and returns affected users and groups.
 * Does NOT save anything to the database.
 */
export const simulatePolicyApplication = asyncHandler(async (req: Request, res: Response) => {
  const input = SimulatePolicySchema.parse(req.body);

  // 1. Resolve affected users
  const affectedUsers = await resolveTargetedUsers(
    req.user.company_id,
    input.assignment_rules
  );

  // 2. Resolve affected groups/departments/roles from rules
  const affectedGroups: string[] = [];
  for (const rule of input.assignment_rules) {
    if (rule.target_type !== 'user') {
      try {
        const label = await resolveTargetLabel(rule.target_type, rule.target_id, req.user.company_id);
        affectedGroups.push(`${TARGET_LABELS[rule.target_type] || rule.target_type}: ${label}`);
      } catch (err) {
        // Ignore if not found during simulation
      }
    }
  }

  // 3. Format response
  res.status(200).json({
    success: true,
    data: {
      affected_users: affectedUsers.map((u) => ({
        _id: u._id,
        full_name: u.full_name,
        email: u.email,
        lifecycle_state: u.lifecycle_state,
      })),
      affected_groups: Array.from(new Set(affectedGroups)),
      expected_changes: [
        `Policy will be assigned to ${affectedUsers.length} user(s).`,
        `Acknowledgment will be required from all targeted users.`,
        `In-app notifications and emails will be triggered upon publish.`
      ],
    },
  });
});

/**
 * GET /policies
 * Returns all policy keys with their latest version for the current company.
 * Groups by policy_key and returns only the most recent version per key.
 */
export const getPolicies = asyncHandler(async (req: Request, res: Response) => {
  const { category, status } = req.query;

  // Validate allowed enum values to prevent NoSQL injection via unvalidated query params
  const ALLOWED_CATEGORIES = ['hr', 'it', 'security', 'compliance', 'operations', 'other'];
  const ALLOWED_STATUSES = ['draft', 'published', 'archived'];

  if (category && !ALLOWED_CATEGORIES.includes(String(category))) {
    throw new AppError(`Invalid category filter. Allowed: ${ALLOWED_CATEGORIES.join(', ')}`, 400, 'INVALID_FILTER');
  }
  if (status && !ALLOWED_STATUSES.includes(String(status))) {
    throw new AppError(`Invalid status filter. Allowed: ${ALLOWED_STATUSES.join(', ')}`, 400, 'INVALID_FILTER');
  }

  // Build filter query
  const filter: Record<string, unknown> = {
    company_id: new Types.ObjectId(req.user.company_id),
  };

  if (category) {
    filter.category = category;
  }

  if (status) {
    filter.status = status;
  }

  // Get latest version of each policy using aggregation
  const policies = await PolicyVersion.aggregate([
    { $match: filter },
    { $sort: { policy_key: 1, version_number: -1 } },
    {
      $group: {
        _id: '$policy_key',
        latest_version: { $first: '$$ROOT' },
        version_count: { $sum: 1 },
      },
    },
    { $sort: { 'latest_version.created_at': -1 } },
  ]);

  res.status(200).json({
    success: true,
    data: policies.map((p) => ({
      ...p.latest_version,
      version_count: p.version_count,
    })),
  });
});

/**
 * GET /policies/versions
 * Returns all versions of a specific policy for the current company.
 */
export const getPolicyVersions = asyncHandler(async (req: Request, res: Response) => {
  const { policy_key } = req.query;

  if (!policy_key || typeof policy_key !== 'string') {
    throw new AppError('policy_key query parameter is required', 400, 'MISSING_POLICY_KEY');
  }

  const versions = await PolicyVersion.find({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_key,
  })
    .populate('published_by', 'full_name email avatar_url')
    .sort({ version_number: -1 });

  if (!versions.length) {
    throw new AppError('Policy not found', 404, 'POLICY_NOT_FOUND');
  }

  res.status(200).json({ success: true, data: versions });
});

/**
 * GET /policies/:id
 * Returns a specific policy version by ID, scoped to the company.
 */
export const getPolicyVersionById = asyncHandler(async (req: Request, res: Response) => {
  const policyVersion = await PolicyVersion.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  }).populate('published_by', 'full_name email avatar_url');

  if (!policyVersion) {
    throw new AppError('Policy version not found', 404, 'POLICY_VERSION_NOT_FOUND');
  }

  res.status(200).json({ success: true, data: policyVersion });
});

/**
 * POST /policies/publish
 * Publishes a new policy version or increments version number for an existing policy.
 * - If policy_key doesn't exist: creates version 1
 * - If policy_key exists: increments version_number by 1
 * - Sets status to 'published' and published_at to now
 * - Saves assignment rules if provided
 * - Produces audit event: policy.published
 */
export const publishPolicy = asyncHandler(async (req: Request, res: Response) => {
  const input = PublishPolicySchema.parse(req.body);

  // Generate policy_key from title
  const policyKey = input.title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  // Find the latest version for this policy_key to determine next version number
  const latestVersion: typeof PolicyVersion.prototype | null = await PolicyVersion.findOne({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_key: policyKey,
  })
    .sort({ version_number: -1 });

  // TC-006: Prevent policy key collision merging policies with different titles
  if (latestVersion && latestVersion.title.trim().toLowerCase() !== input.title.trim().toLowerCase()) {
    throw new AppError('A policy with a similar title already exists.', 400, 'DUPLICATE_NAME');
  }

  // Duplicate check using case-insensitive regex — escape title to prevent ReDoS
  if (!latestVersion) {
    const existing = await PolicyVersion.findOne({
      title: { $regex: `^${escapeRegExp(input.title)}$`, $options: 'i' },
      company_id: new Types.ObjectId(req.user.company_id),
    });

    if (existing) {
      throw new AppError('A policy with this name already exists', 400, 'DUPLICATE_NAME');
    }
  }

  // Pre-validate all assignment rule targets BEFORE creating the PolicyVersion.
  // This prevents orphaned PolicyVersion records when a target is invalid.
  if (input.assignment_rules && input.assignment_rules.length > 0) {
    for (const rule of input.assignment_rules) {
      // resolveTargetLabel will throw AppError if target not found
      await resolveTargetLabel(rule.target_type, rule.target_id, req.user.company_id);
    }

    // Check conflicts before creating the version
    const conflicts = await checkPolicyConflicts(
      req.user.company_id,
      policyKey,
      input.category,
      input.assignment_rules
    );

    if (conflicts.has_conflicts) {
      throw new AppError(
        'Cannot apply policy: Conflict detected with existing policies. Please resolve conflicts first.',
        400,
        'POLICY_CONFLICT'
      );
    }
  }

  // Set previous versions to inactive
  await PolicyVersion.updateMany(
    { company_id: new Types.ObjectId(req.user.company_id), policy_key: policyKey, status: 'published' },
    { $set: { is_active: false } }
  );

  // Determine next version number
  const versionNumber = latestVersion ? latestVersion.version_number + 1 : 1;

  // Create new published policy version
  const policyVersion = await PolicyVersion.create({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_key: policyKey,
    title: input.title,
    content: input.content,
    version_number: versionNumber,
    status: 'published',
    category: input.category,
    effective_date: new Date(input.effective_date),
    expiry_date: input.expiry_date ? new Date(input.expiry_date) : undefined,
    published_by: new Types.ObjectId(req.user.userId),
    published_at: new Date(),
    summary: input.summary,
    is_active: true,
  });

  // Save assignment rules if provided
  if (input.assignment_rules && input.assignment_rules.length > 0) {
    // Deduplicate input rules to prevent E11000 crashes
    const uniqueRules = new Map<string, typeof input.assignment_rules[0]>();
    for (const rule of input.assignment_rules) {
      uniqueRules.set(`${rule.target_type}-${rule.target_id}`, rule);
    }
    const deduplicatedRules = Array.from(uniqueRules.values());

    for (const rule of deduplicatedRules) {
      const label = await resolveTargetLabel(rule.target_type, rule.target_id, req.user.company_id);
      await PolicyAssignment.findOneAndUpdate(
        {
          company_id: new Types.ObjectId(req.user.company_id),
          policy_version_id: policyVersion._id,
          target_type: rule.target_type,
          target_id: rule.target_id,
        },
        {
          company_id: new Types.ObjectId(req.user.company_id),
          policy_version_id: policyVersion._id,
          target_type: rule.target_type,
          target_id: rule.target_id,
          target_label: label,
        },
        { upsert: true }
      );
    }
  }

  // Audit log with version in after_state
  await auditLogger.log({
    req,
    action: 'policy.published',
    module: 'policies',
    object_type: 'PolicyVersion',
    object_id: policyVersion._id.toString(),
    object_label: `${policyVersion.title} v${policyVersion.version_number}`,
    before_state: null,
    after_state: {
      policy_key: policyVersion.policy_key,
      title: policyVersion.title,
      version_number: policyVersion.version_number,
      status: policyVersion.status,
      category: policyVersion.category,
      effective_date: policyVersion.effective_date,
      expiry_date: policyVersion.expiry_date,
      published_by: req.user.userId,
      published_at: policyVersion.published_at,
      summary: policyVersion.summary,
    },
  });

  // ── Send notifications to targeted users ─────────────────────────────────
  // If assignment rules were provided, resolve targeted users and create in-app notifications
  let notificationCount = 0;
  if (input.assignment_rules && input.assignment_rules.length > 0) {
    const targetedUsers = await resolveTargetedUsers(
      req.user.company_id,
      input.assignment_rules
    );

    for (const user of targetedUsers) {
      try {
        // Create in-app notification
        const inAppNotif = await InAppNotification.create({
          company_id: new Types.ObjectId(req.user.company_id),
          user_id: user._id,
          title: 'New Policy Published',
          message: `A new policy "${policyVersion.title}" has been published. Please review and acknowledge it.`,
          severity: 'warning',
          status: 'unread',
          link_url: `/policies/${policyVersion._id}`,
        });

        const APP_URL = process.env.APP_URL || 'http://localhost:5173';
        const { emailService } = await import('../lib/emailService');
        await emailService.sendPolicyNotificationEmail({
          email: user.email,
          full_name: user.full_name,
          policy_title: policyVersion.title,
          company_name: 'Your Company',
          policy_link: `${APP_URL}/policies/${policyVersion._id}`,
        });

        // Log delivery event
        await NotificationEvent.create({
          company_id: new Types.ObjectId(req.user.company_id),
          recipient_user_id: user._id,
          recipient_email: user.email,
          channel: 'in_app',
          status: 'sent',
          subject_rendered: 'New Policy Published',
          body_rendered: `A new policy "${policyVersion.title}" has been published. Please review and acknowledge it.`,
          triggered_by_event: 'policy.published',
          triggered_by_object_type: 'PolicyVersion',
          triggered_by_object_id: policyVersion._id.toString(),
          delivery_timestamp: new Date(),
        });

        notificationCount++;
      } catch (notifError) {
        // Don't fail the entire publish if notification fails
      }
    }
  }

  const populatedPolicy = await PolicyVersion.findById(policyVersion._id).populate(
    'published_by',
    'full_name email avatar_url'
  );

  res.status(201).json({
    success: true,
    data: populatedPolicy,
    meta: { notifications_sent: notificationCount },
  });
});

/**
 * POST /policies/:id/acknowledge
 * Records user acknowledgment of a specific policy version.
 * Enforces uniqueness via compound index (user_id + policy_version_id).
 */
export const acknowledgePolicy = asyncHandler(async (req: Request, res: Response) => {
  const policyVersion = await PolicyVersion.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!policyVersion) {
    throw new AppError('Policy version not found', 404, 'POLICY_VERSION_NOT_FOUND');
  }

  if (policyVersion.status !== 'published') {
    throw new AppError('Cannot acknowledge an unpublished policy', 400, 'POLICY_NOT_PUBLISHED');
  }

  // Check if user is actually targeted by this policy
  const assignments = await PolicyAssignment.find({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_version_id: policyVersion._id,
  });

  if (assignments.length > 0) {
    const targetedUsers = await resolveTargetedUsers(
      req.user.company_id,
      assignments.map((a) => ({ target_type: a.target_type, target_id: a.target_id }))
    );
    const isTargeted = targetedUsers.some((u) => u._id.toString() === req.user.userId);
    if (!isTargeted) {
      throw new AppError('You are not targeted by this policy', 403, 'NOT_TARGETED');
    }
  }

  // Check if user already acknowledged this version
  const existingAcknowledgment = await PolicyAcknowledgment.findOne({
    company_id: new Types.ObjectId(req.user.company_id),
    user_id: new Types.ObjectId(req.user.userId),
    policy_version_id: policyVersion._id,
  });

  if (existingAcknowledgment) {
    throw new AppError('You have already acknowledged this policy version', 400, 'DUPLICATE_ACKNOWLEDGMENT');
  }

  // Create acknowledgment
  const acknowledgment = await PolicyAcknowledgment.create({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_version_id: policyVersion._id,
    user_id: new Types.ObjectId(req.user.userId),
    acknowledged_at: new Date(),
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  });

  // Audit log
  await auditLogger.log({
    req,
    action: 'policy.acknowledged',
    module: 'policies',
    object_type: 'PolicyAcknowledgment',
    object_id: acknowledgment._id.toString(),
    object_label: `${policyVersion.title} v${policyVersion.version_number}`,
    before_state: null,
    after_state: {
      policy_version_id: policyVersion._id.toString(),
      user_id: req.user.userId,
      acknowledged_at: acknowledgment.acknowledged_at,
    },
  });

  res.status(201).json({ success: true, data: acknowledgment });
});

/**
 * GET /policies/:id/acknowledgments
 * Returns an acknowledgment report with acknowledged users, pending users, and total targeted count.
 */
export const getPolicyAcknowledgments = asyncHandler(async (req: Request, res: Response) => {
  const policyVersion = await PolicyVersion.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!policyVersion) {
    throw new AppError('Policy version not found', 404, 'POLICY_VERSION_NOT_FOUND');
  }

  // Find all acknowledgments
  const acknowledgments = await PolicyAcknowledgment.find({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_version_id: policyVersion._id,
  })
    .populate<{ user_id: any }>('user_id', 'full_name email avatar_url')
    .sort({ acknowledged_at: -1 });

  const acknowledgedUsersMap = new Map(
    acknowledgments.map(a => [a.user_id._id.toString(), a])
  );

  // Find targeted users
  const assignments = await PolicyAssignment.find({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_version_id: policyVersion._id,
  });

  let targetedUsers: Array<typeof User.prototype> = [];
  if (assignments.length > 0) {
    targetedUsers = await resolveTargetedUsers(
      req.user.company_id,
      assignments.map(a => ({ target_type: a.target_type, target_id: a.target_id }))
    );
  } else {
    // If no assignment rules, no one is targeted explicitly, but fallback to empty list.
    // Or we consider all users targeted? The PRD might want explicit targeting.
    // Publish schema makes assignment_rules optional, but without it no one is notified.
  }

  const pending: Array<{
    _id: string;
    user: {
      _id: string;
      full_name: string;
      email: string;
      avatar_url?: string;
    };
  }> = [];
  
  targetedUsers.forEach(user => {
    if (!acknowledgedUsersMap.has(user._id.toString())) {
      pending.push({
        _id: `pending-${user._id}`,
        user: {
          _id: user._id,
          full_name: user.full_name,
          email: user.email,
          avatar_url: user.avatar_url,
        }
      });
    }
  });

  const formattedAcknowledged = acknowledgments.map((a) => ({
    _id: a._id,
    user: a.user_id,
    acknowledged_at: a.acknowledged_at,
  }));

  res.status(200).json({
    success: true,
    data: {
      acknowledged: formattedAcknowledged,
      pending,
      total_targeted: targetedUsers.length,
    },
  });
});

/**
 * GET /policies/:id/acknowledgment-status
 * Returns whether the current user has acknowledged this policy version.
 */
export const getAcknowledgmentStatus = asyncHandler(async (req: Request, res: Response) => {
  const policyVersion = await PolicyVersion.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!policyVersion) {
    throw new AppError('Policy version not found', 404, 'POLICY_VERSION_NOT_FOUND');
  }

  let targeted = false;
  const assignments = await PolicyAssignment.find({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_version_id: policyVersion._id,
  });

  if (assignments.length > 0) {
    const targetedUsers = await resolveTargetedUsers(
      req.user.company_id,
      assignments.map((a) => ({ target_type: a.target_type, target_id: a.target_id }))
    );
    targeted = targetedUsers.some((u) => u._id.toString() === req.user.userId);
  }

  const acknowledgment = await PolicyAcknowledgment.findOne({
    company_id: new Types.ObjectId(req.user.company_id),
    user_id: new Types.ObjectId(req.user.userId),
    policy_version_id: policyVersion._id,
  });

  res.status(200).json({
    success: true,
    data: {
      acknowledged: !!acknowledgment,
      acknowledged_at: acknowledgment?.acknowledged_at || null,
      targeted,
    },
  });
});

/**
 * PUT /policies/:id/draft
 * Updates a draft policy version. Only works for policies with status='draft'.
 * Published policies cannot be modified — must create a new version.
 * Produces audit event: policy.draft_updated
 */
export const updatePolicyDraft = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateDraftPolicySchema.parse(req.body);

  const policyVersion = await PolicyVersion.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!policyVersion) {
    throw new AppError('Policy version not found', 404, 'POLICY_VERSION_NOT_FOUND');
  }

  if (policyVersion.status === 'published') {
    throw new AppError(
      'Cannot modify published policy. Publish a new version instead.',
      400,
      'CANNOT_MODIFY_PUBLISHED'
    );
  }

  // Store before state for audit
  const beforeState = {
    title: policyVersion.title,
    content: policyVersion.content,
    category: policyVersion.category,
    effective_date: policyVersion.effective_date,
    expiry_date: policyVersion.expiry_date,
    summary: policyVersion.summary,
  };

  // Update fields
  Object.assign(policyVersion, input);
  await policyVersion.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'policy.draft_updated',
    module: 'policies',
    object_type: 'PolicyVersion',
    object_id: policyVersion._id.toString(),
    object_label: `${policyVersion.title} v${policyVersion.version_number} (draft)`,
    before_state: beforeState,
    after_state: {
      title: policyVersion.title,
      content: policyVersion.content,
      category: policyVersion.category,
      effective_date: policyVersion.effective_date,
      expiry_date: policyVersion.expiry_date,
      summary: policyVersion.summary,
    },
  });

  const populatedPolicy = await PolicyVersion.findById(policyVersion._id).populate(
    'published_by',
    'full_name email avatar_url'
  );

  res.status(200).json({ success: true, data: populatedPolicy });
});

/**
 * POST /policies/draft
 * Creates a new draft policy (saves without publishing).
 * Produces audit event: policy.draft_created
 */
export const createDraftPolicy = asyncHandler(async (req: Request, res: Response) => {
  const input = PublishPolicySchema.parse(req.body);

  const policyKey = input.title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  const existing = await PolicyVersion.findOne({
    title: { $regex: `^${escapeRegExp(input.title)}$`, $options: 'i' },
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (existing) {
    throw new AppError('A policy with this name already exists', 400, 'DUPLICATE_NAME');
  }

  // TC-006: Prevent policy key collision
  const existingKey = await PolicyVersion.findOne({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_key: policyKey,
  });

  if (existingKey) {
    throw new AppError('A policy with a similar title already exists.', 400, 'DUPLICATE_NAME');
  }

  const policyVersion = await PolicyVersion.create({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_key: policyKey,
    title: input.title,
    content: input.content,
    version_number: 1,
    status: 'draft',
    category: input.category,
    effective_date: new Date(input.effective_date),
    expiry_date: input.expiry_date ? new Date(input.expiry_date) : undefined,
    summary: input.summary,
    is_active: false,
  });

  await auditLogger.log({
    req,
    action: 'policy.draft_created',
    module: 'policies',
    object_type: 'PolicyVersion',
    object_id: policyVersion._id.toString(),
    object_label: `${policyVersion.title} (draft)`,
    before_state: null,
    after_state: {
      policy_key: policyVersion.policy_key,
      title: policyVersion.title,
      status: policyVersion.status,
    },
  });

  res.status(201).json({
    success: true,
    data: policyVersion,
  });
});

/**
 * POST /policies/:id/archive
 * Archives a published policy version (soft delete).
 * Old version remains accessible in version history.
 * Produces audit event: policy.archived
 */
export const archivePolicy = asyncHandler(async (req: Request, res: Response) => {
  const policyVersion = await PolicyVersion.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!policyVersion) {
    throw new AppError('Policy version not found', 404, 'POLICY_VERSION_NOT_FOUND');
  }

  if (policyVersion.status !== 'published') {
    throw new AppError('Only published policies can be archived', 400, 'INVALID_STATUS');
  }

  const beforeState = { status: policyVersion.status, is_active: policyVersion.is_active };

  policyVersion.status = 'archived';
  policyVersion.is_active = false;
  await policyVersion.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'policy.archived',
    module: 'policies',
    object_type: 'PolicyVersion',
    object_id: policyVersion._id.toString(),
    object_label: `${policyVersion.title} v${policyVersion.version_number}`,
    before_state: beforeState,
    after_state: {
      status: policyVersion.status,
      is_active: policyVersion.is_active,
    },
  });

  const populatedPolicy = await PolicyVersion.findById(policyVersion._id).populate(
    'published_by',
    'full_name email avatar_url'
  );

  res.status(200).json({ success: true, data: populatedPolicy });
});

/**
 * DELETE /policies/:id
 * Hard deletes a draft or archived policy version.
 */
export const deletePolicy = asyncHandler(async (req: Request, res: Response) => {
  const policyVersion = await PolicyVersion.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!policyVersion) {
    throw new AppError('Policy version not found', 404, 'NOT_FOUND');
  }

  if (policyVersion.status === 'published') {
    throw new AppError('Cannot delete published policy. Archive it instead.', 400, 'CANNOT_DELETE_PUBLISHED');
  }

  // Prevent deleting entities with dependents
  const assignments = await PolicyAssignment.countDocuments({
    policy_version_id: policyVersion._id,
  });
  if (assignments > 0) {
    throw new AppError('Cannot delete: Policy still has assignment rules assigned', 400, 'HAS_DEPENDENTS');
  }

  await PolicyVersion.deleteOne({ _id: policyVersion._id });

  // Audit log
  await auditLogger.log({
    req,
    action: 'policy.deleted',
    module: 'policies',
    object_type: 'PolicyVersion',
    object_id: policyVersion._id.toString(),
    object_label: policyVersion.title,
    before_state: { title: policyVersion.title, status: policyVersion.status },
    after_state: null,
  });

  res.status(200).json({ success: true, data: { _id: policyVersion._id } });
});

/**
 * POST /policies/:id/rollback
 * Creates a new policy version based on a previous version.
 * - Increments version number
 * - Sets status to 'published'
 * - Copies content, category, assignment rules from the old version
 */
export const rollbackPolicy = asyncHandler(async (req: Request, res: Response) => {
  const oldVersion = await PolicyVersion.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!oldVersion) {
    throw new AppError('Policy version not found', 404, 'NOT_FOUND');
  }

  // Find the latest version for this policy_key to determine next version number
  const latestVersion: typeof PolicyVersion.prototype | null = await PolicyVersion.findOne({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_key: oldVersion.policy_key,
  }).sort({ version_number: -1 });

  const versionNumber = latestVersion ? latestVersion.version_number + 1 : 1;

  // Set previous versions to inactive
  await PolicyVersion.updateMany(
    { company_id: new Types.ObjectId(req.user.company_id), policy_key: oldVersion.policy_key, status: 'published' },
    { $set: { is_active: false } }
  );

  // Create new published policy version
  const policyVersion = await PolicyVersion.create({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_key: oldVersion.policy_key,
    title: oldVersion.title,
    content: oldVersion.content,
    version_number: versionNumber,
    status: 'published',
    category: oldVersion.category,
    effective_date: new Date(),
    expiry_date: oldVersion.expiry_date,
    published_by: new Types.ObjectId(req.user.userId),
    published_at: new Date(),
    summary: `Rolled back to version ${oldVersion.version_number}`,
    is_active: true,
  });

  // Copy assignment rules from old version
  const oldAssignments = await PolicyAssignment.find({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_version_id: oldVersion._id,
  });

  // Check conflicts before rollback
  if (oldAssignments && oldAssignments.length > 0) {
    const rulesToCheck = oldAssignments.map(a => ({ target_type: a.target_type, target_id: a.target_id }));
    const conflicts = await checkPolicyConflicts(req.user.company_id, policyVersion.policy_key, policyVersion.category, rulesToCheck);
    if (conflicts.has_conflicts) {
      // Cleanup the orphaned version; wrap in try/catch to ensure AppError still propagates
      try {
        await PolicyVersion.deleteOne({ _id: policyVersion._id });
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
      throw new AppError('Cannot rollback: Assignment rules from the old version conflict with currently active policies.', 400, 'POLICY_CONFLICT');
    }

    for (const rule of oldAssignments) {
      await PolicyAssignment.create({
        company_id: new Types.ObjectId(req.user.company_id),
        policy_version_id: policyVersion._id,
        target_type: rule.target_type,
        target_id: rule.target_id,
        target_label: rule.target_label,
      });
    }
  }

  // Audit log
  await auditLogger.log({
    req,
    action: 'policy.rolled_back',
    module: 'policies',
    object_type: 'PolicyVersion',
    object_id: policyVersion._id.toString(),
    object_label: `${policyVersion.title} v${policyVersion.version_number}`,
    before_state: null,
    after_state: {
      policy_key: policyVersion.policy_key,
      title: policyVersion.title,
      version_number: policyVersion.version_number,
      status: policyVersion.status,
      category: policyVersion.category,
      effective_date: policyVersion.effective_date,
      published_by: req.user.userId,
      published_at: policyVersion.published_at,
      summary: policyVersion.summary,
    },
  });

  const populatedPolicy = await PolicyVersion.findById(policyVersion._id).populate(
    'published_by',
    'full_name email avatar_url'
  );

  res.status(201).json({
    success: true,
    data: populatedPolicy,
  });
});

/**
 * POST /policies/:id/assignments
 * Saves assignment rules (targeting) for a policy version.
 * Deletes old rules and creates new ones (full replace).
 * Also runs RULE-08 conflict check after saving.
 * Produces audit event: policy.assignment_rules_updated
 */
export const saveAssignmentRules = asyncHandler(async (req: Request, res: Response) => {
  const input = AssignmentRulesSchema.parse(req.body);

  const policyVersion = await PolicyVersion.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!policyVersion) {
    throw new AppError('Policy version not found', 404, 'POLICY_VERSION_NOT_FOUND');
  }

  // RULE-08: Check for conflicting policies on the same user population BEFORE saving
  const conflicts = await checkPolicyConflicts(
    req.user.company_id,
    policyVersion.policy_key,
    policyVersion.category,
    input.rules
  );

  if (conflicts.has_conflicts) {
    throw new AppError(
      'Cannot apply policy: Conflict detected with existing policies. Please resolve conflicts first.',
      400,
      'POLICY_CONFLICT'
    );
  }

  // Capture existing rules before deletion (for audit trail)
  const existingRules = await PolicyAssignment.find({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_version_id: policyVersion._id,
  }).select('target_type target_id target_label');

  // Deduplicate input rules
  const uniqueRules = new Map<string, typeof input.rules[0]>();
  for (const rule of input.rules) {
    uniqueRules.set(`${rule.target_type}-${rule.target_id}`, rule);
  }
  const deduplicatedRules = Array.from(uniqueRules.values());

  // TC-010: Pre-validate all target IDs to prevent partial failure losing existing rules
  const resolvedLabels = new Map<string, string>();
  for (const rule of deduplicatedRules) {
    const label = await resolveTargetLabel(rule.target_type, rule.target_id, req.user.company_id);
    resolvedLabels.set(`${rule.target_type}-${rule.target_id}`, label);
  }

  // Now it's safe to delete existing assignment rules for this version
  await PolicyAssignment.deleteMany({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_version_id: policyVersion._id,
  });

  // Create new assignment rules
  const createdRules: typeof PolicyAssignment.prototype[] = [];
  for (const rule of deduplicatedRules) {
    const label = resolvedLabels.get(`${rule.target_type}-${rule.target_id}`)!;
    const assignment = await PolicyAssignment.create({
      company_id: new Types.ObjectId(req.user.company_id),
      policy_version_id: policyVersion._id,
      target_type: rule.target_type,
      target_id: rule.target_id,
      target_label: label,
    });
    createdRules.push(assignment);
  }

  // Audit log
  await auditLogger.log({
    req,
    action: 'policy.assignment_rules_updated',
    module: 'policies',
    object_type: 'PolicyVersion',
    object_id: policyVersion._id.toString(),
    object_label: `${policyVersion.title} v${policyVersion.version_number}`,
    before_state: existingRules.length > 0
      ? { assignment_rules: existingRules.map((r) => ({ target_type: r.target_type, target_id: r.target_id, target_label: r.target_label })) }
      : null,
    after_state: {
      assignment_rules: createdRules.map((r) => ({
        target_type: r.target_type,
        target_id: r.target_id,
        target_label: r.target_label,
      })),
    },
  });

  const populatedRules = createdRules.map((r) => ({
    _id: r._id,
    policy_version_id: r.policy_version_id,
    target_type: r.target_type,
    target_id: r.target_id,
    target_label: r.target_label,
    created_at: r.created_at,
  }));

  res.status(200).json({
    success: true,
    data: populatedRules,
  });
});

/**
 * GET /policies/:id/conflict-check
 * Checks RULE-08: Are there conflicting policies targeting the same user population?
 */
export const checkPolicyConflicts = async (
  companyId: string,
  policyKey: string,
  category: string,
  rules: Array<{ target_type: string; target_id: string }>
): Promise<{
  has_conflicts: boolean;
  conflicting_policies: Array<{
    policy_key: string;
    title: string;
    version_number: number;
    conflict_reason: string;
  }>;
}> => {
  if (!rules || rules.length === 0) {
    return { has_conflicts: false, conflicting_policies: [] };
  }

  // Find other published policies in the same category
  const otherPolicies = await PolicyVersion.find({
    company_id: new Types.ObjectId(companyId),
    policy_key: { $ne: policyKey }, // Different policy keys
    status: 'published',
    category: category,
    is_active: true,
  });

  if (otherPolicies.length === 0) {
    return { has_conflicts: false, conflicting_policies: [] };
  }

  // Resolve users targeted by the new policy
  const newTargetedUsers = await resolveTargetedUsers(companyId, rules);
  if (newTargetedUsers.length === 0) {
    return { has_conflicts: false, conflicting_policies: [] };
  }
  const newUserIds = new Set(newTargetedUsers.map(u => u._id.toString()));

  const conflicts: Array<{
    policy_key: string;
    title: string;
    version_number: number;
    conflict_reason: string;
  }> = [];

  for (const otherPolicy of otherPolicies) {
    const otherAssignments = await PolicyAssignment.find({
      company_id: new Types.ObjectId(companyId),
      policy_version_id: otherPolicy._id,
    });

    if (otherAssignments.length === 0) continue;

    const otherTargetedUsers = await resolveTargetedUsers(
      companyId,
      otherAssignments.map(a => ({ target_type: a.target_type, target_id: a.target_id }))
    );

    // Check intersection
    const overlappingUser = otherTargetedUsers.find(u => newUserIds.has(u._id.toString()));
    if (overlappingUser) {
      conflicts.push({
        policy_key: otherPolicy.policy_key,
        title: otherPolicy.title,
        version_number: otherPolicy.version_number,
        conflict_reason: `Conflicting ${category} policy "${otherPolicy.title}" v${otherPolicy.version_number} targets the same user(s) (e.g., ${overlappingUser.full_name}).`,
      });
    }
  }

  return {
    has_conflicts: conflicts.length > 0,
    conflicting_policies: conflicts,
  };
};

/**
 * GET /policies/versions/diff
 * Compares two versions of the same policy and returns content diff summary.
 * Query params: policy_key, version_a, version_b
 */
export const getPolicyVersionDiff = asyncHandler(async (req: Request, res: Response) => {
  const { policy_key, version_a, version_b } = req.query;

  if (!policy_key || typeof policy_key !== 'string') {
    throw new AppError('policy_key query parameter is required', 400, 'MISSING_POLICY_KEY');
  }
  if (!version_a || typeof version_a !== 'string') {
    throw new AppError('version_a query parameter is required', 400, 'MISSING_VERSION_A');
  }
  if (!version_b || typeof version_b !== 'string') {
    throw new AppError('version_b query parameter is required', 400, 'MISSING_VERSION_B');
  }

  const [versionA, versionB] = await Promise.all([
    PolicyVersion.findOne({
      company_id: new Types.ObjectId(req.user.company_id),
      policy_key,
      version_number: parseInt(version_a, 10),
    }),
    PolicyVersion.findOne({
      company_id: new Types.ObjectId(req.user.company_id),
      policy_key,
      version_number: parseInt(version_b, 10),
    }),
  ]);

  if (!versionA || !versionB) {
    throw new AppError('One or both versions not found', 404, 'VERSION_NOT_FOUND');
  }

  // Generate a simple diff summary (line-level comparison)
  const linesA = versionA.content.split(/\r?\n/);
  const linesB = versionB.content.split(/\r?\n/);

  // Simple line-based diff
  const added: string[] = [];
  const removed: string[] = [];

  // Use a simple LCS-based approach
  const maxLen = Math.max(linesA.length, linesB.length);
  const aSet = new Set(linesA);
  const bSet = new Set(linesB);

  for (const line of linesB) {
    if (!aSet.has(line) && line.trim()) added.push(line);
  }
  for (const line of linesA) {
    if (!bSet.has(line) && line.trim()) removed.push(line);
  }

  const diffSummary = {
    added_lines: added.length,
    removed_lines: removed.length,
    sample_added: added.slice(0, 3),
    sample_removed: removed.slice(0, 3),
  };

  res.status(200).json({
    success: true,
    data: {
      policy_key,
      version_a: {
        version_number: versionA.version_number,
        title: versionA.title,
        content: versionA.content,
      },
      version_b: {
        version_number: versionB.version_number,
        title: versionB.title,
        content: versionB.content,
      },
      diff_summary: diffSummary,
    },
  });
});

/**
 * POST /policies/:id/conflict-check
 * Checks RULE-08: Are there conflicting policies targeting the same user population?
 * Accepts prospective rules in the request body.
 */
export const conflictCheckHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = AssignmentRulesSchema.parse(req.body);

  const policyVersion = await PolicyVersion.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!policyVersion) {
    throw new AppError('Policy version not found', 404, 'POLICY_VERSION_NOT_FOUND');
  }

  const conflicts = await checkPolicyConflicts(
    req.user.company_id,
    policyVersion.policy_key,
    policyVersion.category,
    input.rules
  );

  res.status(200).json({ success: true, data: conflicts });
});

/**
 * GET /policies/:id/assignments
 * Returns all assignment rules for a specific policy version.
 */
export const getPolicyAssignments = asyncHandler(async (req: Request, res: Response) => {
  const policyVersion = await PolicyVersion.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!policyVersion) {
    throw new AppError('Policy version not found', 404, 'POLICY_VERSION_NOT_FOUND');
  }

  const assignments = await PolicyAssignment.find({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_version_id: policyVersion._id,
  }).sort({ created_at: 1 });

  res.status(200).json({ success: true, data: assignments });
});
