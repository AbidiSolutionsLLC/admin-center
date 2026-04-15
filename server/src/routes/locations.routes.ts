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

const LOCATION_MANAGERS = ['Super Admin', 'Ops Admin'];

// ── Static Routes ────────────────────────────────────────────────────────────
router.get('/tree', getLocationTree);
router.get('/', getLocations);

// ── Parameterized Routes ─────────────────────────────────────────────────────
router.get('/:id', getLocationById);

router.post('/', requireRole(LOCATION_MANAGERS), createLocation);
router.put('/:id', requireRole(LOCATION_MANAGERS), updateLocation);
router.delete('/:id', requireRole(LOCATION_MANAGERS), deleteLocation);

export default router;
