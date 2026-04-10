// server/src/routes/people.routes.ts
import { Router } from 'express';
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
} from '../controllers/people.controller';
import { assignUserOrg } from '../controllers/organization.controller';
import reportingLinesRoutes from './reportingLines.routes';

const router = Router();

/**
 * All routes require authentication (requireAuth middleware applied in index.ts)
 * All routes are scoped to req.user.company_id from JWT
 */

/**
 * GET /people
 * List all users with optional filters
 * Query params: lifecycle_state, department_id, employment_type, search
 */
router.get('/', getUsers);

/**
 * GET /people/:id
 * Get a single user by ID
 */
router.get('/:id', getUserById);

/**
 * POST /people/invite
 * Invite a new user (sends welcome email)
 */
router.post('/invite', inviteUser);

/**
 * POST /people/bulk-invite
 * Bulk invite up to 500 users
 */
router.post('/bulk-invite', bulkInviteUsers);

/**
 * PUT /people/:id
 * Update user profile information
 */
router.put('/:id', updateUser);

/**
 * PUT /people/:id/lifecycle
 * Transition user to a new lifecycle state
 */
router.put('/:id/lifecycle', updateUserLifecycle);

/**
 * DELETE /people/:id
 * Archive a user (soft delete)
 */
router.delete('/:id', deleteUser);

/**
 * POST /people/:id/assign-org
 * Assign user to department and teams
 */
router.post('/:id/assign-org', assignUserOrg);

/**
 * Reporting lines routes
 * All routes are nested under /:id/reporting-line
 */
router.use('/:id/reporting-line', reportingLinesRoutes);

/**
 * PUT /people/bulk-lifecycle
 * Bulk lifecycle state change for multiple users
 */
router.put('/bulk-lifecycle', bulkUpdateLifecycle);

/**
 * POST /people/bulk-assign-role
 * Bulk assign a role to multiple users
 */
router.post('/bulk-assign-role', bulkAssignRole);

/**
 * GET /people/export
 * Export users as CSV
 */
router.get('/export', exportUsers);

export default router;
