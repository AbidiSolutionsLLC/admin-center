// server/src/routes/intelligence.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { ROLES } from '../constants/roles';
import {
  getInsights,
  getInsightHistory,
  runIntelligence,
  resolveInsight,
  dismissInsight,
  executeAutoFix,
} from '../controllers/intelligence.controller';

const router = Router();

// WI-09: insight write actions (run / resolve / dismiss / auto-fix) restricted to admin roles
const INSIGHT_ADMINS = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_ADMIN, ROLES.IT_ADMIN, ROLES.OPS_ADMIN];

router.use(requireAuth); // All intelligence routes require auth

router.get('/', getInsights);
router.get('/history', getInsightHistory);
router.post('/run', requireRole(INSIGHT_ADMINS), runIntelligence);
router.put('/:id/resolve', requireRole(INSIGHT_ADMINS), resolveInsight);
router.put('/:id/dismiss', requireRole(INSIGHT_ADMINS), dismissInsight);
router.post('/:id/auto-fix', requireRole(INSIGHT_ADMINS), executeAutoFix);

export default router;
