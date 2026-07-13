// server/src/routes/workSchedules.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getWorkSchedules,
  getWorkScheduleById,
  createWorkSchedule,
  updateWorkSchedule,
  deleteWorkSchedule,
  getWorkScheduleAssignments,
  getWorkScheduleAssignmentsByLocation,
  createWorkScheduleAssignment,
  updateWorkScheduleAssignment,
  deleteWorkScheduleAssignment,
  getUserWorkSchedule,
  getLocationWorkSchedule,
} from '../controllers/workSchedules.controller';

import { PERMISSION_GROUPS } from '../constants/roles';

const router = Router();

router.use(requireAuth);

const SCHEDULE_ADMINS = PERMISSION_GROUPS.OPS_ADMINS;

// ── Work Schedule Routes ─────────────────────────────────────────────────────

// Static Routes
router.get('/', getWorkSchedules);

// Parameterized Routes
router.get('/:id', getWorkScheduleById);
router.put('/:id', requireRole(SCHEDULE_ADMINS), updateWorkSchedule);
router.delete('/:id', requireRole(SCHEDULE_ADMINS), deleteWorkSchedule);

router.post('/', requireRole(SCHEDULE_ADMINS), createWorkSchedule);

// ── Assignment Routes ────────────────────────────────────────────────────────

router.get('/assignments', getWorkScheduleAssignments);
router.get('/assignments/location/:location_id', getWorkScheduleAssignmentsByLocation);
router.post('/assignments', requireRole(SCHEDULE_ADMINS), createWorkScheduleAssignment);
router.put('/assignments/:id', requireRole(SCHEDULE_ADMINS), updateWorkScheduleAssignment);
router.delete('/assignments/:id', requireRole(SCHEDULE_ADMINS), deleteWorkScheduleAssignment);

// ── Integration Routes ───────────────────────────────────────────────────────

router.get('/integrations/user-schedule/:user_id', getUserWorkSchedule);
router.get('/integrations/location-schedule/:location_id', getLocationWorkSchedule);

export default router;
