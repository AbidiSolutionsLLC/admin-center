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
import approvalsRoutes from './approvals.routes';
import notificationsRoutes from './notifications.routes';
import companyRoutes from './company.routes';
import groupsRoutes from './groups.routes';
import accessControlPoliciesRoutes from './accessControlPolicies.routes';
import dataGovernancePoliciesRoutes from './dataGovernancePolicies.routes';
import policyTemplatesRoutes from './policyTemplates.routes';
import workflowTemplatesRoutes from './workflowTemplates.routes';

const router = Router();

// Roles should be high priority
router.use('/roles', rolesRoutes);
router.use('/groups', groupsRoutes);


router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/organization', organizationRoutes);
router.use('/intelligence', intelligenceRoutes);
router.post('/people/verify-invite', verifyInviteToken); // Public endpoint for onboarding
router.use('/people', peopleRoutes);
router.use('/apps', appsRoutes);
router.use('/overview', overviewRoutes);
router.use('/security', securityRoutes);
router.use('/audit-logs', auditLogsRoutes);
router.use('/teams', teamsRoutes);
router.use('/policies', policiesRoutes);
router.use('/locations', locationsRoutes);
router.use('/data-fields', dataFieldsRoutes);
router.use('/integrations', integrationsRoutes);
router.use('/workflows', workflowsRoutes);
router.use('/approvals', approvalsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/company', companyRoutes); // FIX-03: Company settings routes
router.use('/access-control-policies', accessControlPoliciesRoutes);
router.use('/data-governance-policies', dataGovernancePoliciesRoutes);
router.use('/policy-templates', policyTemplatesRoutes);
router.use('/workflow-templates', workflowTemplatesRoutes);

// Protected test route for verifying JWT rejection logic
router.get('/protected-test', requireAuth, (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

export default router;
