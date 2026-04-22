// server/src/routes/reportingLines.routes.ts
import { Router } from 'express';
import { requireRole } from '../middleware/requireRole';
import {
  getReportingLine,
  addSecondaryManager,
  removeSecondaryManager,
  changePrimaryManager,
} from '../controllers/reportingLines.controller';

import { PERMISSION_GROUPS } from '../constants/roles';

const router = Router({ mergeParams: true }); // Important to access :id from parent router

const PEOPLE_MANAGERS = [...PERMISSION_GROUPS.PEOPLE_ADMINS];

/**
 * All routes require authentication (requireAuth middleware applied in parent route)
 * All routes are scoped to req.user.company_id from JWT
 */

/**
 * GET /people/:id/reporting-line
 * Get the full reporting line for a user (primary, secondaries, direct reports)
 */
router.get('/', getReportingLine);

/**
 * POST /people/:id/reporting-line/secondary
 * Add a secondary manager to a user
 */
router.post('/secondary', requireRole(PEOPLE_MANAGERS), addSecondaryManager);

/**
 * DELETE /people/:id/reporting-line/secondary/:managerId
 * Remove a secondary manager from a user
 */
router.delete('/secondary/:managerId', requireRole(PEOPLE_MANAGERS), removeSecondaryManager);

/**
 * PUT /people/:id/reporting-line/primary
 * Change the primary manager for a user
 */
router.put('/primary', requireRole(PEOPLE_MANAGERS), changePrimaryManager);

export default router;
