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
  getFieldUsage,
  getFieldDependents,
  getFieldVersions,
  rollbackFieldVersion,
  seedDefaultFields,
  validateFieldValues,
  getEffectiveCustomFields,
  getProfileLayouts,
  getProfileLayoutById,
  createProfileLayout,
  updateProfileLayout,
  deleteProfileLayout,
} from '../controllers/dataFields.controller';

const router = Router();

router.use(requireAuth);

// Layout routes (must be before /:id routes to avoid matching 'layouts' as an id)
router.get('/layouts', getProfileLayouts);
router.get('/layouts/:id', getProfileLayoutById);
router.post('/layouts', requireRole(['Super Admin', 'Ops Admin']), createProfileLayout);
router.put('/layouts/:id', requireRole(['Super Admin', 'Ops Admin']), updateProfileLayout);
router.delete('/layouts/:id', requireRole(['Super Admin']), deleteProfileLayout);

// System defaults and validation
router.post('/seed-defaults', requireRole(['Super Admin']), seedDefaultFields);
router.post('/validate', validateFieldValues);
router.get('/effective', getEffectiveCustomFields);

// Standard CRUD
router.get('/', getCustomFields);
router.get('/:id', getCustomFieldById);

// Field-specific operations
router.get('/:id/usage', getFieldUsage);
router.get('/:id/dependents', getFieldDependents);
router.get('/:id/versions', getFieldVersions);
router.post('/:id/rollback', requireRole(['Super Admin', 'Ops Admin']), rollbackFieldVersion);

// Mutations
router.post('/', requireRole(['Super Admin', 'Ops Admin']), createCustomField);
router.put('/reorder', requireRole(['Super Admin', 'Ops Admin']), reorderCustomFields);
router.put('/:id', requireRole(['Super Admin', 'Ops Admin']), updateCustomField);
router.delete('/:id', requireRole(['Super Admin']), deleteCustomField);

export default router;
