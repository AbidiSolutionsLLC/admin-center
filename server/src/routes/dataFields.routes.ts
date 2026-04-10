// server/src/routes/dataFields.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getCustomFields,
  getCustomFieldById,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  reorderCustomFields,
} from '../controllers/dataFields.controller';

const router = Router();

router.use(requireAuth);

router.get('/', getCustomFields);
router.get('/:id', getCustomFieldById);
router.post('/', requireRole(['super_admin', 'ops_admin']), createCustomField);
router.put('/:id', requireRole(['super_admin', 'ops_admin']), updateCustomField);
router.put('/reorder', requireRole(['super_admin', 'ops_admin']), reorderCustomFields);
router.delete('/:id', requireRole(['super_admin']), deleteCustomField);

export default router;
