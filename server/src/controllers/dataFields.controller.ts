// server/src/controllers/dataFields.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { CustomField } from '../models/CustomField.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const CreateCustomFieldSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).regex(/^[a-z0-9_]+$/, 'Name must be lowercase letters, numbers, and underscores only'),
  field_type: z.enum(['text', 'number', 'date', 'select', 'multi_select', 'checkbox', 'textarea']),
  target_object: z.enum(['user', 'department', 'policy']),
  label: z.string().min(1, 'Label is required').max(150),
  placeholder: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  required: z.boolean().default(false),
  select_options: z.array(z.string().min(1)).optional().nullable(),
  visibility: z.enum(['all', 'admin_only', 'role_specific']).default('all'),
  visible_roles: z.array(z.string()).optional().nullable(),
  display_order: z.number().int().min(0).optional().default(0),
});

const UpdateCustomFieldSchema = CreateCustomFieldSchema.partial().refine((data) => {
  // field_type cannot be changed after creation
  if (data.field_type !== undefined) {
    return false;
  }
  return true;
}, {
  message: 'field_type cannot be changed after field creation.',
  path: ['field_type'],
});

const ReorderFieldsSchema = z.object({
  field_ids: z.array(z.string()),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Auto-generates a slug from the name/label for the field.
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /data-fields
 * Returns all custom fields for the requesting company, optionally filtered by target_object.
 * Query param: ?target_object=user|department|policy
 */
export const getCustomFields = asyncHandler(async (req: Request, res: Response) => {
  const { target_object } = req.query;

  const query: Record<string, unknown> = {
    company_id: req.user.company_id,
    is_active: true,
  };

  if (target_object && ['user', 'department', 'policy'].includes(target_object as string)) {
    query.target_object = target_object;
  }

  const fields = await CustomField.find(query)
    .sort({ display_order: 1, created_at: 1 })
    .lean();

  res.status(200).json({ success: true, data: fields });
});

/**
 * GET /data-fields/:id
 * Returns a single custom field by ID, scoped to the company.
 */
export const getCustomFieldById = asyncHandler(async (req: Request, res: Response) => {
  const field = await CustomField.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!field) {
    throw new AppError('Custom field not found', 404, 'NOT_FOUND');
  }

  res.status(200).json({ success: true, data: field });
});

/**
 * POST /data-fields
 * Creates a new custom field scoped to the requesting company's tenant.
 * Automatically assigns display_order to place it at the end of the list.
 */
export const createCustomField = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateCustomFieldSchema.parse(req.body);

  // Auto-assign display_order: get max order + 1
  const maxOrderField = await CustomField.findOne({
    company_id: req.user.company_id,
    target_object: input.target_object,
  })
    .sort({ display_order: -1 })
    .select('display_order')
    .lean();

  const displayOrder = maxOrderField ? maxOrderField.display_order + 1 : 0;

  const field = await CustomField.create({
    ...input,
    slug: generateSlug(input.name),
    placeholder: input.placeholder || undefined,
    description: input.description || undefined,
    select_options: input.select_options || undefined,
    visible_roles: input.visible_roles || undefined,
    company_id: req.user.company_id,
    display_order: displayOrder,
  });

  await auditLogger.log({
    req,
    action: 'custom_field.created',
    module: 'data_fields',
    object_type: 'CustomField',
    object_id: field._id.toString(),
    object_label: field.label,
    before_state: null,
    after_state: field.toObject(),
  });

  res.status(201).json({ success: true, data: field });
});

/**
 * PUT /data-fields/:id
 * Updates an existing custom field. field_type cannot be changed (returns 400).
 */
export const updateCustomField = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateCustomFieldSchema.parse(req.body);

  const field = await CustomField.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!field) {
    throw new AppError('Custom field not found', 404, 'NOT_FOUND');
  }

  const beforeState = field.toObject();

  // Normalize empty strings
  const updates: Record<string, unknown> = { ...input };
  if (updates.placeholder === '') updates.placeholder = null;
  if (updates.description === '') updates.description = null;

  Object.assign(field, updates);
  await field.save();

  await auditLogger.log({
    req,
    action: 'custom_field.updated',
    module: 'data_fields',
    object_type: 'CustomField',
    object_id: field._id.toString(),
    object_label: field.label,
    before_state: beforeState,
    after_state: field.toObject(),
  });

  res.status(200).json({ success: true, data: field });
});

/**
 * DELETE /data-fields/:id
 * Soft-deletes (deactivates) a custom field. Does not remove values from existing records.
 */
export const deleteCustomField = asyncHandler(async (req: Request, res: Response) => {
  const field = await CustomField.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  });

  if (!field) {
    throw new AppError('Custom field not found', 404, 'NOT_FOUND');
  }

  const beforeState = field.toObject();

  field.is_active = false;
  await field.save();

  await auditLogger.log({
    req,
    action: 'custom_field.deleted',
    module: 'data_fields',
    object_type: 'CustomField',
    object_id: field._id.toString(),
    object_label: field.label,
    before_state: beforeState,
    after_state: field.toObject(),
  });

  res.status(200).json({ success: true, data: {} });
});

/**
 * PUT /data-fields/reorder
 * Updates display_order for multiple fields in one request.
 * Used for drag-to-reorder functionality.
 */
export const reorderCustomFields = asyncHandler(async (req: Request, res: Response) => {
  const { field_ids } = ReorderFieldsSchema.parse(req.body);

  if (field_ids.length === 0) {
    throw new AppError('field_ids array cannot be empty', 400, 'INVALID_INPUT');
  }

  // Verify all fields belong to this company
  const fields = await CustomField.find({
    _id: { $in: field_ids },
    company_id: req.user.company_id,
  });

  if (fields.length !== field_ids.length) {
    throw new AppError('One or more fields not found or not accessible', 404, 'NOT_FOUND');
  }

  // Update display_order for each field
  const updateOps = fields.map((field, index) => ({
    updateOne: {
      filter: { _id: field._id },
      update: { display_order: index },
    },
  }));

  await CustomField.bulkWrite(updateOps);

  await auditLogger.log({
    req,
    action: 'custom_field.reordered',
    module: 'data_fields',
    object_type: 'CustomField',
    object_id: field_ids.join(','),
    object_label: `${field_ids.length} fields reordered`,
    before_state: { field_ids: fields.map((f) => ({ id: f._id.toString(), order: f.display_order })) },
    after_state: { field_ids: field_ids.map((id, index) => ({ id, order: index })) },
  });

  res.status(200).json({ success: true, data: { reordered_count: field_ids.length } });
});
