import { Router } from 'express';
import healthRoutes from './health.routes';
import { requireAuth } from '../middleware/auth';
import authRoutes from './auth.routes';
import organizationRoutes from './organization.routes';
import intelligenceRoutes from './intelligence.routes';
import peopleRoutes from './people.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/organization', requireAuth, organizationRoutes);
router.use('/intelligence', requireAuth, intelligenceRoutes);
router.use('/people', requireAuth, peopleRoutes);

// Protected test route for verifying JWT rejection logic
router.get('/protected-test', requireAuth, (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

export default router;
