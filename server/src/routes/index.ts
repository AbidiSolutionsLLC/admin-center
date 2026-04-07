import { Router } from 'express';
import healthRoutes from './health.routes';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use('/health', healthRoutes);

// Protected test route for verifying JWT rejection logic
router.get('/protected-test', requireAuth, (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

export default router;
