// server/src/routes/intelligence.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getInsights,
  runIntelligence,
  resolveInsight,
} from '../controllers/intelligence.controller';

const router = Router();

router.use(requireAuth); // All intelligence routes require auth

router.get('/', getInsights);
router.post('/run', runIntelligence);
router.put('/:id/resolve', resolveInsight);

export default router;
