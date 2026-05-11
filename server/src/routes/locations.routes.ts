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

import { PERMISSION_GROUPS } from '../constants/roles';

const router = Router();

router.use(requireAuth);

const LOCATION_MANAGERS = PERMISSION_GROUPS.OPS_ADMINS;

// ── Static Routes ────────────────────────────────────────────────────────────
router.get('/tree', getLocationTree);
router.get('/', getLocations);

// ── Parameterized Routes ─────────────────────────────────────────────────────
router.get('/:id', getLocationById);

router.post('/', requireRole(LOCATION_MANAGERS), createLocation);
router.put('/:id', requireRole(LOCATION_MANAGERS), updateLocation);
router.delete('/:id', requireRole(LOCATION_MANAGERS), deleteLocation);

export default router;
