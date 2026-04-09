// server/src/routes/reportingLines.routes.ts
import { Router } from 'express';
import {
  getReportingLine,
  addSecondaryManager,
  removeSecondaryManager,
  changePrimaryManager,
} from '../controllers/reportingLines.controller';

const router = Router();

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
router.post('/secondary', addSecondaryManager);

/**
 * DELETE /people/:id/reporting-line/secondary/:managerId
 * Remove a secondary manager from a user
 */
router.delete('/secondary/:managerId', removeSecondaryManager);

/**
 * PUT /people/:id/reporting-line/primary
 * Change the primary manager for a user
 */
router.put('/primary', changePrimaryManager);

export default router;
