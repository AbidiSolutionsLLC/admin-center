// server/src/routes/locations.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getLocations,
<<<<<<< HEAD
=======
  getLocationTree,
>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e
  getLocationById,
  createLocation,
  updateLocation,
  deleteLocation,
} from '../controllers/locations.controller';

const router = Router();

router.use(requireAuth);

<<<<<<< HEAD
// GET /locations — list all active locations
router.get('/', getLocations);

// GET /locations/:id — get single location
router.get('/:id', getLocationById);

// POST /locations — create (requires admin role)
router.post('/', requireRole(['super_admin', 'ops_admin']), createLocation);

// PUT /locations/:id — update (requires admin role)
router.put('/:id', requireRole(['super_admin', 'ops_admin']), updateLocation);

// DELETE /locations/:id — delete (requires super_admin)
=======
router.get('/', getLocations);
router.get('/tree', getLocationTree);
router.get('/:id', getLocationById);
router.post('/', requireRole(['super_admin', 'ops_admin']), createLocation);
router.put('/:id', requireRole(['super_admin', 'ops_admin']), updateLocation);
>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e
router.delete('/:id', requireRole(['super_admin']), deleteLocation);

export default router;
