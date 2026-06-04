// server/src/routes/security.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { PERMISSION_GROUPS } from '../constants/roles';
import {
  getSecurityPolicies,
  createSecurityPolicy,
  updateSecurityPolicy,
  deleteSecurityPolicy,
  getSecurityEvents,
  forceLogoutUser,
} from '../controllers/security.controller';

const router = Router();

// All security routes require authentication
router.use(requireAuth);

// Policy routes
router.get('/policies', getSecurityPolicies);
router.post('/policies', requireRole(PERMISSION_GROUPS.IT_ADMINS), createSecurityPolicy);
router.put('/policies/:id', requireRole(PERMISSION_GROUPS.IT_ADMINS), updateSecurityPolicy);
router.delete('/policies/:id', requireRole(PERMISSION_GROUPS.IT_ADMINS), deleteSecurityPolicy);

// Events / access log routes
router.get('/events', getSecurityEvents);

// Session management routes
router.post('/force-logout/:userId', requireRole(PERMISSION_GROUPS.IT_ADMINS), forceLogoutUser);

export default router;
