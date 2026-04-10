// server/src/routes/integrations.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
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
router.post('/connect', requireRole(['super_admin', 'ops_admin']), connectIntegration);
router.put('/:id', requireRole(['super_admin', 'ops_admin']), updateIntegration);
router.put('/:id/field-mapping', requireRole(['super_admin', 'ops_admin']), updateFieldMapping);
router.post('/:id/sync', requireRole(['super_admin', 'ops_admin']), syncIntegration);
router.post('/:id/disconnect', requireRole(['super_admin']), disconnectIntegration);

export default router;
