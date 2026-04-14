import { Router } from 'express';
import healthRoutes from './health.routes';
import { requireAuth } from '../middleware/auth';
import authRoutes from './auth.routes';
import organizationRoutes from './organization.routes';
import intelligenceRoutes from './intelligence.routes';
import peopleRoutes from './people.routes';
import { verifyInviteToken } from '../controllers/people.controller';
import rolesRoutes from './roles.routes';
import appsRoutes from './apps.routes';
import overviewRoutes from './overview.routes';
import securityRoutes from './security.routes';
import auditLogsRoutes from './auditLogs.routes';
import teamsRoutes from './teams.routes';
import policiesRoutes from './policies.routes';
import locationsRoutes from './locations.routes';
import dataFieldsRoutes from './dataFields.routes';
import integrationsRoutes from './integrations.routes';
import workflowsRoutes from './workflows.routes';
import notificationsRoutes from './notifications.routes';
import companyRoutes from './company.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/organization', requireAuth, organizationRoutes);
router.use('/intelligence', requireAuth, intelligenceRoutes);
router.post('/people/verify-invite', verifyInviteToken); // Public endpoint for onboarding
router.use('/people', requireAuth, peopleRoutes);
router.use('/roles', rolesRoutes);
router.use('/apps', appsRoutes);
router.use('/overview', overviewRoutes);
router.use('/security', securityRoutes);
router.use('/audit-logs', auditLogsRoutes);
router.use('/teams', requireAuth, teamsRoutes);
router.use('/policies', requireAuth, policiesRoutes);
router.use('/locations', requireAuth, locationsRoutes);
router.use('/data-fields', requireAuth, dataFieldsRoutes);
router.use('/integrations', requireAuth, integrationsRoutes);
router.use('/workflows', requireAuth, workflowsRoutes);
router.use('/notifications', requireAuth, notificationsRoutes);
router.use('/company', companyRoutes); // FIX-03: Company settings routes

// Protected test route for verifying JWT rejection logic
router.get('/protected-test', requireAuth, (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

export default router;
