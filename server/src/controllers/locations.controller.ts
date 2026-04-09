// server/src/controllers/locations.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { Location } from '../models/Location.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
import { Types } from 'mongoose';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const CreateLocationSchema = z.object({
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
});

const UpdateLocationSchema = CreateLocationSchema.partial();

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /locations
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
});

/**
 * GET /locations/:id
 * Returns a single location by ID, scoped to the company.
 */
export const getLocationById = asyncHandler(async (req: Request, res: Response) => {
  const location = await Location.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  }).populate('parent_id', 'name');

  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  res.status(200).json({ success: true, data: location });
});

/**
 * POST /locations
 * Creates a new location scoped to the requesting company's tenant.
 * Produces audit event: location.created
 */
export const createLocation = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateLocationSchema.parse(req.body);

  const location = await Location.create({
    ...input,
    parent_id: input.parent_id || undefined,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  // Audit log
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
 * Produces audit event: location.updated
 */
export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateLocationSchema.parse(req.body);

  const location = await Location.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  const beforeState = location.toObject();

  const updates: Record<string, unknown> = { ...input };
  if (updates.parent_id === '') updates.parent_id = null;

  Object.assign(location, updates);
  await location.save();

  // Audit log
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
 * Hard-deletes a location. Produces audit event: location.deleted
 */
export const deleteLocation = asyncHandler(async (req: Request, res: Response) => {
  const location = await Location.findOne({
    _id: req.params.id,
    company_id: new Types.ObjectId(req.user.company_id),
  });

  if (!location) {
    throw new AppError('Location not found', 404, 'NOT_FOUND');
  }

  const beforeState = location.toObject();

  // Audit log before deletion
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

  await Location.deleteOne({ _id: location._id });

  res.status(200).json({ success: true, data: {} });
});
