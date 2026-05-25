import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { PERMISSION_GROUPS } from '../constants/roles';
import {
  getGroups,
  getGroupById,
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupUsers,
  addUsersToGroup,
  removeUsersFromGroup
} from '../controllers/groups.controller';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Static path segments must be registered BEFORE parameterized routes

// ── GET Routes ──────────────────────────────────────────────────────────────
router.get('/', getGroups);
router.get(
  '/:id/users',
  requireRole(PERMISSION_GROUPS.ROLE_ADMINS),
  getGroupUsers
);
router.get('/:id', getGroupById);

// ── POST Routes ─────────────────────────────────────────────────────────────
router.post(
  '/',
  requireRole(PERMISSION_GROUPS.ROLE_ADMINS),
  createGroup
);

router.post(
  '/:id/users',
  requireRole(PERMISSION_GROUPS.ROLE_ADMINS),
  addUsersToGroup
);

// ── PUT Routes ──────────────────────────────────────────────────────────────
router.put(
  '/:id',
  requireRole(PERMISSION_GROUPS.ROLE_ADMINS),
  updateGroup
);

// ── DELETE Routes ───────────────────────────────────────────────────────────
// We use DELETE /:id/users with a body containing userIds, or a generic bulk remove.
// Standard REST for bulk remove is tricky with DELETE body. Let's use POST for remove?
// Actually, standard delete shouldn't usually have a body. Express allows it though.
// But we mapped it to removeUsersFromGroup which expects `req.body.userIds`. Let's use DELETE.
router.delete(
  '/:id/users',
  requireRole(PERMISSION_GROUPS.ROLE_ADMINS),
  removeUsersFromGroup
);

router.delete(
  '/:id',
  requireRole(PERMISSION_GROUPS.SUPER_ADMINS),
  deleteGroup
);

export default router;
