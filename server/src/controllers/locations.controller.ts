// server/src/controllers/locations.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { Location, ILocation } from '../models/Location.model';
import { User } from '../models/User.model';
import { PolicyVersion } from '../models/PolicyVersion.model';
import { PolicyAssignment } from '../models/PolicyAssignment.model';
import { AccessControlPolicy } from '../models/AccessControlPolicy.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
import { isValidTimezone } from '../constants/timezones';
import { locationSettingsService } from '../services/locationSettings.service';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const CreateLocationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
  type: z.enum(['region', 'country', 'city', 'office']),
  parent_id: z.string().optional().nullable(),
  timezone: z.string().min(1, 'Timezone is required').default('UTC')
    .refine((val) => isValidTimezone(val), {
      message: 'Invalid timezone. Must be a valid IANA timezone identifier (e.g. America/New_York).',
    }),
  is_headquarters: z.boolean().default(false),
  address: z.string().optional().nullable(),
  working_days: z.array(z.number().min(0).max(6)).optional(),
  working_hours: z.object({
    start: z.string(),
    end: z.string(),
  }).optional().nullable(),
}).refine(data => data.type === 'region' || !!data.parent_id, {
  message: 'Parent location is required unless the type is Region.',
  path: ['parent_id'],
});

const UpdateLocationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150).optional(),
  type: z.enum(['region', 'country', 'city', 'office']).optional(),
  parent_id: z.string().optional().nullable(),
  timezone: z.string().min(1, 'Timezone is required')
    .refine((val) => isValidTimezone(val), {
      message: 'Invalid timezone. Must be a valid IANA timezone identifier (e.g. America/New_York).',
    }).optional(),
  is_headquarters: z.boolean().optional(),
  address: z.string().optional().nullable(),
  working_days: z.array(z.number().min(0).max(6)).optional(),
  working_hours: z.object({
    start: z.string(),
    end: z.string(),
  }).optional().nullable(),
}).refine(data => !data.type || data.type === 'region' || !!data.parent_id, {
  message: 'Parent location is required unless the type is Region.',
  path: ['parent_id'],
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Enriches a location list with user count (active users assigned to each location).
 */
async function enrichLocations(
  locations: any[]
): Promise<any[]> {
  const locationIds = locations.map((l) => l._id.toString());

  const userCounts = await User.aggregate([
    { $match: { location_id: { $in: locationIds.map((id) => id) }, is_active: true } },
    { $group: { _id: '$location_id', count: { $sum: 1 } } },
  ]);

  const userCountMap = new Map<string, number>(
    userCounts.map((u) => [u._id.toString(), u.count])
  );

  return locations.map((loc) => {
    const data = { ...loc };
    const userCount = userCountMap.get(loc._id.toString()) ?? 0;
    return { ...data, user_count: userCount };
  });
}

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /locations
 * Returns all locations for the requesting company, enriched with user counts.
 */
export const getLocations = asyncHandler(async (req: Request, res: Response) => {
  const includeDeleted = req.query.include_deleted === 'true';
  const filter: Record<string, unknown> = { company_id: req.user.company_id };
  if (!includeDeleted) filter.is_deleted = { $ne: true };

  const locations = await Location.find(filter)
    .populate('parent_id', 'name type')
    .sort({ created_at: 1 })
    .lean();

  const enriched = await enrichLocations(locations);
  res.status(200).json({ success: true, data: enriched });
});

/**
 * GET /locations/tree
 * Returns the location hierarchy as a nested tree structure.
 * Hierarchy: Region → Country → City → Office.
 */
export const getLocationTree = asyncHandler(async (req: Request, res: Response) => {
  const locations = await Location.find({
    company_id: req.user.company_id,
    is_deleted: { $ne: true },
  })
    .populate('parent_id', 'name type')
    .sort({ created_at: 1 })
    .lean();

  const enriched = await enrichLocations(locations);

  // Build tree
  const map = new Map<string, any>();
  const tree: any[] = [];

  enriched.forEach((loc) => {
    map.set(loc._id.toString(), { ...loc, children: [] });
  });

  enriched.forEach((loc) => {
    const node = map.get(loc._id.toString())!;
    if (loc.parent_id && map.has(loc.parent_id.toString())) {
      map.get(loc.parent_id.toString())!.children.push(node);
    } else {
      tree.push(node);
    }
  });

  res.status(200).json({ success: true, data: tree });
});

/**
 * GET /locations/:id
 * Returns a single location by ID, scoped to the company.
 */
export const getLocationById = asyncHandler(async (req: Request, res: Response) => {
  const location = await Location.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_deleted: { $ne: true },
  }).populate('parent_id', 'name type');

  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  const [enriched] = await enrichLocations([location.toObject()]);
  res.status(200).json({ success: true, data: enriched });
});

/**
 * POST /locations
 * Creates a new location scoped to the requesting company's tenant.
 */
export const createLocation = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateLocationSchema.parse(req.body);

  // Check for duplicate location name within the same company (active only)
  const existing = await Location.findOne({
    company_id: req.user.company_id,
    name: input.name,
    is_deleted: { $ne: true },
  });

  if (existing) {
    throw new AppError(
      `A location with the name "${input.name}" already exists.`,
      400,
      'DUPLICATE_LOCATION_NAME'
    );
  }

  // Merge flat working_days into working_hours.days for the model
  const locationData: Record<string, unknown> = {
    ...input,
    parent_id: input.parent_id || undefined,
    address: input.address || undefined,
    company_id: req.user.company_id,
  };
  delete locationData.working_days;

  if (input.working_days && input.working_days.length > 0) {
    locationData.working_hours = {
      start: input.working_hours?.start ?? '09:00',
      end: input.working_hours?.end ?? '17:00',
      days: input.working_days,
    };
  } else {
    locationData.working_hours = input.working_hours || undefined;
  }

  const location = await Location.create(locationData);

  await auditLogger.log({
    req,
    action: 'location.created',
    module: 'locations',
    object_type: 'Location',
    object_id: location._id.toString(),
    object_label: location.name,
    before_state: null,
    after_state: location.toObject(),
  });

  res.status(201).json({ success: true, data: location });
});

/**
 * PUT /locations/:id
 * Updates an existing location, scoped to the company tenant.
 */
export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateLocationSchema.parse(req.body);

  const location = await Location.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_deleted: { $ne: true },
  });

  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  // If name is being changed, check for duplicate name (active only)
  if (input.name && input.name !== location.name) {
    const existing = await Location.findOne({
      company_id: req.user.company_id,
      name: input.name,
      is_deleted: { $ne: true },
      _id: { $ne: req.params.id },
    });

    if (existing) {
      throw new AppError(
        `Another location with the name "${input.name}" already exists.`,
        400,
        'DUPLICATE_LOCATION_NAME'
      );
    }
  }

  // Prevent circular reference when changing parent
  if (input.parent_id && input.parent_id !== (location.parent_id?.toString() ?? null)) {
    if (input.parent_id === req.params.id) {
      throw new AppError('A location cannot be its own parent.', 400, 'SELF_PARENT');
    }
    const descendants = await Location.find({
      company_id: req.user.company_id,
      parent_id: req.params.id,
      is_deleted: { $ne: true },
    }).select('_id').lean();
    const visited = new Set<string>([req.params.id]);
    const queue = descendants.map(d => d._id.toString());
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === input.parent_id) {
        throw new AppError('Circular reference detected: the selected parent is a descendant of this location.', 400, 'CIRCULAR_PARENT');
      }
      if (visited.has(current)) continue;
      visited.add(current);
      const children = await Location.find({
        company_id: req.user.company_id,
        parent_id: current,
        is_deleted: { $ne: true },
      }).select('_id').lean();
      for (const c of children) queue.push(c._id.toString());
    }
  }

  const beforeState = location.toObject();

  // Merge flat working_days into working_hours.days for the model
  const { working_days, ...restInput } = input;
  const updates: Record<string, unknown> = { ...restInput, parent_id: restInput.parent_id || undefined, address: restInput.address || undefined };
  if (updates.parent_id === '') updates.parent_id = null;
  if (updates.address === '') updates.address = null;
  delete updates.working_days;

  if (working_days) {
    if (working_days.length > 0) {
      updates.working_hours = {
        start: input.working_hours?.start ?? location.working_hours?.start ?? '09:00',
        end: input.working_hours?.end ?? location.working_hours?.end ?? '17:00',
        days: working_days,
      };
    } else if (input.working_hours) {
      updates.working_hours = {
        start: input.working_hours.start,
        end: input.working_hours.end,
        days: location.working_hours?.days ?? [1, 2, 3, 4, 5],
      };
    }
  } else if (input.working_hours) {
    updates.working_hours = {
      start: input.working_hours.start,
      end: input.working_hours.end,
      days: location.working_hours?.days ?? [1, 2, 3, 4, 5],
    };
  }

  Object.assign(location, updates);
  await location.save();

  await auditLogger.log({
    req,
    action: 'location.updated',
    module: 'locations',
    object_type: 'Location',
    object_id: location._id.toString(),
    object_label: location.name,
    before_state: beforeState,
    after_state: location.toObject(),
  });

  res.status(200).json({ success: true, data: location });
});

/**
 * DELETE /locations/:id
 * Deletes a location. Blocked if users are assigned to it (409 with count).
 */
export const deleteLocation = asyncHandler(async (req: Request, res: Response) => {
  const location = await Location.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_deleted: { $ne: true },
  });

  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  // Check if users are assigned to this location
  const userCount = await User.countDocuments({
    company_id: req.user.company_id,
    location_id: location._id,
    is_active: true,
  });

  if (userCount > 0) {
    throw new AppError(
      `Cannot delete location "${location.name}" — it has ${userCount} active user${userCount > 1 ? 's' : ''} assigned. Reassign or remove users first.`,
      409,
      'LOCATION_HAS_USERS'
    );
  }

  // Check if child locations exist
  const childCount = await Location.countDocuments({
    company_id: req.user.company_id,
    parent_id: location._id,
    is_deleted: { $ne: true },
  });

  if (childCount > 0) {
    throw new AppError(
      `Cannot delete location "${location.name}" — it has ${childCount} child location${childCount > 1 ? 's' : ''}. Reassign or remove child locations first.`,
      409,
      'LOCATION_HAS_CHILDREN'
    );
  }

  // Check if access rules reference this location
  const accessRuleCount = await AccessControlPolicy.countDocuments({
    company_id: req.user.company_id,
    'conditions.location_id': req.params.id,
  });
  if (accessRuleCount > 0) {
    throw new AppError(
      `Cannot delete location "${location.name}" — it is referenced by ${accessRuleCount} access rule${accessRuleCount > 1 ? 's' : ''}. Remove the rules first.`,
      409,
      'LOCATION_HAS_ACCESS_RULES'
    );
  }

  // Check if work schedule assignments reference this location
  const { WorkScheduleAssignment } = await import('../models/WorkScheduleAssignment.model');
  const scheduleCount = await WorkScheduleAssignment.countDocuments({
    company_id: req.user.company_id,
    location_id: location._id,
  });
  if (scheduleCount > 0) {
    throw new AppError(
      `Cannot delete location "${location.name}" — it has ${scheduleCount} work schedule assignment${scheduleCount > 1 ? 's' : ''}. Remove assignments first.`,
      409,
      'LOCATION_HAS_SCHEDULE_ASSIGNMENTS'
    );
  }

  // Check if holiday assignments reference this location
  const { HolidayAssignment } = await import('../models/HolidayAssignment.model');
  const holidayCount = await HolidayAssignment.countDocuments({
    company_id: req.user.company_id,
    location_id: location._id,
  });
  if (holidayCount > 0) {
    throw new AppError(
      `Cannot delete location "${location.name}" — it has ${holidayCount} holiday assignment${holidayCount > 1 ? 's' : ''}. Remove assignments first.`,
      409,
      'LOCATION_HAS_HOLIDAY_ASSIGNMENTS'
    );
  }

  const beforeState = location.toObject();

  // Clean up orphaned policy assignments for this location
  await PolicyAssignment.deleteMany({
    company_id: req.user.company_id,
    target_type: 'location',
    target_id: req.params.id,
  });

  // Soft delete — mark as deleted instead of removing
  location.is_deleted = true;
  location.deleted_at = new Date();
  await location.save();

  await auditLogger.log({
    req,
    action: 'location.deleted',
    module: 'locations',
    object_type: 'Location',
    object_id: location._id.toString(),
    object_label: location.name,
    before_state: beforeState,
    after_state: location.toObject(),
  });

  res.status(200).json({ success: true, data: {} });
});

/**
 * GET /locations/:id/users
 * Returns all users assigned to a specific location.
 */
export const getLocationUsers = asyncHandler(async (req: Request, res: Response) => {
  const location = await Location.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_deleted: { $ne: true },
  });
  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  const users = await User.find({
    company_id: req.user.company_id,
    location_id: location._id,
    is_active: true,
  })
    .select('full_name email employee_id department_id lifecycle_state')
    .populate('department_id', 'name slug')
    .sort({ full_name: 1 })
    .lean();

  res.status(200).json({ success: true, data: users });
});

/**
 * GET /locations/:id/policies
 * Returns policies assigned to a location (both global and location-specific).
 */
export const getLocationPolicies = asyncHandler(async (req: Request, res: Response) => {
  const location = await Location.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_deleted: { $ne: true },
  });
  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  const policyView = await locationSettingsService.getLocationPolicyView(
    req.params.id,
    req.user.company_id
  );

  res.status(200).json({ success: true, data: policyView });
});

/**
 * GET /locations/:id/effective-settings
 * Returns the effective settings that users at this location would inherit.
 */
export const getLocationEffectiveSettings = asyncHandler(async (req: Request, res: Response) => {
  const location = await Location.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_deleted: { $ne: true },
  });
  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  const userCount = await User.countDocuments({
    company_id: req.user.company_id,
    location_id: location._id,
    is_active: true,
  });

  const policyView = await locationSettingsService.getLocationPolicyView(
    req.params.id,
    req.user.company_id
  );

  res.status(200).json({
    success: true,
    data: {
      timezone: location.timezone,
      working_hours: location.working_hours,
      user_count: userCount,
      policies: policyView,
    },
  });
});

/**
 * POST /locations/:id/assign-policy
 * Assigns a published policy to this location.
 */
export const assignPolicyToLocation = asyncHandler(async (req: Request, res: Response) => {
  const location = await Location.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_deleted: { $ne: true },
  });
  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  const input = z.object({
    policy_version_id: z.string().min(1),
  }).parse(req.body);

  const policyVersion = await PolicyVersion.findOne({
    _id: input.policy_version_id,
    company_id: req.user.company_id,
    status: 'published',
  });
  if (!policyVersion) {
    throw new AppError('Published policy version not found', 404, 'POLICY_NOT_FOUND');
  }

  const existing = await PolicyAssignment.findOne({
    company_id: req.user.company_id,
    policy_version_id: policyVersion._id,
    target_type: 'location',
    target_id: req.params.id,
  });
  if (existing) {
    throw new AppError('Policy is already assigned to this location', 400, 'POLICY_ALREADY_ASSIGNED');
  }

  // Check if this policy is a locked global policy that cannot be overridden
  const globalPolicyAssignments = await PolicyAssignment.find({
    company_id: req.user.company_id,
    target_type: 'all',
  }).lean();
  const isLockedGlobal = globalPolicyAssignments.some(
    (gpa) => gpa.policy_version_id.toString() === input.policy_version_id
  );
  if (isLockedGlobal) {
    throw new AppError(
      'This global policy is locked and cannot be overridden at the location level.',
      400,
      'LOCKED_POLICY_CANNOT_OVERRIDE'
    );
  }

  const assignment = await PolicyAssignment.create({
    company_id: req.user.company_id,
    policy_version_id: policyVersion._id,
    target_type: 'location',
    target_id: req.params.id,
    target_label: location.name,
  });

  await auditLogger.log({
    req,
    action: 'policy.location_assigned',
    module: 'locations',
    object_type: 'PolicyAssignment',
    object_id: assignment._id.toString(),
    object_label: `${policyVersion.title} v${policyVersion.version_number} → ${location.name}`,
    before_state: null,
    after_state: {
      policy_version_id: policyVersion._id.toString(),
      location_id: req.params.id,
      location_name: location.name,
      policy_title: policyVersion.title,
    },
  });

  res.status(201).json({ success: true, data: assignment });
});

/**
 * DELETE /locations/:id/policies/:policyVersionId
 * Removes a policy assignment from this location.
 */
export const removeLocationPolicy = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await PolicyAssignment.findOne({
    company_id: req.user.company_id,
    policy_version_id: req.params.policyVersionId,
    target_type: 'location',
    target_id: req.params.id,
  });
  if (!assignment) {
    throw new AppError('Policy assignment not found for this location', 404, 'ASSIGNMENT_NOT_FOUND');
  }

  const beforeState = assignment.toObject();
  await PolicyAssignment.findByIdAndDelete(assignment._id);

  await auditLogger.log({
    req,
    action: 'policy.location_assignment_removed',
    module: 'locations',
    object_type: 'PolicyAssignment',
    object_id: assignment._id.toString(),
    object_label: `${assignment.target_label}`,
    before_state: beforeState,
    after_state: null,
  });

  res.status(200).json({ success: true, data: {} });
});
