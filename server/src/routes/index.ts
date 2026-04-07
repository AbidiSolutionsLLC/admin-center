import { Router } from 'express';
import healthRoutes from './health.routes';
import { requireAuth } from '../middleware/auth';
import authRoutes from './auth.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// Protected test route for verifying JWT rejection logic
router.get('/protected-test', requireAuth, (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

export default router;
