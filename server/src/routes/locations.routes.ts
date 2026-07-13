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
  getLocationUsers,
  getLocationPolicies,
  getLocationEffectiveSettings,
  assignPolicyToLocation,
  removeLocationPolicy,
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
router.get('/:id/users', getLocationUsers);
router.get('/:id/policies', getLocationPolicies);
router.get('/:id/effective-settings', getLocationEffectiveSettings);

router.post('/', requireRole(LOCATION_MANAGERS), createLocation);
router.put('/:id', requireRole(LOCATION_MANAGERS), updateLocation);
router.delete('/:id', requireRole(LOCATION_MANAGERS), deleteLocation);

router.post('/:id/assign-policy', requireRole(LOCATION_MANAGERS), assignPolicyToLocation);
router.delete('/:id/policies/:policyVersionId', requireRole(LOCATION_MANAGERS), removeLocationPolicy);

export default router;
