// server/src/routes/apps.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
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
} from '../controllers/apps.controller';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Public read routes (any authenticated user can view apps)
router.get('/', getApps);
router.get('/:id', getAppById);
router.get('/:id/timeline', getAppAssignmentTimeline);
router.get('/:id/users', getAppUsers);
router.get('/:id/dependencies', checkAppDependencies);

// Mutation routes - restricted to Super Admin, IT Admin, and Ops Admin
router.post('/', requireRole(['Super Admin', 'IT Admin']), createApp);
router.put('/:id', requireRole(['Super Admin', 'IT Admin']), updateApp);
router.delete('/:id', requireRole(['Super Admin', 'IT Admin']), deleteApp);
router.post('/:id/assign', requireRole(['Super Admin', 'IT Admin', 'Ops Admin']), assignApp);
router.post('/:id/revoke', requireRole(['Super Admin', 'IT Admin', 'Ops Admin']), revokeApp);

export default router;
