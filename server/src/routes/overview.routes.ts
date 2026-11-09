// server/src/routes/overview.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getDashboardStats,
  getSetupProgress,
  getRecentActivity,
  getOverviewInsights,
} from '../controllers/overview.controller';
import {
  getInsights,
  runIntelligence,
  resolveInsight,
  dismissInsight,
  executeAutoFix,
} from '../controllers/intelligence.controller';
import { requireRole } from '../middleware/requireRole';
import { ROLES } from '../constants/roles';

// WI-09: insight write actions restricted to admin roles
const INSIGHT_ADMINS = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_ADMIN, ROLES.IT_ADMIN, ROLES.OPS_ADMIN];

const router = Router();

// All overview routes require authentication
router.use(requireAuth);

// Dashboard stats
router.get('/stats', getDashboardStats);

// Setup progress
router.get('/setup-progress', getSetupProgress);

// Recent activity
router.get('/recent-activity', getRecentActivity);

// Insights (overview-specific)
router.get('/insights', getOverviewInsights);

// Intelligence (general)
router.get('/intelligence', getInsights);
router.post('/intelligence/run', requireRole(INSIGHT_ADMINS), runIntelligence);
router.put('/intelligence/:id/resolve', requireRole(INSIGHT_ADMINS), resolveInsight);
router.put('/intelligence/:id/dismiss', requireRole(INSIGHT_ADMINS), dismissInsight);
router.post('/intelligence/:id/auto-fix', requireRole(INSIGHT_ADMINS), executeAutoFix);

export default router;
