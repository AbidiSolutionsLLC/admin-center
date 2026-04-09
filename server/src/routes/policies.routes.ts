// server/src/routes/policies.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getPolicies,
  getPolicyVersions,
  getPolicyVersionById,
  publishPolicy,
  acknowledgePolicy,
  getPolicyAcknowledgments,
  getAcknowledgmentStatus,
  updatePolicyDraft,
  archivePolicy,
  saveAssignmentRules,
  conflictCheckHandler,
  getPolicyVersionDiff,
  getPolicyAssignments,
} from '../controllers/policies.controller';

const router = Router();

/**
 * All routes require authentication (requireAuth middleware applied below)
 * All routes are scoped to req.user.company_id from JWT
 *
 * NOTE: PolicyVersion is IMMUTABLE once published (status='published').
 * Draft versions can be updated via PUT /policies/:id/draft
 * Published versions can only be archived (POST /policies/:id/archive)
 * New versions must be created via POST /policies/publish
 */

// Apply authentication to all routes
router.use(requireAuth);

/**
 * GET /policies
 * List all policies (latest version per policy_key) with optional filters
 * Query params: category, status
 */
router.get('/', getPolicies);

/**
 * GET /policies/versions
 * Get all versions of a specific policy
 * Query params: policy_key (required)
 */
router.get('/versions', getPolicyVersions);

/**
 * GET /policies/versions/diff
 * Compare two versions of the same policy
 * Query params: policy_key, version_a, version_b
 */
router.get('/versions/diff', getPolicyVersionDiff);

/**
 * GET /policies/:id
 * Get a specific policy version by ID
 */
router.get('/:id', getPolicyVersionById);

/**
 * POST /policies/publish
 * Publish a new policy version (increments version number)
 * Requires super_admin or ops_admin role
 */
router.post('/publish', requireRole(['super_admin', 'ops_admin']), publishPolicy);

/**
 * PUT /policies/:id/draft
 * Update a draft policy version (only for status='draft')
 */
router.put('/:id/draft', updatePolicyDraft);

/**
 * POST /policies/:id/archive
 * Archive a published policy version (soft delete)
 */
router.post('/:id/archive', archivePolicy);

/**
 * POST /policies/:id/acknowledge
 * Acknowledge a policy version (current user)
 */
router.post('/:id/acknowledge', acknowledgePolicy);

/**
 * GET /policies/:id/acknowledgments
 * Get all acknowledgments for a policy version
 */
router.get('/:id/acknowledgments', getPolicyAcknowledgments);

/**
 * GET /policies/:id/acknowledgment-status
 * Check if current user has acknowledged this policy version
 */
router.get('/:id/acknowledgment-status', getAcknowledgmentStatus);

/**
 * POST /policies/:id/assignments
 * Save assignment rules (targeting) for a policy version
 * Runs RULE-08 conflict check automatically
 */
router.post('/:id/assignments', saveAssignmentRules);

/**
 * GET /policies/:id/assignments
 * Get all assignment rules for a specific policy version.
 */
router.get('/:id/assignments', getPolicyAssignments);

/**
 * GET /policies/:id/conflict-check
 * Check RULE-08: conflicting policies on same user population
 */
router.get('/:id/conflict-check', conflictCheckHandler);

export default router;
