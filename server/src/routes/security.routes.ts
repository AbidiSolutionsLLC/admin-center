// server/src/routes/security.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getSecurityPolicy,
  updateSecurityPolicy,
  getSecurityEvents,
  forceLogoutUser,
} from '../controllers/security.controller';

const router = Router();

// All security routes require authentication
router.use(requireAuth);

// Policy routes
router.get('/policy', getSecurityPolicy);
router.put('/policy', requireRole(['super_admin', 'it_admin']), updateSecurityPolicy);

// Events / access log routes
router.get('/events', getSecurityEvents);

// Session management routes
router.post('/force-logout/:userId', requireRole(['super_admin', 'it_admin']), forceLogoutUser);

export default router;
