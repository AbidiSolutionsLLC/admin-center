// server/src/routes/locations.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getLocations,
  getLocationTree,
  getLocationById,
  createLocation,
  updateLocation,
  deleteLocation,
} from '../controllers/locations.controller';

const router = Router();

router.use(requireAuth);

router.get('/', getLocations);
router.get('/tree', getLocationTree);
router.get('/:id', getLocationById);
router.post('/', requireRole(['super_admin', 'ops_admin']), createLocation);
router.put('/:id', requireRole(['super_admin', 'ops_admin']), updateLocation);
router.delete('/:id', requireRole(['super_admin']), deleteLocation);

export default router;
