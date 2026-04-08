import { Router } from 'express';
import healthRoutes from './health.routes';
import { requireAuth } from '../middleware/auth';
import authRoutes from './auth.routes';
import organizationRoutes from './organization.routes';
import intelligenceRoutes from './intelligence.routes';
import peopleRoutes from './people.routes';
import rolesRoutes from './roles.routes';
import appsRoutes from './apps.routes';
import overviewRoutes from './overview.routes';
import securityRoutes from './security.routes';
import auditLogsRoutes from './auditLogs.routes';
import teamsRoutes from './teams.routes';
import policiesRoutes from './policies.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/organization', requireAuth, organizationRoutes);
router.use('/intelligence', requireAuth, intelligenceRoutes);
router.use('/people', requireAuth, peopleRoutes);
router.use('/roles', rolesRoutes);
router.use('/apps', appsRoutes);
router.use('/overview', overviewRoutes);
router.use('/security', securityRoutes);
router.use('/audit-logs', auditLogsRoutes);
router.use('/teams', requireAuth, teamsRoutes);
router.use('/policies', requireAuth, policiesRoutes);

// Protected test route for verifying JWT rejection logic
router.get('/protected-test', requireAuth, (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

export default router;
