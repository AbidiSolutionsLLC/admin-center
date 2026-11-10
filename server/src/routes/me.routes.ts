import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getMyApps } from '../controllers/appAccess.controller';

const router = Router();
router.use(requireAuth);
router.get('/apps', getMyApps);

export default router;
