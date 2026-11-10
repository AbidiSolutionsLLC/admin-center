import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { PERMISSION_GROUPS } from '../constants/roles';
import {
  getIpRestrictions,
  createIpRestriction,
  updateIpRestriction,
  deleteIpRestriction,
  toggleGlobalIpRestrictions,
  getGlobalIpRestrictionsStatus
} from '../controllers/ipRestrictions.controller';

const router = Router();

// Protect all routes
router.use(requireAuth);

router.get('/global-status', requireRole(PERMISSION_GROUPS.IT_ADMINS), getGlobalIpRestrictionsStatus);
router.put('/global-toggle', requireRole(PERMISSION_GROUPS.IT_ADMINS), toggleGlobalIpRestrictions);

router.get('/', requireRole(PERMISSION_GROUPS.IT_ADMINS), getIpRestrictions);
router.post('/', requireRole(PERMISSION_GROUPS.IT_ADMINS), createIpRestriction);
router.put('/:id', requireRole(PERMISSION_GROUPS.IT_ADMINS), updateIpRestriction);
router.delete('/:id', requireRole(PERMISSION_GROUPS.IT_ADMINS), deleteIpRestriction);

export default router;
