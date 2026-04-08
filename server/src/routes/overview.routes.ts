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
} from '../controllers/intelligence.controller';

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
router.post('/intelligence/run', runIntelligence);
router.put('/intelligence/:id/resolve', resolveInsight);

export default router;
