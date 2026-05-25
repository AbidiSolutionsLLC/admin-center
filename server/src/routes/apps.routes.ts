// server/src/routes/apps.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { PERMISSION_GROUPS } from '../constants/roles';
import {
  getApps,
  getAppById,
  createApp,
  updateApp,
  deleteApp,
  assignApp,
  revokeApp,
  getAppAssignmentTimeline,
  checkAppDependencies,
  getAppUsers,
  getAppAssignmentsByTarget,
} from '../controllers/apps.controller';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Public read routes (any authenticated user can view apps)
router.get('/', getApps);
router.get('/target/:target_type/:target_id', getAppAssignmentsByTarget);
router.get('/:id', getAppById);
router.get('/:id/timeline', getAppAssignmentTimeline);
router.get('/:id/users', getAppUsers);
router.get('/:id/dependencies', checkAppDependencies);

// Mutation routes - restricted to Super Admin, IT Admin
router.post('/', requireRole(PERMISSION_GROUPS.IT_ADMINS), createApp);
router.put('/:id', requireRole(PERMISSION_GROUPS.IT_ADMINS), updateApp);
router.delete('/:id', requireRole(PERMISSION_GROUPS.IT_ADMINS), deleteApp);
router.post('/:id/assign', requireRole(PERMISSION_GROUPS.IT_ADMINS), assignApp);
router.post('/:id/revoke', requireRole(PERMISSION_GROUPS.IT_ADMINS), revokeApp);

export default router;
