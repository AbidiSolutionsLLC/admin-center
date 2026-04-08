// server/src/controllers/policies.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { PolicyVersion } from '../models/PolicyVersion.model';
import { PolicyAcknowledgment } from '../models/PolicyAcknowledgment.model';
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
});

const AcknowledgePolicySchema = z.object({
  policy_version_id: z.string().min(1, 'Policy version ID is required'),
});

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
 * - Produces audit event: policy.published
 */
export const publishPolicy = asyncHandler(async (req: Request, res: Response) => {
  const input = PublishPolicySchema.parse(req.body);

  // Find the latest version for this policy_key to determine next version number
  const latestVersion = await PolicyVersion.findOne({
    company_id: new Types.ObjectId(req.user.company_id),
    policy_key: input.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
  })
    .sort({ version_number: -1 })
    .lean();

  // Generate policy_key from title if not provided
  const policyKey = input.title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

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
