// server/src/routes/intelligence.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getInsights,
  getInsightHistory,
  runIntelligence,
  resolveInsight,
  dismissInsight,
  executeAutoFix,
} from '../controllers/intelligence.controller';

const router = Router();

router.use(requireAuth); // All intelligence routes require auth

router.get('/', getInsights);
router.get('/history', getInsightHistory);
router.post('/run', runIntelligence);
router.put('/:id/resolve', resolveInsight);
router.put('/:id/dismiss', dismissInsight);
router.post('/:id/auto-fix', executeAutoFix);

export default router;
