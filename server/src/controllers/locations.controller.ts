// server/src/controllers/locations.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { Location } from '../models/Location.model';
<<<<<<< HEAD
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
import { Types } from 'mongoose';
=======
import { User } from '../models/User.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const CreateLocationSchema = z.object({
<<<<<<< HEAD
  name: z.string().min(1).max(200),
  type: z.enum(['region', 'country', 'city', 'office']),
  parent_id: z.string().optional().nullable(),
  timezone: z.string().default('UTC'),
  is_headquarters: z.boolean().default(false),
  address: z.string().optional(),
  working_hours: z
    .object({
      start: z.string(),
      end: z.string(),
      days: z.array(z.number()),
    })
    .optional(),
=======
  name: z.string().min(1, 'Name is required').max(150),
  type: z.enum(['region', 'country', 'city', 'office']),
  parent_id: z.string().optional().nullable(),
  timezone: z.string().min(1, 'Timezone is required').default('UTC'),
  is_headquarters: z.boolean().default(false),
  address: z.string().optional().nullable(),
  working_hours: z.object({
    start: z.string(),
    end: z.string(),
    days: z.array(z.number().min(0).max(6)),
  }).optional().nullable(),
>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e
});

const UpdateLocationSchema = CreateLocationSchema.partial();

<<<<<<< HEAD
=======
// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Enriches a location list with user count (active users assigned to each location).
 */
async function enrichLocations(
  locations: ReturnType<typeof Location.prototype.toObject>[]
): Promise<typeof locations> {
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

>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e
// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /locations
<<<<<<< HEAD
 * Returns all active locations for the current company.
 */
export const getLocations = asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.query;

  const filter: Record<string, unknown> = {
    company_id: new Types.ObjectId(req.user.company_id),
  };

  if (type) {
    filter.type = type;
  }

  const locations = await Location.find(filter)
    .populate('parent_id', 'name')
    .sort({ created_at: 1 });

  res.status(200).json({ success: true, data: locations });
=======
 * Returns all locations for the requesting company, enriched with user counts.
 */
export const getLocations = asyncHandler(async (req: Request, res: Response) => {
  const locations = await Location.find({
    company_id: req.user.company_id,
  })
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
  })
    .populate('parent_id', 'name type')
    .sort({ created_at: 1 })
    .lean();

  const enriched = await enrichLocations(locations);

  // Build tree
  const map = new Map<string, typeof enriched[number] & { children: unknown[] }>();
  const tree: (typeof enriched[number] & { children: unknown[] })[] = [];

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
>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e
});

/**
 * GET /locations/:id
 * Returns a single location by ID, scoped to the company.
 */
export const getLocationById = asyncHandler(async (req: Request, res: Response) => {
  const location = await Location.findOne({
    _id: req.params.id,
<<<<<<< HEAD
    company_id: new Types.ObjectId(req.user.company_id),
  }).populate('parent_id', 'name');
=======
    company_id: req.user.company_id,
  }).populate('parent_id', 'name type');
>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e

  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

<<<<<<< HEAD
  res.status(200).json({ success: true, data: location });
=======
  const [enriched] = await enrichLocations([location.toObject()]);
  res.status(200).json({ success: true, data: enriched });
>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e
});

/**
 * POST /locations
 * Creates a new location scoped to the requesting company's tenant.
<<<<<<< HEAD
 * Produces audit event: location.created
=======
>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e
 */
export const createLocation = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateLocationSchema.parse(req.body);

  const location = await Location.create({
    ...input,
    parent_id: input.parent_id || undefined,
<<<<<<< HEAD
    company_id: new Types.ObjectId(req.user.company_id),
  });

  // Audit log
=======
    address: input.address || undefined,
    working_hours: input.working_hours || undefined,
    company_id: req.user.company_id,
  });

>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e
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
<<<<<<< HEAD
 * Produces audit event: location.updated
=======
>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e
 */
export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateLocationSchema.parse(req.body);

  const location = await Location.findOne({
    _id: req.params.id,
<<<<<<< HEAD
    company_id: new Types.ObjectId(req.user.company_id),
=======
    company_id: req.user.company_id,
>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e
  });

  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  const beforeState = location.toObject();

<<<<<<< HEAD
  const updates: Record<string, unknown> = { ...input };
  if (updates.parent_id === '') updates.parent_id = null;
=======
  // Normalize empty strings → undefined
  const updates: Record<string, unknown> = { ...input };
  if (updates.parent_id === '') updates.parent_id = null;
  if (updates.address === '') updates.address = null;
>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e

  Object.assign(location, updates);
  await location.save();

<<<<<<< HEAD
  // Audit log
=======
>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e
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
<<<<<<< HEAD
 * Hard-deletes a location. Produces audit event: location.deleted
=======
 * Deletes a location. Blocked if users are assigned to it (409 with count).
>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e
 */
export const deleteLocation = asyncHandler(async (req: Request, res: Response) => {
  const location = await Location.findOne({
    _id: req.params.id,
<<<<<<< HEAD
    company_id: new Types.ObjectId(req.user.company_id),
=======
    company_id: req.user.company_id,
>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e
  });

  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

<<<<<<< HEAD
  const beforeState = location.toObject();

  // Audit log before deletion
=======
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

  const beforeState = location.toObject();

  await Location.deleteOne({ _id: location._id });

>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e
  await auditLogger.log({
    req,
    action: 'location.deleted',
    module: 'locations',
    object_type: 'Location',
    object_id: location._id.toString(),
    object_label: location.name,
    before_state: beforeState,
    after_state: null,
  });

<<<<<<< HEAD
  await Location.deleteOne({ _id: location._id });

=======
>>>>>>> 0212f123cbde2de2952f948712c61f2a54cfb53e
  res.status(200).json({ success: true, data: {} });
});
