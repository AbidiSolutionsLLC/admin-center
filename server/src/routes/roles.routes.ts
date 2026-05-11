// server/src/routes/roles.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { PERMISSION_GROUPS } from '../constants/roles';
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
  assignRoleToUser,
  unassignRoleFromUser,
  getAccessMap,
} from '../controllers/roles.controller';

const router = Router();
console.log('ROLES ROUTES LOADED');

// All routes require authentication
router.use(requireAuth);

// ── GET Routes ──────────────────────────────────────────────────────────────

// Static GET routes first
router.get('/', getRoles);
router.get('/permissions/all', getAllPermissions);
router.get('/access-map', getAccessMap);

// Parameterized GET routes
router.get('/:id/permissions', getRolePermissions);
router.get(
  '/:id/users',
  requireRole(PERMISSION_GROUPS.ROLE_ADMINS),
  getRoleUsers
);

router.post(
  '/:id/users',
  requireRole(PERMISSION_GROUPS.ROLE_ADMINS),
  assignRoleToUser
);

router.delete(
  '/:id/users/:userId',
  requireRole(PERMISSION_GROUPS.ROLE_ADMINS),
  unassignRoleFromUser
);

// Generic parameterized GET route last
router.get('/:id', getRoleById);

// ── POST Routes ─────────────────────────────────────────────────────────────

// Static POST routes first
router.post(
  '/simulate-permissions',
  requireRole(PERMISSION_GROUPS.ROLE_ADMINS),
  simulatePermissions
);

// Generic POST route
router.post(
  '/',
  requireRole(PERMISSION_GROUPS.ROLE_ADMINS),
  createRole
);

// ── PUT Routes ──────────────────────────────────────────────────────────────

// Sub-path PUT routes
router.put(
  '/:id/permissions',
  requireRole(PERMISSION_GROUPS.ROLE_ADMINS),
  updateRolePermissions
);

// Generic parameterized PUT route last
router.put(
  '/:id',
  requireRole(PERMISSION_GROUPS.ROLE_ADMINS),
  updateRole
);

// ── DELETE Routes ───────────────────────────────────────────────────────────

router.delete(
  '/:id',
  requireRole(PERMISSION_GROUPS.SUPER_ADMINS),
  deleteRole
);

export default router;

