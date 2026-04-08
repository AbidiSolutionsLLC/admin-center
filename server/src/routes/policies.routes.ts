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
} from '../controllers/policies.controller';

const router = Router();

/**
 * All routes require authentication (requireAuth middleware applied below)
 * All routes are scoped to req.user.company_id from JWT
 *
 * NOTE: PolicyVersion is IMMUTABLE - no DELETE or PUT routes exist.
 * Once a policy version is published, it cannot be modified or deleted.
 * New versions must be created instead of updating existing ones.
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

// ── NO DELETE OR PUT ROUTES FOR POLICY VERSIONS ──────────────────────────────
// PolicyVersion is immutable once published.
// To "update" a policy, publish a new version using POST /policies/publish
// This is enforced at the route level - no update/delete endpoints exist.

export default router;
