// server/src/routes/integrations.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { ROLES } from '../constants/roles';
import {
  getIntegrations,
  getIntegrationById,
  connectIntegration,
  updateIntegration,
  syncIntegration,
  disconnectIntegration,
  getSyncLogs,
  updateFieldMapping,
} from '../controllers/integrations.controller';

const router = Router();

router.use(requireAuth);

router.get('/', getIntegrations);
router.get('/:id', getIntegrationById);
router.get('/:id/sync-logs', getSyncLogs);
router.post('/connect', requireRole([ROLES.SUPER_ADMIN, ROLES.OPS_ADMIN]), connectIntegration);
router.put('/:id', requireRole([ROLES.SUPER_ADMIN, ROLES.OPS_ADMIN]), updateIntegration);
router.put('/:id/field-mapping', requireRole([ROLES.SUPER_ADMIN, ROLES.OPS_ADMIN]), updateFieldMapping);
router.post('/:id/sync', requireRole([ROLES.SUPER_ADMIN, ROLES.OPS_ADMIN]), syncIntegration);
router.post('/:id/disconnect', requireRole([ROLES.SUPER_ADMIN]), disconnectIntegration);

export default router;
