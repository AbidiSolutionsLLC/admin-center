// server/src/routes/locations.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getLocations,
  getLocationById,
  createLocation,
  updateLocation,
  deleteLocation,
} from '../controllers/locations.controller';

const router = Router();

router.use(requireAuth);

// GET /locations — list all active locations
router.get('/', getLocations);

// GET /locations/:id — get single location
router.get('/:id', getLocationById);

// POST /locations — create (requires admin role)
router.post('/', requireRole(['super_admin', 'ops_admin']), createLocation);

// PUT /locations/:id — update (requires admin role)
router.put('/:id', requireRole(['super_admin', 'ops_admin']), updateLocation);

// DELETE /locations/:id — delete (requires super_admin)
router.delete('/:id', requireRole(['super_admin']), deleteLocation);

export default router;
