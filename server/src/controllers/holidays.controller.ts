// server/src/controllers/holidays.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { HolidayCalendar } from '../models/HolidayCalendar.model';
import { Holiday } from '../models/Holiday.model';
import { HolidayAssignment } from '../models/HolidayAssignment.model';
import { Location } from '../models/Location.model';
import { User } from '../models/User.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const CreateHolidayCalendarSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
  description: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
});

const UpdateHolidayCalendarSchema = CreateHolidayCalendarSchema.partial();

const CreateHolidaySchema = z.object({
  name: z.string().min(1, 'Holiday name is required').max(150),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  recurring_type: z.enum(['yearly', 'monthly', 'quarterly', 'custom']).default('yearly'),
  recurring_details: z.object({
    year: z.number().optional(),
    month: z.number().optional(),
    day: z.number().optional(),
    pattern: z.string().optional(),
    end_date: z.string().optional(),
  }).optional().nullable(),
  holiday_code: z.string().optional().nullable(),
  is_observed: z.boolean().default(false),
});

const UpdateHolidaySchema = CreateHolidaySchema.partial();

const CreateHolidayAssignmentSchema = z.object({
  location_id: z.string(),
  calendar_id: z.string(),
  is_primary: z.boolean().default(false),
  effective_date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  expiry_date: z.string().optional().nullable(),
});

const UpdateHolidayAssignmentSchema = CreateHolidayAssignmentSchema.partial();

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Enriches holiday calendars with location count
 */
async function enrichHolidayCalendars(
  calendars: any[]
): Promise<any[]> {
  const calendarIds = calendars.map((c) => c._id.toString());

  const assignments = await HolidayAssignment.find({
    calendar_id: { $in: calendarIds },
  }).lean();

  const countMap = new Map<string, number>();
  assignments.forEach((a) => {
    const key = a.calendar_id.toString();
    countMap.set(key, (countMap.get(key) || 0) + 1);
  });

  return calendars.map((calendar) => {
    const data = { ...calendar };
    const assignmentCount = countMap.get(calendar._id.toString()) ?? 0;
    return { ...data, assignment_count: assignmentCount };
  });
}

/**
 * Enriches holidays with calendar details
 */
async function enrichHolidays(
  holidays: any[],
  calendarId: string
): Promise<any[]> {
  const calendar = await HolidayCalendar.findById(calendarId).lean();
  const enriched = holidays.map((holiday) => {
    const data = { ...holiday };
    return {
      ...data,
      calendar_name: calendar?.name,
    };
  });

  return enriched;
}

// ── Holiday Calendar Controllers ───────────────────────────────────────────────

/**
 * GET /holidays/calendars
 * Returns all holiday calendars for the requesting company
 */
export const getHolidayCalendars = asyncHandler(async (req: Request, res: Response) => {
  const calendars = await HolidayCalendar.find({
    company_id: req.user.company_id,
  })
    .sort({ name: 1 })
    .lean();

  const enriched = await enrichHolidayCalendars(calendars);
  res.status(200).json({ success: true, data: enriched });
});

/**
 * GET /holidays/calendars/tree
 * Returns holiday calendars grouped by locations
 */
export const getHolidayCalendarsTree = asyncHandler(async (req: Request, res: Response) => {
  const [calendars, assignments] = await Promise.all([
    HolidayCalendar.find({
      company_id: req.user.company_id,
    })
      .sort({ name: 1 })
      .lean(),
    HolidayAssignment.find({
      company_id: req.user.company_id,
    })
      .populate('location_id', 'name type')
      .populate('calendar_id', 'name')
      .lean(),
  ]);

  const enriched = await enrichHolidayCalendars(calendars);

  const calendarMap = new Map<string, any>(
    enriched.map((calendar) => [calendar._id.toString(), { ...calendar, locations: [] }])
  );

  assignments.forEach((assignment) => {
    const calendar = calendarMap.get(assignment.calendar_id.toString());
    if (calendar) {
      calendar.locations.push({
        location_id: assignment.location_id._id,
        location_name: assignment.location_id.name,
        location_type: assignment.location_id.type,
        is_primary: assignment.is_primary,
        effective_date: assignment.effective_date,
        expiry_date: assignment.expiry_date,
      });
    }
  });

  const tree = Array.from(calendarMap.values());
  res.status(200).json({ success: true, data: tree });
});

/**
 * GET /holidays/calendars/:id
 * Returns a single holiday calendar by ID
 */
export const getHolidayCalendarById = asyncHandler(async (req: Request, res: Response) => {
  const calendar = await HolidayCalendar.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!calendar) {
    throw new AppError('Holiday calendar not found', 404, 'NOT_FOUND');
  }

  const assignments = await HolidayAssignment.find({
    calendar_id: calendar._id,
  }).populate('location_id', 'name type');

  const enriched = await enrichHolidayCalendars([calendar]);

  res.status(200).json({
    success: true,
    data: { ...enriched[0], locations: assignments },
  });
});

/**
 * POST /holidays/calendars
 * Creates a new holiday calendar
 */
export const createHolidayCalendar = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateHolidayCalendarSchema.parse(req.body);

  // Check for duplicate calendar name within the same company
  const existing = await HolidayCalendar.findOne({
    company_id: req.user.company_id,
    name: input.name,
  });

  if (existing) {
    throw new AppError(
      `A holiday calendar with the name "${input.name}" already exists.`,
      400,
      'DUPLICATE_HOLIDAY_CALENDAR_NAME'
    );
  }

  const calendar = await HolidayCalendar.create({
    ...input,
    company_id: req.user.company_id,
  });

  await auditLogger.log({
    req,
    action: 'holiday_calendar.created',
    module: 'holidays',
    object_type: 'HolidayCalendar',
    object_id: calendar._id.toString(),
    object_label: calendar.name,
    before_state: null,
    after_state: calendar.toObject(),
  });

  res.status(201).json({ success: true, data: calendar });
});

/**
 * PUT /holidays/calendars/:id
 * Updates an existing holiday calendar
 */
export const updateHolidayCalendar = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateHolidayCalendarSchema.parse(req.body);

  const calendar = await HolidayCalendar.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!calendar) {
    throw new AppError('Holiday calendar not found', 404, 'NOT_FOUND');
  }

  // If name is being changed, check for duplicate name
  if (input.name && input.name !== calendar.name) {
    const existing = await HolidayCalendar.findOne({
      company_id: req.user.company_id,
      name: input.name,
      _id: { $ne: req.params.id },
    });

    if (existing) {
      throw new AppError(
        `Another holiday calendar with the name "${input.name}" already exists.`,
        400,
        'DUPLICATE_HOLIDAY_CALENDAR_NAME'
      );
    }
  }

  const beforeState = calendar.toObject();

  Object.assign(calendar, input);
  await calendar.save();

  await auditLogger.log({
    req,
    action: 'holiday_calendar.updated',
    module: 'holidays',
    object_type: 'HolidayCalendar',
    object_id: calendar._id.toString(),
    object_label: calendar.name,
    before_state: beforeState,
    after_state: calendar.toObject(),
  });

  res.status(200).json({ success: true, data: calendar });
});

/**
 * DELETE /holidays/calendars/:id
 * Deletes a holiday calendar. Blocked if assignments exist.
 */
export const deleteHolidayCalendar = asyncHandler(async (req: Request, res: Response) => {
  const calendar = await HolidayCalendar.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!calendar) {
    throw new AppError('Holiday calendar not found', 404, 'NOT_FOUND');
  }

  // Check if assignments exist
  const assignmentCount = await HolidayAssignment.countDocuments({
    company_id: req.user.company_id,
    calendar_id: calendar._id,
  });

  if (assignmentCount > 0) {
    throw new AppError(
      `Cannot delete holiday calendar "${calendar.name}" — it has ${assignmentCount} location assignment${assignmentCount > 1 ? 's' : ''} assigned. Remove assignments first.`,
      409,
      'HOLIDAY_CALENDAR_HAS_ASSIGNMENTS'
    );
  }

  // Check if holidays exist
  const holidayCount = await Holiday.countDocuments({
    calendar_id: calendar._id,
  });

  if (holidayCount > 0) {
    throw new AppError(
      `Cannot delete holiday calendar "${calendar.name}" — it contains ${holidayCount} holiday${holidayCount > 1 ? 's' : ''}. Remove holidays first.`,
      409,
      'HOLIDAY_CALENDAR_HAS_HOLIDAYS'
    );
  }

  const beforeState = calendar.toObject();

  await HolidayCalendar.deleteOne({ _id: calendar._id });

  await auditLogger.log({
    req,
    action: 'holiday_calendar.deleted',
    module: 'holidays',
    object_type: 'HolidayCalendar',
    object_id: calendar._id.toString(),
    object_label: calendar.name,
    before_state: beforeState,
    after_state: null,
  });

  res.status(200).json({ success: true, data: {} });
});

// ── Holiday Controllers ─────────────────────────────────────────────────────

/**
 * GET /holidays/calendars/:calendar_id/holidays
 * Returns all holidays for a specific calendar
 */
export const getHolidaysByCalendar = asyncHandler(async (req: Request, res: Response) => {
  const calendar = await HolidayCalendar.findOne({
    _id: req.params.calendar_id,
    company_id: req.user.company_id,
  });

  if (!calendar) {
    throw new AppError('Holiday calendar not found', 404, 'NOT_FOUND');
  }

  const holidays = await Holiday.find({
    calendar_id: calendar._id,
  })
    .sort({ date: 1 })
    .lean();

  const enriched = await enrichHolidays(holidays, calendar._id.toString());

  res.status(200).json({ success: true, data: enriched });
});

/**
 * GET /holidays/calendar/:calendar_id/holiday/:holiday_id
 * Returns a single holiday by ID
 */
export const getHolidayById = asyncHandler(async (req: Request, res: Response) => {
  const holiday = await Holiday.findOne({
    _id: req.params.holiday_id,
  });

  if (!holiday) {
    throw new AppError('Holiday not found', 404, 'NOT_FOUND');
  }

  const calendar = await HolidayCalendar.findById(holiday.calendar_id).lean();

  if (calendar?.company_id?.toString() !== req.user.company_id) {
    throw new AppError('Holiday not found', 404, 'NOT_FOUND');
  }

  const enriched = await enrichHolidays([holiday], holiday.calendar_id.toString());

  res.status(200).json({ success: true, data: enriched[0] });
});

/**
 * POST /holidays/calendars/:calendar_id/holidays
 * Creates a new holiday in a calendar
 */
export const createHoliday = asyncHandler(async (req: Request, res: Response) => {
  const calendar = await HolidayCalendar.findOne({
    _id: req.params.calendar_id,
    company_id: req.user.company_id,
  });

  if (!calendar) {
    throw new AppError('Holiday calendar not found', 404, 'NOT_FOUND');
  }

  const input = CreateHolidaySchema.parse(req.body);

  // If date is recurring, check for duplicate in the same calendar
  if (input.recurring_type === 'yearly') {
    const year = new Date(input.date).getFullYear();
    const month = new Date(input.date).getMonth();
    const day = new Date(input.date).getDate();

    const existing = await Holiday.findOne({
      calendar_id: calendar._id,
      name: input.name,
      date: {
        $gte: new Date(year, month, day),
        $lt: new Date(year, month, day + 1),
      },
    });

    if (existing) {
      throw new AppError(
        `A holiday with the name "${input.name}" on ${input.date} already exists in this calendar.`,
        400,
        'DUPLICATE_HOLIDAY_DATE'
      );
    }
  }

  const holiday = await Holiday.create({
    ...input,
    date: new Date(input.date),
    recurring_details: input.recurring_details || undefined,
    calendar_id: calendar._id,
  });

  await auditLogger.log({
    req,
    action: 'holiday.created',
    module: 'holidays',
    object_type: 'Holiday',
    object_id: holiday._id.toString(),
    object_label: holiday.name,
    before_state: null,
    after_state: holiday.toObject(),
  });

  const enriched = await enrichHolidays([holiday], calendar._id.toString());

  res.status(201).json({ success: true, data: enriched[0] });
});

/**
 * PUT /holidays/:holiday_id
 * Updates an existing holiday
 */
export const updateHoliday = asyncHandler(async (req: Request, res: Response) => {
  const holiday = await Holiday.findById(req.params.holiday_id);

  if (!holiday) {
    throw new AppError('Holiday not found', 404, 'NOT_FOUND');
  }

  const calendar = await HolidayCalendar.findById(holiday.calendar_id).lean();

  if (calendar?.company_id?.toString() !== req.user.company_id) {
    throw new AppError('Holiday not found', 404, 'NOT_FOUND');
  }

  const input = UpdateHolidaySchema.parse(req.body);

  const beforeState = holiday.toObject();

  if (input.date) {
    input.date = new Date(input.date);
  }

  Object.assign(holiday, input);
  await holiday.save();

  await auditLogger.log({
    req,
    action: 'holiday.updated',
    module: 'holidays',
    object_type: 'Holiday',
    object_id: holiday._id.toString(),
    object_label: holiday.name,
    before_state: beforeState,
    after_state: holiday.toObject(),
  });

  const enriched = await enrichHolidays([holiday], holiday.calendar_id.toString());

  res.status(200).json({ success: true, data: enriched[0] });
});

/**
 * DELETE /holidays/:holiday_id
 * Deletes a holiday
 */
export const deleteHoliday = asyncHandler(async (req: Request, res: Response) => {
  const holiday = await Holiday.findById(req.params.holiday_id);

  if (!holiday) {
    throw new AppError('Holiday not found', 404, 'NOT_FOUND');
  }

  const calendar = await HolidayCalendar.findById(holiday.calendar_id).lean();

  if (calendar?.company_id?.toString() !== req.user.company_id) {
    throw new AppError('Holiday not found', 404, 'NOT_FOUND');
  }

  const beforeState = holiday.toObject();

  await Holiday.deleteOne({ _id: holiday._id });

  await auditLogger.log({
    req,
    action: 'holiday.deleted',
    module: 'holidays',
    object_type: 'Holiday',
    object_id: holiday._id.toString(),
    object_label: holiday.name,
    before_state: beforeState,
    after_state: null,
  });

  res.status(200).json({ success: true, data: {} });
});

// ── Holiday Assignment Controllers ─────────────────────────────────────────────

/**
 * GET /holidays/assignments
 * Returns all holiday assignments for the requesting company
 */
export const getHolidayAssignments = asyncHandler(async (req: Request, res: Response) => {
  const assignments = await HolidayAssignment.find({
    company_id: req.user.company_id,
  })
    .populate('location_id', 'name type')
    .populate('calendar_id', 'name')
    .sort({ effective_date: -1 })
    .lean();

  res.status(200).json({ success: true, data: assignments });
});

/**
 * GET /holidays/assignments/location/:location_id
 * Returns holiday assignments for a specific location
 */
export const getHolidayAssignmentsByLocation = asyncHandler(async (req: Request, res: Response) => {
  const location = await Location.findOne({
    _id: req.params.location_id,
    company_id: req.user.company_id,
  });

  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  const assignments = await HolidayAssignment.find({
    location_id: location._id,
  })
    .populate('calendar_id', 'name description is_active')
    .sort({ effective_date: -1 })
    .lean();

  // Enrich with holidays count
  const enrichedAssignments = await Promise.all(
    assignments.map(async (assignment) => {
      const holidaysCount = await Holiday.countDocuments({
        calendar_id: assignment.calendar_id._id,
      });

      return {
        ...assignment,
        holidays_count: holidaysCount,
      };
    })
  );

  res.status(200).json({ success: true, data: enrichedAssignments });
});

/**
 * POST /holidays/assignments
 * Creates a new holiday assignment
 */
export const createHolidayAssignment = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateHolidayAssignmentSchema.parse(req.body);

  // Verify location belongs to the requesting company
  const location = await Location.findOne({
    _id: input.location_id,
    company_id: req.user.company_id,
  });

  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  // Verify calendar belongs to the requesting company
  const calendar = await HolidayCalendar.findOne({
    _id: input.calendar_id,
    company_id: req.user.company_id,
  });

  if (!calendar) {
    throw new AppError('Holiday calendar not found', 404, 'NOT_FOUND');
  }

  // Check for duplicate assignment
  const existing = await HolidayAssignment.findOne({
    location_id: input.location_id,
    calendar_id: input.calendar_id,
    is_primary: true,
    effective_date: { $lte: new Date(input.effective_date) },
  });

  if (existing) {
    throw new AppError(
      'A primary holiday calendar is already assigned to this location.',
      400,
      'DUPLICATE_HOLIDAY_ASSIGNMENT'
    );
  }

  const assignment = await HolidayAssignment.create({
  ...input,
  effective_date: new Date(input.effective_date),
  expiry_date: input.expiry_date ? new Date(input.expiry_date) : undefined,
  company_id: req.user.company_id,
});

await auditLogger.log({
  req,
  action: 'holiday_assignment.created',
  module: 'holidays',
  object_type: 'HolidayAssignment',
  object_id: assignment._id.toString(),
  object_label: `${location.name} - ${calendar.name}`,
  before_state: null,
  after_state: assignment.toObject(),
});

res.status(201).json({ success: true, data: assignment });
});

/**
 * PUT /holidays/assignments/:id
 * Updates an existing holiday assignment
 */
export const updateHolidayAssignment = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateHolidayAssignmentSchema.parse(req.body);

  const assignment = await HolidayAssignment.findById(req.params.id);

  if (!assignment) {
    throw new AppError('Holiday assignment not found', 404, 'NOT_FOUND');
  }

  const calendar = await HolidayCalendar.findById(assignment.calendar_id).lean();

  if (calendar?.company_id?.toString() !== req.user.company_id) {
    throw new AppError('Holiday assignment not found', 404, 'NOT_FOUND');
  }

  const beforeState = assignment.toObject();

  if (input.effective_date) {
    input.effective_date = new Date(input.effective_date);
  }
  if (input.expiry_date) {
    input.expiry_date = new Date(input.expiry_date);
  }

  Object.assign(assignment, input);
  await assignment.save();

  await auditLogger.log({
    req,
    action: 'holiday_assignment.updated',
    module: 'holidays',
    object_type: 'HolidayAssignment',
    object_id: assignment._id.toString(),
    object_label: `${assignment.location_id} - ${assignment.calendar_id}`,
    before_state: beforeState,
    after_state: assignment.toObject(),
  });

  res.status(200).json({ success: true, data: assignment });
});

/**
 * DELETE /holidays/assignments/:id
 * Deletes a holiday assignment
 */
export const deleteHolidayAssignment = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await HolidayAssignment.findById(req.params.id);

  if (!assignment) {
    throw new AppError('Holiday assignment not found', 404, 'NOT_FOUND');
  }

  const calendar = await HolidayCalendar.findById(assignment.calendar_id).lean();

  if (calendar?.company_id?.toString() !== req.user.company_id) {
    throw new AppError('Holiday assignment not found', 404, 'NOT_FOUND');
  }

  const beforeState = assignment.toObject();

  await HolidayAssignment.deleteOne({ _id: assignment._id });

  await auditLogger.log({
    req,
    action: 'holiday_assignment.deleted',
    module: 'holidays',
    object_type: 'HolidayAssignment',
    object_id: assignment._id.toString(),
    object_label: `${assignment.location_id} - ${assignment.calendar_id}`,
    before_state: beforeState,
    after_state: null,
  });

  res.status(200).json({ success: true, data: {} });
});

// ── Integration Controllers ───────────────────────────────────────────────────

/**
 * GET /holidays/integrations/attendance/holidays
 * Returns holidays for a user based on their location
 */
export const getHolidaysForAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { user_id } = req.query as { user_id: string };

  if (!user_id) {
    throw new AppError('User ID is required', 400, 'VALIDATION_ERROR');
  }

  const user = await User.findById(user_id).populate('location_id', 'name type timezone').lean();
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  if (!user.location_id) {
    return res.status(200).json({ success: true, data: [] });
  }

  const assignments = await HolidayAssignment.find({
    location_id: user.location_id._id,
    is_primary: true,
    effective_date: { $lte: new Date() },
    $or: [ { expiry_date: { $exists: false } }, { expiry_date: { $gte: new Date() } } ],
  })
    .populate('calendar_id', 'name description is_active')
    .lean();

  const allHolidays: any[] = [];
  for (const assignment of assignments) {
    const holidays = await Holiday.find({
      calendar_id: assignment.calendar_id._id,
      $or: [ { recurring_type: { $ne: 'yearly' } }, { recurring_type: 'yearly', date: { $gte: new Date() } } ],
    })
      .sort({ date: 1 })
      .lean();

    allHolidays.push(
      ...holidays.map((holiday) => ({
        ...holiday,
        source_location: user.location_id.name,
      }))
    );
  }

  res.status(200).json({ success: true, data: allHolidays });
});

/**
 * GET /holidays/integrations/attendance/locations
 * Returns all locations with active holiday calendars
 */
export const getLocationsWithHolidayCalendars = asyncHandler(async (req: Request, res: Response) => {
  const locations = await Location.find({
    company_id: req.user.company_id,
  })
    .populate('parent_id', 'name type')
    .sort({ name: 1 })
    .lean();

  const activeAssignments = await HolidayAssignment.find({
    company_id: req.user.company_id,
    is_primary: true,
    effective_date: { $lte: new Date() },
    $or: [ { expiry_date: { $exists: false } }, { expiry_date: { $gte: new Date() } } ],
  })
    .populate('location_id', 'name type timezone')
    .populate('calendar_id', 'name description')
    .lean();

  const locationMap = new Map<string, any>();
  locations.forEach((loc) => {
    locationMap.set(loc._id.toString(), { ...loc, holiday_calendars: [] });
  });

  activeAssignments.forEach((assignment) => {
    const location = locationMap.get(assignment.location_id._id.toString());
    if (location) {
      location.holiday_calendars.push({
        calendar_id: assignment.calendar_id._id,
        calendar_name: assignment.calendar_id.name,
        description: assignment.calendar_id.description,
        is_primary: assignment.is_primary,
        effective_date: assignment.effective_date,
        expiry_date: assignment.expiry_date,
      });
    }
  });

  const locationsWithCalendars = Array.from(locationMap.values());

  res.status(200).json({ success: true, data: locationsWithCalendars });
});

/**
 * GET /holidays/integrations/attendance/all-company-holidays
 * Returns all holidays for the company for sync
 */
export const getAllCompanyHolidays = asyncHandler(async (req: Request, res: Response) => {
  const allAssignments = await HolidayAssignment.find({
    company_id: req.user.company_id,
    is_primary: true,
    effective_date: { $lte: new Date() },
    $or: [ { expiry_date: { $exists: false } }, { expiry_date: { $gte: new Date() } } ],
  })
    .populate('location_id', 'name type timezone')
    .populate('calendar_id', 'name description')
    .lean();

  const holidaysByCalendar = await Promise.all(
    allAssignments.map(async (assignment) => {
      const calendarName = assignment.calendar_id.name;
      const holidays = await Holiday.find({
        calendar_id: assignment.calendar_id._id,
        $or: [ { recurring_type: { $ne: 'yearly' } }, { recurring_type: 'yearly', date: { $gte: new Date() } } ],
      })
        .sort({ date: 1 })
        .lean();

      return {
        calendar_name: calendarName,
        location_name: assignment.location_id.name,
        location_type: assignment.location_id.type,
        timezone: assignment.location_id.timezone,
        holidays,
      };
    })
  );

  res.status(200).json({ success: true, data: holidaysByCalendar });
});

// ── Bulk Operations ─────────────────────────────────────────────────────

/**
 * POST /holidays/calendars/bulk
 * Creates multiple holiday calendars at once
 */
export const createBulkHolidayCalendars = asyncHandler(async (req: Request, res: Response) => {
  const input = z.array(CreateHolidayCalendarSchema).parse(req.body);

  const calendars = [];
  const errors = [];

  for (const item of input) {
    try {
      const existing = await HolidayCalendar.findOne({
        company_id: req.user.company_id,
        name: item.name,
      });

      if (existing) {
        errors.push(`Calendar with name "${item.name}" already exists.`);
        continue;
      }

      const calendar = await HolidayCalendar.create({
        ...item,
        company_id: req.user.company_id,
      });

      calendars.push(calendar);
    } catch (error) {
      errors.push(`Failed to create calendar "${item.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  if (calendars.length > 0) {
    for (const calendar of calendars) {
      await auditLogger.log({
        req,
        action: 'holiday_calendar.bulk_created',
        module: 'holidays',
        object_type: 'HolidayCalendar',
        object_id: calendar._id.toString(),
        object_label: calendar.name,
        before_state: null,
        after_state: calendar.toObject(),
      });
    }
  }

  res.status(201).json({
    success: true,
    data: { created: calendars, errors: errors.length > 0 ? errors : undefined },
  });
});

/**
 * POST /holidays/calendars/:calendar_id/holidays/bulk
 * Creates multiple holidays at once
 */
export const createBulkHolidays = asyncHandler(async (req: Request, res: Response) => {
  const calendar = await HolidayCalendar.findOne({
    _id: req.params.calendar_id,
    company_id: req.user.company_id,
  });

  if (!calendar) {
    throw new AppError('Holiday calendar not found', 404, 'NOT_FOUND');
  }

  const input = z.array(CreateHolidaySchema).parse(req.body);

  const holidays = [];
  const errors = [];

  for (const item of input) {
    try {
      const year = new Date(item.date).getFullYear();
      const month = new Date(item.date).getMonth();
      const day = new Date(item.date).getDate();

      if (item.recurring_type === 'yearly') {
        const existing = await Holiday.findOne({
          calendar_id: calendar._id,
          name: item.name,
          date: {
            $gte: new Date(year, month, day),
            $lt: new Date(year, month, day + 1),
          },
        });

        if (existing) {
          errors.push(`Holiday with name "${item.name}" already exists for this date.`);
          continue;
        }
      }

      const holiday = await Holiday.create({
        ...item,
        date: new Date(item.date),
        recurring_details: item.recurring_details || undefined,
        calendar_id: calendar._id,
      });

      holidays.push(holiday);
    } catch (error) {
      errors.push(`Failed to create holiday "${item.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  if (holidays.length > 0) {
    for (const holiday of holidays) {
      await auditLogger.log({
        req,
        action: 'holiday.bulk_created',
        module: 'holidays',
        object_type: 'Holiday',
        object_id: holiday._id.toString(),
        object_label: holiday.name,
        before_state: null,
        after_state: holiday.toObject(),
      });
    }
  }

  const enriched = await enrichHolidays(holidays, calendar._id.toString());

  res.status(201).json({
    success: true,
    data: { created: enriched, errors: errors.length > 0 ? errors : undefined },
  });
});

/**
 * DELETE /holidays/assignments/bulk
 * Deletes multiple holiday assignments at once
 */
export const deleteBulkHolidayAssignments = asyncHandler(async (req: Request, res: Response) => {
  const { assignment_ids } = z.object({
    assignment_ids: z.array(z.string()),
  }).parse(req.body);

  const assignments = await HolidayAssignment.find({
    _id: { $in: assignment_ids },
    company_id: req.user.company_id,
  }).lean();

  if (assignments.length === 0) {
    throw new AppError('No holiday assignments found', 404, 'NOT_FOUND');
  }

  await HolidayAssignment.deleteMany({
    _id: { $in: assignment_ids },
  });

  for (const assignment of assignments) {
    await auditLogger.log({
      req,
      action: 'holiday_assignment.bulk_deleted',
      module: 'holidays',
      object_type: 'HolidayAssignment',
      object_id: assignment._id.toString(),
      object_label: `${assignment.location_id} - ${assignment.calendar_id}`,
      before_state: assignment,
      after_state: null,
    });
  }

  res.status(200).json({ success: true, data: { deleted_count: assignments.length } });
});

/**
 * POST /holidays/assignments/:assignment_id/holidays
 * Moves a holiday from one calendar to another
 */
export const moveHoliday = asyncHandler(async (req: Request, res: Response) => {
  const { target_calendar_id, holiday_id } = z.object({
    target_calendar_id: z.string(),
    holiday_id: z.string(),
  }).parse(req.body);

  const sourceHoliday = await Holiday.findById(holiday_id);
  if (!sourceHoliday) {
    throw new AppError('Source holiday not found', 404, 'NOT_FOUND');
  }

  const targetCalendar = await HolidayCalendar.findOne({
    _id: target_calendar_id,
    company_id: req.user.company_id,
  });
  if (!targetCalendar) {
    throw new AppError('Target calendar not found', 404, 'NOT_FOUND');
  }

  const beforeState = sourceHoliday.toObject();

  sourceHoliday.calendar_id = targetCalendar._id;
  await sourceHoliday.save();

  await auditLogger.log({
    req,
    action: 'holiday.moved',
    module: 'holidays',
    object_type: 'Holiday',
    object_id: sourceHoliday._id.toString(),
    object_label: sourceHoliday.name,
    before_state: beforeState,
    after_state: sourceHoliday.toObject(),
  });

  const enriched = await enrichHolidays([sourceHoliday], targetCalendar._id.toString());

  res.status(200).json({ success: true, data: enriched[0] });
});

/**
 * POST /holidays/calendars/:calendar_id/holidays/export
 * Exports all holidays from a calendar to CSV
 */
export const exportHolidays = asyncHandler(async (req: Request, res: Response) => {
  const calendar = await HolidayCalendar.findOne({
    _id: req.params.calendar_id,
    company_id: req.user.company_id,
  });
  if (!calendar) {
    throw new AppError('Holiday calendar not found', 404, 'NOT_FOUND');
  }

  const holidays = await Holiday.find({
    calendar_id: calendar._id,
  })
    .sort({ date: 1 })
    .lean();

  // Convert to CSV format
  const csvHeaders = ['Name', 'Date', 'Type', 'Code', 'Observed'];
  const csvRows = holidays.map((holiday) => (
    `"${holiday.name}","${holiday.date.toISOString().split('T')[0]}","${holiday.recurring_type}","${holiday.holiday_code || ''}","${holiday.is_observed}"`
  ));

  const csvContent = `${csvHeaders.join(',')}\n${csvRows.join('\n')}`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${calendar.name}_holidays.csv`);
  res.status(200).send(csvContent);
});

/**
 * POST /holidays/calendars/import
 * Imports holidays from CSV file
 */
export const importHolidays = asyncHandler(async (req: Request, res: Response) => {
  // TODO: Parse CSV from req.body (assuming multipart/form-data)
  // For now, return not implemented response
  res.status(501).json({
    success: false,
    message: 'Import functionality not yet implemented',
  });
});