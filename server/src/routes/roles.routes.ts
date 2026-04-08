// server/src/routes/roles.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getRolePermissions,
  updateRolePermissions,
  getAllPermissions,
  simulatePermissions,
  getRoleUsers,
} from '../controllers/roles.controller';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Public read routes (any authenticated user can view roles)
router.get('/', getRoles);
router.get('/permissions/all', getAllPermissions);
router.get('/:id', getRoleById);
router.get('/:id/permissions', getRolePermissions);
router.get('/:id/users', getRoleUsers);

// Permission simulation (any authenticated user)
router.post('/simulate-permissions', simulatePermissions);

// Mutation routes - restricted to Super Admin, HR Admin, and IT Admin only
router.post('/', requireRole(['Super Admin', 'HR Admin', 'IT Admin']), createRole);
router.put('/:id', requireRole(['Super Admin', 'HR Admin', 'IT Admin']), updateRole);
router.put(
  '/:id/permissions',
  requireRole(['Super Admin', 'HR Admin', 'IT Admin']),
  updateRolePermissions
);

// Delete route - Super Admin only (most restrictive)
router.delete('/:id', requireRole(['Super Admin']), deleteRole);

export default router;
