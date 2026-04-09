// server/src/controllers/policies.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { PolicyVersion } from '../models/PolicyVersion.model';
import { PolicyAcknowledgment } from '../models/PolicyAcknowledgment.model';
import { PolicyAssignment } from '../models/PolicyAssignment.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
import { Types } from 'mongoose';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const PublishPolicySchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().min(1, 'Content is required'),
  category: z.enum(['hr', 'it', 'security', 'compliance', 'operations', 'other']),
  effective_date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  summary: z.string().optional(),
  assignment_rules: z
    .array(
      z.object({
        target_type: z.enum(['all', 'role', 'department', 'group', 'user']),
        target_id: z.string().min(1, 'Target ID is required'),
      })
    )
    .optional(),
});

const UpdateDraftPolicySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  category: z.enum(['hr', 'it', 'security', 'compliance', 'operations', 'other']).optional(),
  effective_date: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' })
    .optional(),
  summary: z.string().optional(),
});

const AcknowledgePolicySchema = z.object({
  policy_version_id: z.string().min(1, 'Policy version ID is required'),
});

const AssignmentRulesSchema = z.object({
  rules: z.array(
    z.object({
      target_type: z.enum(['all', 'role', 'department', 'group', 'user']),
      target_id: z.string().min(1, 'Target ID is required'),
    })
  ),
});

// ── Label resolvers for assignment targets ───────────────────────────────────

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

  // For now, use a generic label. In production, resolve from actual collections.
  return `${TARGET_LABELS[targetType] || 'Target'} (${targetId})`;
}

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /policies
 * Returns all policy keys with their latest version for the current company.
 * Groups by policy_key and returns only the most recent version per key.
 */
export const getPolicies = asyncHandler(async (req: Request, res: Response) => {
  const { category, status } = req.query;

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
    published_by: new Types.ObjectId(req.user.userId),
    published_at: new Date(),
    summary: input.summary,
    is_active: true,
  });

  // Save assignment rules if provided
  if (input.assignment_rules && input.assignment_rules.length > 0) {
    for (const rule of input.assignment_rules) {
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
      published_by: req.user.userId,
      published_at: policyVersion.published_at,
      summary: policyVersion.summary,
    },
  });

  const populatedPolicy = await PolicyVersion.findById(policyVersion._id).populate(
    'published_by',
    'full_name email avatar_url'
  );

  res.status(201).json({ success: true, data: populatedPolicy });
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
 * Returns all users who have acknowledged a specific policy version.
 */
export const getPolicyAcknowledgments = asyncHandler(async (req: Request, res: Response) => {
  const policyVersion = await PolicyVersion.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!policyVersion) {
    throw new AppError('Policy version not found', 404, 'POLICY_VERSION_NOT_FOUND');
  }

  const acknowledgments = await PolicyAcknowledgment.find({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_version_id: policyVersion._id,
  })
    .populate('user_id', 'full_name email avatar_url')
    .sort({ acknowledged_at: -1 });

  res.status(200).json({
    success: true,
    data: acknowledgments.map((a) => ({
      _id: a._id,
      user: a.user_id,
      acknowledged_at: a.acknowledged_at,
    })),
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

  // Capture existing rules before deletion (for audit trail)
  const existingRules = await PolicyAssignment.find({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_version_id: policyVersion._id,
  }).select('target_type target_id target_label');

  // Delete existing assignment rules for this version
  await PolicyAssignment.deleteMany({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_version_id: policyVersion._id,
  });

  // Create new assignment rules
  const createdRules: typeof PolicyAssignment.prototype[] = [];
  for (const rule of input.rules) {
    const label = await resolveTargetLabel(rule.target_type, rule.target_id, req.user.company_id);
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

  // RULE-08: Check for conflicting policies on the same user population
  const conflicts = await checkPolicyConflicts(
    req.user.company_id,
    policyVersion._id.toString(),
    input.rules
  );

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
    meta: conflicts.has_conflicts ? { conflicts } : undefined,
  });
});

/**
 * GET /policies/:id/conflict-check
 * Checks RULE-08: Are there conflicting policies targeting the same user population?
 */
export const checkPolicyConflicts = async (
  companyId: string,
  policyVersionId: string,
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

  // Find all published policies in the same category that target the same entities
  // A conflict is: two policies of same category targeting the same user population
  const currentPolicy = await PolicyVersion.findOne({
    _id: new Types.ObjectId(policyVersionId),
    company_id: new Types.ObjectId(companyId),
  });

  if (!currentPolicy) {
    return { has_conflicts: false, conflicting_policies: [] };
  }

  // Find other published policies in the same category
  const otherPolicies = await PolicyVersion.find({
    company_id: new Types.ObjectId(companyId),
    policy_key: { $ne: currentPolicy.policy_key }, // Different policy keys
    status: 'published',
    category: currentPolicy.category,
    is_active: true,
  });

  if (otherPolicies.length === 0) {
    return { has_conflicts: false, conflicting_policies: [] };
  }

  // For each other policy, check if it targets any of the same entities
  const otherPolicyIds = otherPolicies.map((p) => p._id);
  const overlappingAssignments = await PolicyAssignment.find({
    company_id: new Types.ObjectId(companyId),
    policy_version_id: { $in: otherPolicyIds },
    $or: rules.map((rule) => ({
      target_type: rule.target_type,
      target_id: rule.target_id,
    })),
  }).populate('policy_version_id', 'title policy_key version_number category');

  const conflicts = overlappingAssignments.map((assignment) => {
    const policy = assignment.policy_version_id as unknown as {
      title: string;
      policy_key: string;
      version_number: number;
      category: string;
    };
    return {
      policy_key: policy.policy_key,
      title: policy.title,
      version_number: policy.version_number,
      conflict_reason: `Conflicting ${currentPolicy.category} policy "${policy.title}" v${policy.version_number} targets the same ${assignment.target_type}: ${assignment.target_label}`,
    };
  });

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

// Export the conflict check as a standalone controller for the route
export const conflictCheckHandler = asyncHandler(async (req: Request, res: Response) => {
  const policyVersion = await PolicyVersion.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!policyVersion) {
    throw new AppError('Policy version not found', 404, 'POLICY_VERSION_NOT_FOUND');
  }

  // Get current assignment rules for this policy
  const currentAssignments = await PolicyAssignment.find({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_version_id: policyVersion._id,
  });

  const rules = currentAssignments.map((a) => ({
    target_type: a.target_type,
    target_id: a.target_id,
  }));

  const conflicts = await checkPolicyConflicts(
    req.user.company_id,
    policyVersion._id.toString(),
    rules
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
