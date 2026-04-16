// server/src/routes/people.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getUsers,
  getUserById,
  inviteUser,
  updateUser,
  updateUserLifecycle,
  bulkInviteUsers,
  bulkUpdateLifecycle,
  bulkAssignRole,
  exportUsers,
  deleteUser,
  resendInvite,
} from '../controllers/people.controller';
import { assignUserOrg } from '../controllers/organization.controller';
import { requireRole } from '../middleware/requireRole';
import { PERMISSION_GROUPS } from '../constants/roles';
import reportingLinesRoutes from './reportingLines.routes';

const router = Router();

// All routes require authentication
router.use(requireAuth);

const PEOPLE_MANAGERS = ['Super Admin', 'HR Admin', 'Ops Admin'];

/**
 * ── Static Routes (Registered First) ─────────────────────────────────────────
 */

/**
 * GET /people
 * List all users with optional filters
 */
router.get('/', getUsers);

/**
 * GET /people/export
 * Export users as CSV
 */
router.get('/export', requireRole(PEOPLE_MANAGERS), exportUsers);

/**
 * POST /people/invite
 * Invite a new user
 */
router.post('/invite', requireRole(PEOPLE_MANAGERS), inviteUser);

/**
 * POST /people/bulk-invite
 * Bulk invite users
 */
router.post('/bulk-invite', requireRole(PEOPLE_MANAGERS), bulkInviteUsers);

/**
 * PUT /people/bulk-lifecycle
 * Bulk lifecycle state change
 */
router.put('/bulk-lifecycle', requireRole(PEOPLE_MANAGERS), bulkUpdateLifecycle);

/**
 * POST /people/bulk-assign-role
 * Bulk assign roles
 */
router.post('/bulk-assign-role', requireRole(PEOPLE_MANAGERS), bulkAssignRole);

/**
 * ── Parameterized Routes (Registered Last) ───────────────────────────────────
 */

/**
 * GET /people/export
 * Export users as CSV
 */
router.get('/export', requireRole(PEOPLE_MANAGERS), exportUsers);

/**
 * POST /people/invite
 * Invite a new user
 */
router.post('/invite', requireRole(PEOPLE_MANAGERS), inviteUser);

/**
 * POST /people/bulk-invite
 * Bulk invite users
 */
router.post('/bulk-invite', requireRole(PEOPLE_MANAGERS), bulkInviteUsers);

/**
 * PUT /people/bulk-lifecycle
 * Bulk lifecycle state change
 */
router.put('/bulk-lifecycle', requireRole(PEOPLE_MANAGERS), bulkUpdateLifecycle);

/**
 * POST /people/bulk-assign-role
 * Bulk assign roles
 */
router.post('/bulk-assign-role', requireRole(PEOPLE_MANAGERS), bulkAssignRole);

/**
 * ── Parameterized Routes (Registered Last) ───────────────────────────────────
 */

/**
 * GET /people/export
 * Export users as CSV
 */
router.get('/:id', getUserById);


router.post('/:id/resend-invite', requireRole(PEOPLE_MANAGERS), resendInvite);
/**
 * PUT /people/:id
 * Update user profile
 */
router.put('/:id', requireRole(PEOPLE_MANAGERS), updateUser);

/**
 * PUT /people/:id/lifecycle
 * Transition user to a new lifecycle state
 */
router.put('/:id/lifecycle', requireRole(PEOPLE_MANAGERS), updateUserLifecycle);

/**
 * DELETE /people/:id
 * Archive a user (soft delete)
 */
router.delete('/:id', requireRole(PEOPLE_MANAGERS), deleteUser);

/**
 * POST /people/:id/assign-org
 * Assign user to department and teams
 */
router.post('/:id/assign-org', requireRole(PEOPLE_MANAGERS), assignUserOrg);

/**
 * Reporting lines routes
 * Nested under /:id/reporting-line
 */
router.use('/:id/reporting-line', reportingLinesRoutes);

export default router;
