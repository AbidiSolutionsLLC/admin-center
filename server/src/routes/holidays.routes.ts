// server/src/routes/holidays.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getHolidayCalendars,
  getHolidayCalendarsTree,
  getHolidayCalendarById,
  createHolidayCalendar,
  updateHolidayCalendar,
  deleteHolidayCalendar,
  getHolidaysByCalendar,
  getHolidayById,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getHolidayAssignments,
  getHolidayAssignmentsByLocation,
  createHolidayAssignment,
  updateHolidayAssignment,
  deleteHolidayAssignment,
  getHolidaysForAttendance,
  getLocationsWithHolidayCalendars,
  getAllCompanyHolidays,
  createBulkHolidayCalendars,
  createBulkHolidays,
  deleteBulkHolidayAssignments,
  moveHoliday,
  exportHolidays,
  importHolidays,
} from '../controllers/holidays.controller';

import { PERMISSION_GROUPS } from '../constants/roles';

const router = Router();

router.use(requireAuth);

const HOLLYDAY_ADMINS = PERMISSION_GROUPS.OPS_ADMINS;

// ── Holiday Calendar Routes ─────────────────────────────────────────────────────

// Static Routes
router.get('/calendars/tree', getHolidayCalendarsTree);
router.get('/calendars', getHolidayCalendars);

// Parameterized Routes
router.get('/calendars/:id', getHolidayCalendarById);
router.put('/calendars/:id', requireRole(HOLLYDAY_ADMINS), updateHolidayCalendar);
router.delete('/calendars/:id', requireRole(HOLLYDAY_ADMINS), deleteHolidayCalendar);

router.post('/calendars', requireRole(HOLLYDAY_ADMINS), createHolidayCalendar);

// Holiday Routes
router.get('/calendars/:calendar_id/holidays', getHolidaysByCalendar);
router.get('/calendar/:calendar_id/holiday/:holiday_id', getHolidayById);
router.post('/calendars/:calendar_id/holidays', requireRole(HOLLYDAY_ADMINS), createHoliday);
router.put('/holidays/:holiday_id', requireRole(HOLLYDAY_ADMINS), updateHoliday);
router.delete('/holidays/:holiday_id', requireRole(HOLLYDAY_ADMINS), deleteHoliday);
router.post('/calendars/:calendar_id/holidays/export', exportHolidays);
router.post('/holidays/import', requireRole(HOLLYDAY_ADMINS), importHolidays);

// Holiday Assignment Routes
router.get('/assignments', getHolidayAssignments);
router.get('/assignments/location/:location_id', getHolidayAssignmentsByLocation);
router.post('/assignments', requireRole(HOLLYDAY_ADMINS), createHolidayAssignment);
router.put('/assignments/:id', requireRole(HOLLYDAY_ADMINS), updateHolidayAssignment);
router.delete('/assignments/:id', requireRole(HOLLYDAY_ADMINS), deleteHolidayAssignment);

// Bulk Operations Routes
router.post('/calendars/bulk', requireRole(HOLLYDAY_ADMINS), createBulkHolidayCalendars);
router.post('/calendars/:calendar_id/holidays/bulk', requireRole(HOLLYDAY_ADMINS), createBulkHolidays);
router.delete('/assignments/bulk', requireRole(HOLLYDAY_ADMINS), deleteBulkHolidayAssignments);

// Holiday Movement Routes
router.post('/holiday/move', requireRole(HOLLYDAY_ADMINS), moveHoliday);

// Integration Routes
router.get('/integrations/attendance/holidays', getHolidaysForAttendance);
router.get('/integrations/attendance/locations', getLocationsWithHolidayCalendars);
router.get('/integrations/attendance/all-company-holidays', getAllCompanyHolidays);

export default router;