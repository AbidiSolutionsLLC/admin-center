// server/src/controllers/workSchedules.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { WorkSchedule } from '../models/WorkSchedule.model';
import { WorkScheduleAssignment } from '../models/WorkScheduleAssignment.model';
import { Location } from '../models/Location.model';
import { User } from '../models/User.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
import { isValidTimezone } from '../constants/timezones';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const workingHoursSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:mm)'),
  end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:mm)'),
}).refine((data) => data.end > data.start, {
  message: 'End time must be after start time',
}).refine((data) => data.end !== data.start, {
  message: 'Working hours must be greater than zero',
});

const CreateWorkScheduleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
  description: z.string().optional().nullable(),
  timezone: z.string().min(1, 'Timezone is required').default('UTC')
    .refine((val) => isValidTimezone(val), {
      message: 'Invalid timezone. Must be a valid IANA timezone identifier.',
    }),
  working_days: z.array(z.number().min(0).max(6)).min(1, 'At least one working day is required'),
  working_hours: workingHoursSchema,
  break_hours: z.object({
    start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:mm)'),
    end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:mm)'),
  }).optional().nullable(),
  is_active: z.boolean().default(true),
});

const UpdateWorkScheduleSchema = CreateWorkScheduleSchema.partial();

const CreateAssignmentSchema = z.object({
  location_id: z.string(),
  work_schedule_id: z.string(),
  is_primary: z.boolean().default(false),
  effective_date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  expiry_date: z.string().optional().nullable(),
});

const UpdateAssignmentSchema = CreateAssignmentSchema.partial();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function enrichWorkSchedules(schedules: any[]): Promise<any[]> {
  const scheduleIds = schedules.map((s) => s._id.toString());

  const assignments = await WorkScheduleAssignment.find({
    work_schedule_id: { $in: scheduleIds },
  }).lean();

  const countMap = new Map<string, number>();
  assignments.forEach((a) => {
    const key = a.work_schedule_id.toString();
    countMap.set(key, (countMap.get(key) || 0) + 1);
  });

  return schedules.map((schedule) => ({
    ...schedule,
    assignment_count: countMap.get(schedule._id.toString()) ?? 0,
  }));
}

// ── Work Schedule Controllers ────────────────────────────────────────────────

/**
 * GET /work-schedules
 * Returns all work schedules for the requesting company.
 */
export const getWorkSchedules = asyncHandler(async (req: Request, res: Response) => {
  const schedules = await WorkSchedule.find({
    company_id: req.user.company_id,
  })
    .sort({ name: 1 })
    .lean();

  const enriched = await enrichWorkSchedules(schedules);
  res.status(200).json({ success: true, data: enriched });
});

/**
 * GET /work-schedules/:id
 * Returns a single work schedule by ID.
 */
export const getWorkScheduleById = asyncHandler(async (req: Request, res: Response) => {
  const schedule = await WorkSchedule.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!schedule) {
    throw new AppError('Work schedule not found', 404, 'NOT_FOUND');
  }

  const assignments = await WorkScheduleAssignment.find({
    work_schedule_id: schedule._id,
  })
    .populate('location_id', 'name type')
    .lean();

  const [enriched] = await enrichWorkSchedules([schedule.toObject()]);

  res.status(200).json({
    success: true,
    data: { ...enriched, locations: assignments },
  });
});

/**
 * POST /work-schedules
 * Creates a new work schedule.
 */
export const createWorkSchedule = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateWorkScheduleSchema.parse(req.body);

  const existing = await WorkSchedule.findOne({
    company_id: req.user.company_id,
    name: input.name,
  });

  if (existing) {
    throw new AppError(
      `A work schedule with the name "${input.name}" already exists.`,
      400,
      'DUPLICATE_WORK_SCHEDULE_NAME'
    );
  }

  const schedule = await WorkSchedule.create({
    ...input,
    company_id: req.user.company_id,
  });

  await auditLogger.log({
    req,
    action: 'work_schedule.created',
    module: 'locations',
    object_type: 'WorkSchedule',
    object_id: schedule._id.toString(),
    object_label: schedule.name,
    before_state: null,
    after_state: schedule.toObject(),
  });

  res.status(201).json({ success: true, data: schedule });
});

/**
 * PUT /work-schedules/:id
 * Updates an existing work schedule.
 */
export const updateWorkSchedule = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateWorkScheduleSchema.parse(req.body);

  const schedule = await WorkSchedule.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!schedule) {
    throw new AppError('Work schedule not found', 404, 'NOT_FOUND');
  }

  if (input.name && input.name !== schedule.name) {
    const existing = await WorkSchedule.findOne({
      company_id: req.user.company_id,
      name: input.name,
      _id: { $ne: req.params.id },
    });

    if (existing) {
      throw new AppError(
        `Another work schedule with the name "${input.name}" already exists.`,
        400,
        'DUPLICATE_WORK_SCHEDULE_NAME'
      );
    }
  }

  const beforeState = schedule.toObject();

  Object.assign(schedule, input);
  await schedule.save();

  await auditLogger.log({
    req,
    action: 'work_schedule.updated',
    module: 'locations',
    object_type: 'WorkSchedule',
    object_id: schedule._id.toString(),
    object_label: schedule.name,
    before_state: beforeState,
    after_state: schedule.toObject(),
  });

  // Recalculate SLA due dates for affected locations when schedule changes
  if (input.working_days || input.working_hours) {
    const { slaCalculator } = await import('../services/slaCalculator.service');
    const assignments = await WorkScheduleAssignment.find({
      work_schedule_id: schedule._id,
      company_id: req.user.company_id,
    }).lean();
    const locationIds = [...new Set(assignments.map((a) => a.location_id.toString()))];
    for (const locId of locationIds) {
      slaCalculator.recalculateForLocation(locId, req.user.company_id).catch(() => {});
    }
  }

  res.status(200).json({ success: true, data: schedule });
});

/**
 * DELETE /work-schedules/:id
 * Deletes a work schedule. Blocked if assignments exist.
 */
export const deleteWorkSchedule = asyncHandler(async (req: Request, res: Response) => {
  const schedule = await WorkSchedule.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!schedule) {
    throw new AppError('Work schedule not found', 404, 'NOT_FOUND');
  }

  const assignmentCount = await WorkScheduleAssignment.countDocuments({
    company_id: req.user.company_id,
    work_schedule_id: schedule._id,
  });

  if (assignmentCount > 0) {
    throw new AppError(
      `Cannot delete work schedule "${schedule.name}" — it has ${assignmentCount} location assignment${assignmentCount > 1 ? 's' : ''}. Remove assignments first.`,
      409,
      'WORK_SCHEDULE_HAS_ASSIGNMENTS'
    );
  }

  const beforeState = schedule.toObject();

  await WorkSchedule.deleteOne({ _id: schedule._id });

  await auditLogger.log({
    req,
    action: 'work_schedule.deleted',
    module: 'locations',
    object_type: 'WorkSchedule',
    object_id: schedule._id.toString(),
    object_label: schedule.name,
    before_state: beforeState,
    after_state: null,
  });

  res.status(200).json({ success: true, data: {} });
});

// ── Assignment Controllers ──────────────────────────────────────────────────

/**
 * GET /work-schedules/assignments
 * Returns all work schedule assignments for the company.
 */
export const getWorkScheduleAssignments = asyncHandler(async (req: Request, res: Response) => {
  const assignments = await WorkScheduleAssignment.find({
    company_id: req.user.company_id,
  })
    .populate('location_id', 'name type')
    .populate('work_schedule_id', 'name description timezone working_days working_hours is_active')
    .sort({ effective_date: -1 })
    .lean();

  res.status(200).json({ success: true, data: assignments });
});

/**
 * GET /work-schedules/assignments/location/:location_id
 * Returns work schedule assignments for a specific location.
 */
export const getWorkScheduleAssignmentsByLocation = asyncHandler(async (req: Request, res: Response) => {
  const location = await Location.findOne({
    _id: req.params.location_id,
    company_id: req.user.company_id,
  });

  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  const assignments = await WorkScheduleAssignment.find({
    location_id: location._id,
  })
    .populate('work_schedule_id', 'name description timezone working_days working_hours break_hours is_active')
    .sort({ effective_date: -1 })
    .lean();

  res.status(200).json({ success: true, data: assignments });
});

/**
 * POST /work-schedules/assignments
 * Creates a new work schedule assignment.
 */
export const createWorkScheduleAssignment = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateAssignmentSchema.parse(req.body);

  const location = await Location.findOne({
    _id: input.location_id,
    company_id: req.user.company_id,
  });

  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  const schedule = await WorkSchedule.findOne({
    _id: input.work_schedule_id,
    company_id: req.user.company_id,
  });

  if (!schedule) {
    throw new AppError('Work schedule not found', 404, 'NOT_FOUND');
  }

  if (input.is_primary) {
    const existingPrimary = await WorkScheduleAssignment.findOne({
      location_id: input.location_id,
      is_primary: true,
      effective_date: { $lte: new Date(input.effective_date) },
      $or: [
        { expiry_date: { $exists: false } },
        { expiry_date: { $gte: new Date(input.effective_date) } },
      ],
    });

    if (existingPrimary) {
      throw new AppError(
        'A primary work schedule is already assigned to this location for this period.',
        400,
        'DUPLICATE_PRIMARY_ASSIGNMENT'
      );
    }
  }

  const assignment = await WorkScheduleAssignment.create({
    ...input,
    effective_date: new Date(input.effective_date),
    expiry_date: input.expiry_date ? new Date(input.expiry_date) : undefined,
    company_id: req.user.company_id,
  });

  await auditLogger.log({
    req,
    action: 'work_schedule_assignment.created',
    module: 'locations',
    object_type: 'WorkScheduleAssignment',
    object_id: assignment._id.toString(),
    object_label: `${location.name} - ${schedule.name}`,
    before_state: null,
    after_state: assignment.toObject(),
  });

  // Recalculate SLA due dates for affected location
  const { slaCalculator } = await import('../services/slaCalculator.service');
  slaCalculator.recalculateForLocation(location._id.toString(), req.user.company_id).catch(() => {});

  res.status(201).json({ success: true, data: assignment });
});

/**
 * PUT /work-schedules/assignments/:id
 * Updates an existing work schedule assignment.
 */
export const updateWorkScheduleAssignment = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateAssignmentSchema.parse(req.body);

  const assignment = await WorkScheduleAssignment.findById(req.params.id);

  if (!assignment) {
    throw new AppError('Work schedule assignment not found', 404, 'NOT_FOUND');
  }

  const schedule = await WorkSchedule.findById(assignment.work_schedule_id).lean();

  if (schedule?.company_id?.toString() !== req.user.company_id) {
    throw new AppError('Work schedule assignment not found', 404, 'NOT_FOUND');
  }

  const beforeState = assignment.toObject();

  if (input.effective_date) {
    assignment.effective_date = new Date(input.effective_date);
  }
  if (input.expiry_date !== undefined) {
    assignment.expiry_date = input.expiry_date ? new Date(input.expiry_date) : undefined;
  }
  if (input.is_primary !== undefined) {
    assignment.is_primary = input.is_primary;
  }

  await assignment.save();

  await auditLogger.log({
    req,
    action: 'work_schedule_assignment.updated',
    module: 'locations',
    object_type: 'WorkScheduleAssignment',
    object_id: assignment._id.toString(),
    object_label: `${assignment.location_id} - ${assignment.work_schedule_id}`,
    before_state: beforeState,
    after_state: assignment.toObject(),
  });

  res.status(200).json({ success: true, data: assignment });
});

/**
 * DELETE /work-schedules/assignments/:id
 * Deletes a work schedule assignment.
 */
export const deleteWorkScheduleAssignment = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await WorkScheduleAssignment.findById(req.params.id);

  if (!assignment) {
    throw new AppError('Work schedule assignment not found', 404, 'NOT_FOUND');
  }

  const schedule = await WorkSchedule.findById(assignment.work_schedule_id).lean();

  if (schedule?.company_id?.toString() !== req.user.company_id) {
    throw new AppError('Work schedule assignment not found', 404, 'NOT_FOUND');
  }

  const beforeState = assignment.toObject();

  await WorkScheduleAssignment.deleteOne({ _id: assignment._id });

  await auditLogger.log({
    req,
    action: 'work_schedule_assignment.deleted',
    module: 'locations',
    object_type: 'WorkScheduleAssignment',
    object_id: assignment._id.toString(),
    object_label: `${assignment.location_id} - ${assignment.work_schedule_id}`,
    before_state: beforeState,
    after_state: null,
  });

  res.status(200).json({ success: true, data: {} });
});

// ── Integration Controllers ──────────────────────────────────────────────────

/**
 * GET /work-schedules/integrations/user-schedule/:user_id
 * Returns the effective work schedule for a user based on their location.
 * Users inherit schedule automatically based on location.
 */
export const getUserWorkSchedule = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.user_id)
    .populate('location_id', 'name type timezone')
    .lean();

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  if (!user.location_id) {
    return res.status(200).json({ success: true, data: null });
  }

  const assignment = await WorkScheduleAssignment.findOne({
    location_id: user.location_id._id,
    is_primary: true,
    effective_date: { $lte: new Date() },
    $or: [
      { expiry_date: { $exists: false } },
      { expiry_date: { $gte: new Date() } },
    ],
  })
    .populate('work_schedule_id')
    .lean();

  if (!assignment) {
    return res.status(200).json({ success: true, data: null });
  }

  res.status(200).json({
    success: true,
    data: {
      schedule: assignment.work_schedule_id,
      location: user.location_id,
    },
  });
});

/**
 * GET /work-schedules/integrations/location-schedule/:location_id
 * Returns the effective work schedule for a specific location.
 */
export const getLocationWorkSchedule = asyncHandler(async (req: Request, res: Response) => {
  const location = await Location.findOne({
    _id: req.params.location_id,
    company_id: req.user.company_id,
  });

  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  const assignment = await WorkScheduleAssignment.findOne({
    location_id: location._id,
    is_primary: true,
    effective_date: { $lte: new Date() },
    $or: [
      { expiry_date: { $exists: false } },
      { expiry_date: { $gte: new Date() } },
    ],
  })
    .populate('work_schedule_id')
    .lean();

  if (!assignment) {
    return res.status(200).json({ success: true, data: { schedule: null, location } });
  }

  res.status(200).json({
    success: true,
    data: {
      schedule: assignment.work_schedule_id,
      location,
    },
  });
});
