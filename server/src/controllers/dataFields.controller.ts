// server/src/controllers/dataFields.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { CustomField, ICustomField, FieldType } from '../models/CustomField.model';
import { CustomFieldVersion } from '../models/CustomFieldVersion.model';
import { ProfileLayout } from '../models/ProfileLayout.model';
import { User } from '../models/User.model';
import { Department } from '../models/Department.model';
import { PolicyVersion } from '../models/PolicyVersion.model';
import { Team } from '../models/Team.model';
import { Location } from '../models/Location.model';
import { Holiday } from '../models/Holiday.model';
import { HolidayCalendar } from '../models/HolidayCalendar.model';
import { WorkSchedule } from '../models/WorkSchedule.model';
import { WorkflowStep } from '../models/WorkflowStep.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
import { Types } from 'mongoose';
import { validateFieldValue, validateAndSanitizeCustomFields, resolveEffectiveCustomFields, resolveStandardFieldPermissions, coerceFieldValue } from '../services/customFieldValidation.service';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const ValidationRulesSchema = z.object({
  required: z.boolean().optional(),
  min_length: z.number().int().min(0).optional(),
  max_length: z.number().int().min(1).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  pattern_message: z.string().optional(),
});

const ConditionalRuleSchema = z.object({
  field_slug: z.string().min(1),
  operator: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty']),
  value: z.unknown(),
  action: z.enum(['show', 'hide', 'require', 'optional']),
});

const FIELD_TYPES = ['text', 'number', 'date', 'boolean', 'select', 'multi_select', 'url', 'email', 'phone'] as const;
const TARGET_OBJECTS = ['user', 'department', 'policy', 'team', 'location', 'holiday', 'holiday_calendar', 'work_schedule'] as const;
const VISIBILITY_RULES = ['all', 'admin_only', 'role_specific'] as const;

const CreateCustomFieldSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers, and underscores only'),
  field_type: z.enum(FIELD_TYPES),
  target_object: z.enum(TARGET_OBJECTS),
  label: z.string().min(1, 'Label is required').max(150),
  placeholder: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  required: z.boolean().default(false),
  default_value: z.string().optional().nullable(),
  select_options: z.array(z.string().min(1)).optional().nullable(),
  validation_rules: ValidationRulesSchema.optional().nullable(),
  visibility: z.enum(VISIBILITY_RULES).default('all'),
  visible_roles: z.array(z.string()).optional().nullable(),
  edit_visibility: z.enum(VISIBILITY_RULES).default('all'),
  edit_visible_roles: z.array(z.string()).optional().nullable(),
  conditional_logic: z.array(ConditionalRuleSchema).optional().nullable(),
  field_dependencies: z.array(z.string()).optional().nullable(),
  display_order: z.number().int().min(0).optional().default(0),
});

const UpdateCustomFieldSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers, and underscores only').optional(),
  field_type: z.enum(FIELD_TYPES).optional(),
  label: z.string().min(1).max(150).optional(),
  placeholder: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  required: z.boolean().optional(),
  default_value: z.string().optional().nullable(),
  select_options: z.array(z.string().min(1)).optional().nullable(),
  validation_rules: ValidationRulesSchema.optional().nullable(),
  visibility: z.enum(VISIBILITY_RULES).optional(),
  visible_roles: z.array(z.string()).optional().nullable(),
  edit_visibility: z.enum(VISIBILITY_RULES).optional(),
  edit_visible_roles: z.array(z.string()).optional().nullable(),
  conditional_logic: z.array(ConditionalRuleSchema).optional().nullable(),
  field_dependencies: z.array(z.string()).optional().nullable(),
  display_order: z.number().int().min(0).optional(),
});

const ReorderFieldsSchema = z.object({
  field_ids: z.array(z.string()),
  target_object: z.enum(TARGET_OBJECTS).optional(),
});

const ProfileLayoutFieldSchema = z.object({
  field_id: z.string(),
  display_order: z.number().int().min(0),
  is_visible: z.boolean().default(true),
  is_editable: z.boolean().default(true),
});

const CreateProfileLayoutSchema = z.object({
  target_object: z.enum(TARGET_OBJECTS),
  role_id: z.string().optional().nullable(),
  name: z.string().min(1, 'Name is required').max(100),
  fields: z.array(ProfileLayoutFieldSchema),
  is_default: z.boolean().default(false),
});

const UpdateProfileLayoutSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  fields: z.array(ProfileLayoutFieldSchema).optional(),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Verifies that no other active field in the same company + target object uses the given slug.
 * Field names must be unique within an object (story 106).
 */
async function assertUniqueSlug(companyId: string, targetObject: string, slug: string, excludeFieldId?: string): Promise<void> {
  const filter: Record<string, unknown> = {
    company_id: companyId,
    target_object: targetObject,
    slug,
  };
  if (excludeFieldId) {
    filter._id = { $ne: new Types.ObjectId(excludeFieldId) };
  }

  const existing = await CustomField.findOne(filter).select('_id label').lean();
  if (existing) {
    throw new AppError(
      `A field named "${existing.label}" already exists for this object. Field names must be unique within the same object.`,
      400,
      'DUPLICATE_FIELD_NAME',
    );
  }
}

/**
 * Validates the conditional_logic array on a custom field definition.
 * Ensures that every referenced field_slug corresponds to an existing active field
 * on the same target_object, and prevents self-referencing rules (circular dependencies).
 * System field slugs (e.g. full_name, email) are always considered valid references.
 */
const SYSTEM_FIELD_SLUGS = new Set<string>([
  'full_name', 'email', 'phone', 'department', 'location', 'job_title',
  'employee_id', 'hire_date', 'employment_type',
]);

async function validateConditionalLogic(
  companyId: string,
  targetObject: string,
  conditionalLogic: unknown,
  currentFieldSlug?: string,
): Promise<void> {
  if (!Array.isArray(conditionalLogic) || conditionalLogic.length === 0) return;

  const existingSlugs = await CustomField.find({
    company_id: companyId,
    target_object: targetObject,
    is_active: true,
  })
    .select('slug label')
    .lean();

  const validSlugs = new Set<string>(existingSlugs.map((f) => f.slug));
  const slugToField = new Map<string, string>();
  for (const f of existingSlugs) {
    slugToField.set(f.slug, f.label);
  }

  for (const [i, rule] of conditionalLogic.entries()) {
    const r = rule as { field_slug?: string; operator?: string };
    if (!r.field_slug) {
      throw new AppError(
        `Conditional rule #${i + 1}: field reference is required.`,
        400,
        'INVALID_CONDITIONAL_RULE',
      );
    }

    if (currentFieldSlug && r.field_slug === currentFieldSlug) {
      throw new AppError(
        `Conditional rule #${i + 1}: "${r.field_slug}" — a field cannot reference itself.`,
        400,
        'SELF_REFERENCING_RULE',
      );
    }

    const isSystemSlug = SYSTEM_FIELD_SLUGS.has(r.field_slug);
    const isCustomSlug = validSlugs.has(r.field_slug);
    if (!isSystemSlug && !isCustomSlug) {
      throw new AppError(
        `Conditional rule #${i + 1}: field "${r.field_slug}" does not exist for this object. Select a valid field from the list.`,
        400,
        'INVALID_CONDITIONAL_RULE',
      );
    }
  }
}

async function saveVersionSnapshot(
  fieldId: string,
  companyId: string,
  changeType: 'created' | 'updated' | 'deleted' | 'restored',
  snapshot: Record<string, unknown>,
  changedBy: string,
  changeSummary?: string,
): Promise<void> {
  const lastVersion = await CustomFieldVersion.findOne({
    field_id: fieldId,
    company_id: companyId,
  })
    .sort({ version_number: -1 })
    .select('version_number')
    .lean();

  const versionNumber = (lastVersion?.version_number ?? 0) + 1;

  await CustomFieldVersion.create({
    company_id: companyId,
    field_id: fieldId,
    version_number: versionNumber,
    change_type: changeType,
    snapshot,
    changed_by: changedBy,
    change_summary: changeSummary,
  });
}

async function checkFieldExistsWithData(fieldId: string, companyId: string, targetObject: string): Promise<{ hasData: boolean; recordCount: number }> {
  const field = await CustomField.findOne({ _id: fieldId, company_id: companyId }).lean();
  if (!field) return { hasData: false, recordCount: 0 };

  let count = 0;

  switch (targetObject) {
    case 'user':
      count = await User.countDocuments({
        company_id: companyId,
        [`custom_fields.${field.slug}`]: { $exists: true, $ne: null },
      });
      break;
    case 'department':
      count = await Department.countDocuments({
        company_id: companyId,
        [`custom_fields.${field.slug}`]: { $exists: true, $ne: null },
      });
      break;
    case 'policy':
      count = await PolicyVersion.countDocuments({
        company_id: companyId,
        [`custom_fields.${field.slug}`]: { $exists: true, $ne: null },
      });
      break;
    case 'team':
      count = await Team.countDocuments({
        company_id: companyId,
        [`custom_fields.${field.slug}`]: { $exists: true, $ne: null },
      });
      break;
    case 'location':
      count = await Location.countDocuments({
        company_id: companyId,
        [`custom_fields.${field.slug}`]: { $exists: true, $ne: null },
      });
      break;
    case 'holiday':
      count = await Holiday.countDocuments({
        [`custom_fields.${field.slug}`]: { $exists: true, $ne: null },
      });
      break;
    case 'holiday_calendar':
      count = await HolidayCalendar.countDocuments({
        company_id: companyId,
        [`custom_fields.${field.slug}`]: { $exists: true, $ne: null },
      });
      break;
    case 'work_schedule':
      count = await WorkSchedule.countDocuments({
        company_id: companyId,
        [`custom_fields.${field.slug}`]: { $exists: true, $ne: null },
      });
      break;
  }

  return { hasData: count > 0, recordCount: count };
}

async function checkFieldDependencies(fieldId: string, companyId: string): Promise<{ hasDependents: boolean; dependentFields: Array<{ _id: string; label: string }> }> {
  const dependents = await CustomField.find({
    company_id: companyId,
    is_active: true,
    field_dependencies: new Types.ObjectId(fieldId),
  })
    .select('_id label')
    .lean();

  return {
    hasDependents: dependents.length > 0,
    dependentFields: dependents.map((d) => ({ _id: d._id.toString(), label: d.label })),
  };
}

async function checkConditionalDependencies(fieldId: string, companyId: string): Promise<{ hasDependents: boolean; dependentFields: Array<{ _id: string; label: string }> }> {
  const field = await CustomField.findById(fieldId).select('slug').lean();
  if (!field) return { hasDependents: false, dependentFields: [] };

  const dependents = await CustomField.find({
    company_id: companyId,
    is_active: true,
    'conditional_logic.field_slug': field.slug,
  })
    .select('_id label')
    .lean();

  return {
    hasDependents: dependents.length > 0,
    dependentFields: dependents.map((d) => ({ _id: d._id.toString(), label: d.label })),
  };
}

/**
 * Checks if any active workflow steps reference the given custom field slug
 * in their conditions or action_config.
 */
async function checkWorkflowDependencies(fieldSlug: string, companyId: string): Promise<{ hasDependents: boolean; dependentWorkflows: Array<{ _id: string; name: string; stepName: string }> }> {
  const steps = await WorkflowStep.find({
    company_id: companyId,
    is_active: true,
  })
    .or([
      { 'conditions.field': fieldSlug },
      { 'action_config.field_slug': fieldSlug },
      { 'action_config.custom_field': fieldSlug },
      { 'action_config.field': fieldSlug },
    ])
    .populate('workflow_id', 'name')
    .select('name workflow_id')
    .lean();

  if (steps.length === 0) {
    return { hasDependents: false, dependentWorkflows: [] };
  }

  const seen = new Set<string>();
  const workflows: Array<{ _id: string; name: string; stepName: string }> = [];

  for (const step of steps) {
    const wfId = ((step.workflow_id as any)?._id?.toString()) || String(step.workflow_id);
    const key = `${wfId}-${step._id.toString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    workflows.push({
      _id: wfId,
      name: (step.workflow_id as any)?.name || 'Unknown Workflow',
      stepName: step.name || 'Unnamed Step',
    });
  }

  return { hasDependents: workflows.length > 0, dependentWorkflows: workflows };
}

// Field value validation is shared via services/customFieldValidation.service.ts
// (validateFieldValue / validateAndSanitizeCustomFields).

/**
 * Result of a data migration operation, returned to the client so the UI can
 * report what happened.
 */
interface MigrationResult {
  old_slug: string;
  new_slug: string;
  records_migrated: number;
}

interface TypeChangeResult {
  old_type: FieldType;
  new_type: FieldType;
  values_coerced: number;
  records_migrated: number;
}

/**
 * Migrates custom field data from an old slug to a new slug across all records
 * of the target object type. Uses MongoDB's $rename operator to atomically move
 * the key within the custom_fields map — data is preserved, not deleted.
 */
async function migrateFieldRename(
  companyId: string,
  targetObject: string,
  oldSlug: string,
  newSlug: string,
): Promise<MigrationResult> {
  let result: { modifiedCount: number } | undefined;

  if (targetObject === 'user') {
    result = (await User.updateMany(
      { company_id: companyId, [`custom_fields.${oldSlug}`]: { $exists: true } },
      { $rename: { [`custom_fields.${oldSlug}`]: `custom_fields.${newSlug}` } },
    )) as unknown as { modifiedCount: number };
  } else if (targetObject === 'department') {
    result = (await Department.updateMany(
      { company_id: companyId, [`custom_fields.${oldSlug}`]: { $exists: true } },
      { $rename: { [`custom_fields.${oldSlug}`]: `custom_fields.${newSlug}` } },
    )) as unknown as { modifiedCount: number };
  } else if (targetObject === 'policy') {
    result = (await PolicyVersion.updateMany(
      { company_id: companyId, [`custom_fields.${oldSlug}`]: { $exists: true } },
      { $rename: { [`custom_fields.${oldSlug}`]: `custom_fields.${newSlug}` } },
    )) as unknown as { modifiedCount: number };
  } else if (targetObject === 'team') {
    result = (await Team.updateMany(
      { company_id: companyId, [`custom_fields.${oldSlug}`]: { $exists: true } },
      { $rename: { [`custom_fields.${oldSlug}`]: `custom_fields.${newSlug}` } },
    )) as unknown as { modifiedCount: number };
  } else if (targetObject === 'location') {
    result = (await Location.updateMany(
      { company_id: companyId, [`custom_fields.${oldSlug}`]: { $exists: true } },
      { $rename: { [`custom_fields.${oldSlug}`]: `custom_fields.${newSlug}` } },
    )) as unknown as { modifiedCount: number };
  } else if (targetObject === 'holiday') {
    result = (await Holiday.updateMany(
      { [`custom_fields.${oldSlug}`]: { $exists: true } },
      { $rename: { [`custom_fields.${oldSlug}`]: `custom_fields.${newSlug}` } },
    )) as unknown as { modifiedCount: number };
  } else if (targetObject === 'holiday_calendar') {
    result = (await HolidayCalendar.updateMany(
      { company_id: companyId, [`custom_fields.${oldSlug}`]: { $exists: true } },
      { $rename: { [`custom_fields.${oldSlug}`]: `custom_fields.${newSlug}` } },
    )) as unknown as { modifiedCount: number };
  } else if (targetObject === 'work_schedule') {
    result = (await WorkSchedule.updateMany(
      { company_id: companyId, [`custom_fields.${oldSlug}`]: { $exists: true } },
      { $rename: { [`custom_fields.${oldSlug}`]: `custom_fields.${newSlug}` } },
    )) as unknown as { modifiedCount: number };
  }

  return {
    old_slug: oldSlug,
    new_slug: newSlug,
    records_migrated: result?.modifiedCount ?? 0,
  };
}

/**
 * Updates conditional_logic references to a renamed field slug across all
 * other active custom fields in the same company + target_object.
 * This ensures that rules referencing the old slug continue to work after rename.
 */
async function updateConditionalLogicReferences(
  companyId: string,
  targetObject: string,
  oldSlug: string,
  newSlug: string,
): Promise<{ fields_updated: number }> {
  const result = await CustomField.updateMany(
    {
      company_id: companyId,
      target_object: targetObject,
      is_active: true,
      'conditional_logic.field_slug': oldSlug,
    },
    {
      $set: { 'conditional_logic.$[elem].field_slug': newSlug },
    },
    {
      arrayFilters: [{ 'elem.field_slug': oldSlug }],
    },
  );

  return { fields_updated: result.modifiedCount };
}

/**
 * Validates and migrates existing field data when the field_type changes.
 *
 * 1. Fetches all records that have a value for this field.
 * 2. For each value, attempts to coerce it from the old type to the new type.
 * 3. Also validates the coerced value against the new field's rules (range, options, etc.).
 * 4. If ANY value cannot be coerced or fails validation, throws an AppError listing the
 *    first failures so the admin knows which data is blocking the change.
 * 5. If all values pass, applies the coerced values in a single batch.
 *
 * Returns the count of records migrated.
 */
async function migrateFieldTypeChange(
  companyId: string,
  targetObject: string,
  field: ICustomField,
  newType: FieldType,
): Promise<TypeChangeResult> {
  // Fetch all documents that have a value for this field slug
  const query: Record<string, unknown> = {
    company_id: companyId,
    [`custom_fields.${field.slug}`]: { $exists: true, $ne: null },
  };

  let Model;
  if (targetObject === 'user') Model = User;
  else if (targetObject === 'department') Model = Department;
  else if (targetObject === 'policy') Model = PolicyVersion;
  else if (targetObject === 'team') Model = Team;
  else if (targetObject === 'location') Model = Location;
  else if (targetObject === 'holiday') Model = Holiday;
  else if (targetObject === 'holiday_calendar') Model = HolidayCalendar;
  else if (targetObject === 'work_schedule') Model = WorkSchedule;
  else throw new AppError('Unknown target object for migration', 400, 'INVALID_TARGET_OBJECT');

  const docs = await (Model as typeof User).find(query).select('custom_fields').lean();

  const errors: string[] = [];
  const updates: Array<{ filter: { _id: Types.ObjectId }; value: unknown }> = [];
  let valuesCoerced = 0;

  for (const doc of docs as Array<{ _id: Types.ObjectId; custom_fields: Record<string, unknown> }>) {
    const raw = doc.custom_fields?.[field.slug];
    const coerced = coerceFieldValue(raw, field.field_type, newType);

    if (!coerced.ok) {
      errors.push(`Record ${_truncateId(doc._id)}: ${coerced.error}`);
      continue;
    }

    // Validate the coerced value against the new field definition
    const newFieldDef = {
      ...field.toObject(),
      field_type: newType,
    } as unknown as Record<string, unknown>;
    const validationError = validateFieldValue(newFieldDef, coerced.value);
    if (validationError) {
      errors.push(`Record ${_truncateId(doc._id)}: ${validationError}`);
      continue;
    }

    if (coerced.value !== raw) {
      valuesCoerced++;
      updates.push({ filter: { _id: doc._id }, value: coerced.value });
    }
  }

  // If any value cannot be coerced, block the entire type change
  if (errors.length > 0) {
    const preview = errors.slice(0, 5).join('; ');
    const moreCount = errors.length - 5;
    throw new AppError(
      `Cannot change field type from "${field.field_type}" to "${newType}" — ${errors.length} record(s) have data that cannot be converted. First issues: ${preview}${moreCount > 0 ? `…and ${moreCount} more` : ''}.`,
      400,
      'FIELD_TYPE_CONVERSION_FAILED',
    );
  }

  // Apply coerced values via bulk write
  if (updates.length > 0) {
    const bulkOps = updates.map((u) => ({
      updateOne: {
        filter: u.filter,
        update: { $set: { [`custom_fields.${field.slug}`]: u.value } },
      },
    }));
    await (Model as typeof User).bulkWrite(bulkOps);
  }

  return {
    old_type: field.field_type,
    new_type: newType,
    values_coerced: valuesCoerced,
    records_migrated: docs.length,
  };
}

function _truncateId(id: Types.ObjectId | string): string {
  return id.toString().slice(0, 8);
}

interface SystemDefaultField {
  name: string;
  field_type: FieldType;
  label: string;
  description?: string;
  required?: boolean;
  is_system_field: boolean;
  select_options?: string[];
}

const SYSTEM_DEFAULT_FIELDS: SystemDefaultField[] = [
  { name: 'full_name', field_type: 'text', label: 'Full Name', description: 'Employee full legal name', required: true, is_system_field: true },
  { name: 'email', field_type: 'email', label: 'Email Address', description: 'Corporate email address', required: true, is_system_field: true },
  { name: 'phone', field_type: 'phone', label: 'Phone Number', description: 'Contact phone number', is_system_field: true },
  { name: 'department', field_type: 'text', label: 'Department', description: 'Primary department assignment', is_system_field: true },
  { name: 'location', field_type: 'text', label: 'Location', description: 'Office or work location', is_system_field: true },
  { name: 'job_title', field_type: 'text', label: 'Job Title', description: 'Employee job title', is_system_field: true },
  { name: 'employee_id', field_type: 'text', label: 'Employee ID', description: 'Unique employee identifier', is_system_field: true },
  { name: 'hire_date', field_type: 'date', label: 'Hire Date', description: 'Date of employment start', is_system_field: true },
  { name: 'employment_type', field_type: 'select', label: 'Employment Type', description: 'Full-time, part-time, contractor, etc.', select_options: ['Full-time', 'Part-time', 'Contractor', 'Intern'], is_system_field: true },
];

// ── Field CRUD ───────────────────────────────────────────────────────────────

/**
 * GET /data-fields
 * Returns all custom fields for the requesting company, optionally filtered by target_object.
 * Query params: target_object, include_inactive
 */
export const getCustomFields = asyncHandler(async (req: Request, res: Response) => {
  const { target_object, include_inactive } = req.query;

  const query: Record<string, unknown> = {
    company_id: req.user.company_id,
  };

  if (include_inactive !== 'true') {
    query.is_active = true;
  }

  if (target_object && TARGET_OBJECTS.includes(target_object as (typeof TARGET_OBJECTS)[number])) {
    query.target_object = target_object;
  }

  const fields = await CustomField.find(query)
    .sort({ is_system_field: -1, display_order: 1, created_at: 1 })
    .populate('visible_roles', 'name')
    .populate('edit_visible_roles', 'name')
    .populate('field_dependencies', 'label')
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
  })
    .populate('visible_roles', 'name')
    .populate('edit_visible_roles', 'name')
    .populate('field_dependencies', 'label');

  if (!field) {
    throw new AppError('Custom field not found', 404, 'NOT_FOUND');
  }

  res.status(200).json({ success: true, data: field });
});

/**
 * POST /data-fields
 * Creates a new custom field scoped to the requesting company's tenant.
 * Automatically saves the first version snapshot.
 */
export const createCustomField = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateCustomFieldSchema.parse(req.body);

  const slug = generateSlug(input.name);
  await assertUniqueSlug(req.user.company_id, input.target_object, slug);

  // Validate conditional logic references before persisting
  if (input.conditional_logic) {
    await validateConditionalLogic(req.user.company_id, input.target_object, input.conditional_logic, slug);
  }

  // Auto-assign display_order
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
    slug,
    placeholder: input.placeholder || undefined,
    description: input.description || undefined,
    default_value: input.default_value || undefined,
    select_options: input.select_options || undefined,
    visible_roles: input.visible_roles || undefined,
    edit_visible_roles: input.edit_visible_roles || undefined,
    conditional_logic: input.conditional_logic || undefined,
    field_dependencies: input.field_dependencies?.map((id: string) => new Types.ObjectId(id)) || undefined,
    validation_rules: input.validation_rules || undefined,
    company_id: req.user.company_id,
    display_order: displayOrder,
    version: 1,
  });

  await saveVersionSnapshot(
    field._id.toString(),
    req.user.company_id,
    'created',
    field.toObject() as unknown as Record<string, unknown>,
    req.user.userId,
    `Created field "${field.label}"`,
  );

  await auditLogger.log({
    req,
    action: 'custom_field.created',
    module: 'data_fields',
    object_type: 'CustomField',
    object_id: field._id.toString(),
    object_label: field.label,
    before_state: null,
    after_state: field.toObject() as unknown as Record<string, unknown>,
  });

  res.status(201).json({ success: true, data: field });
});

/**
 * PUT /data-fields/:id
 * Updates an existing custom field. field_type cannot be changed.
 * Saves version snapshot before update. Prevents certain changes if data exists.
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

  // Block renaming a system field — only applies if the name is actually changing
  if (field.is_system_field && input.name && input.name !== field.name) {
    throw new AppError('System fields cannot be renamed', 400, 'CANNOT_MODIFY_SYSTEM_FIELD');
  }

  const beforeState = field.toObject();

  // Track whether a migration happened so we can include it in the response
  let renameMigration: MigrationResult | null = null;
  let typeChangeResult: TypeChangeResult | null = null;

  // ── Field rename: migrate existing data via $rename, update conditional references ──
  if (input.name && input.name !== field.name) {
    if (field.is_system_field) {
      throw new AppError('System fields cannot be renamed', 400, 'CANNOT_MODIFY_SYSTEM_FIELD');
    }
    const oldSlug = field.slug;
    const newSlug = generateSlug(input.name);
    await assertUniqueSlug(req.user.company_id, field.target_object, newSlug, field._id.toString());

    // If there is existing data, migrate it rather than blocking the rename
    const { hasData } = await checkFieldExistsWithData(field._id.toString(), req.user.company_id, field.target_object);
    if (hasData) {
      renameMigration = await migrateFieldRename(req.user.company_id, field.target_object, oldSlug, newSlug);

      // Update conditional_logic references that point to the old slug across other fields
      await updateConditionalLogicReferences(req.user.company_id, field.target_object, oldSlug, newSlug);
    }

    field.slug = newSlug;
  }

  // ── Field type change: validate and coerce existing data ──
  if (input.field_type && input.field_type !== field.field_type) {
    if (field.is_system_field) {
      throw new AppError('System fields cannot change type', 400, 'CANNOT_MODIFY_SYSTEM_FIELD');
    }

    // Check if any existing data would be incompatible with the new type
    const { hasData } = await checkFieldExistsWithData(field._id.toString(), req.user.company_id, field.target_object);
    if (hasData) {
      // This validates + coerces existing values. Throws if any cannot be converted.
      typeChangeResult = await migrateFieldTypeChange(req.user.company_id, field.target_object, field, input.field_type);
    }

    field.field_type = input.field_type;
  }

  // Validate conditional logic references before persisting
  if (input.conditional_logic !== undefined) {
    await validateConditionalLogic(req.user.company_id, field.target_object, input.conditional_logic, field.slug);
  }

  // Validate required change: cannot make a field required if existing records have null values
  if (input.required === true && field.required === false) {
    let nullCount = 0;
    switch (field.target_object) {
      case 'user':
        nullCount = await User.countDocuments({
          company_id: req.user.company_id,
           [`custom_fields.${field.slug}`]: { $exists: false } },
        );
        break;
      case 'department':
        nullCount = await Department.countDocuments({
          company_id: req.user.company_id,
           [`custom_fields.${field.slug}`]: { $exists: false } },
        );
        break;
      case 'policy':
        nullCount = await PolicyVersion.countDocuments({
          company_id: req.user.company_id,
           [`custom_fields.${field.slug}`]: { $exists: false } },
        );
        break;
      case 'team':
        nullCount = await Team.countDocuments({
          company_id: req.user.company_id,
           [`custom_fields.${field.slug}`]: { $exists: false } },
        );
        break;
      case 'location':
        nullCount = await Location.countDocuments({
          company_id: req.user.company_id,
           [`custom_fields.${field.slug}`]: { $exists: false } },
        );
        break;
      case 'holiday':
        nullCount = await Holiday.countDocuments({
           [`custom_fields.${field.slug}`]: { $exists: false } },
        );
        break;
      case 'holiday_calendar':
        nullCount = await HolidayCalendar.countDocuments({
          company_id: req.user.company_id,
           [`custom_fields.${field.slug}`]: { $exists: false } },
        );
        break;
      case 'work_schedule':
        nullCount = await WorkSchedule.countDocuments({
          company_id: req.user.company_id,
           [`custom_fields.${field.slug}`]: { $exists: false } },
        );
        break;
    }
    if (nullCount > 0) {
      throw new AppError(
        `Cannot make "${field.label}" required because ${nullCount} record${nullCount !== 1 ? 's' : ''} have no value for this field. Clear or populate the data first, or keep the field optional.`,
        400,
        'REQUIRED_CHANGE_WOULD_BREAK_RECORDS',
      );
    }
  }
  const updates: Record<string, unknown> = { ...input };
  if (updates.placeholder === '') updates.placeholder = null;
  if (updates.description === '') updates.description = null;
  if (updates.default_value === '') updates.default_value = null;

  // Handle field_dependencies conversion
  if (updates.field_dependencies) {
    updates.field_dependencies = (updates.field_dependencies as string[]).map((id: string) => new Types.ObjectId(id));
  }

  Object.assign(field, updates);
  field.version = (field.version || 0) + 1;
  await field.save();

  const afterState = field.toObject();

  await saveVersionSnapshot(
    field._id.toString(),
    req.user.company_id,
    'updated',
    afterState as unknown as Record<string, unknown>,
    req.user.userId,
    `Updated field "${field.label}"`,
  );

  await auditLogger.log({
    req,
    action: 'custom_field.updated',
    module: 'data_fields',
    object_type: 'CustomField',
    object_id: field._id.toString(),
    object_label: field.label,
    before_state: beforeState,
    after_state: afterState,
  });

   res.status(200).json({
     success: true,
     data: field,
     ...(renameMigration ? { rename_migration: renameMigration } : {}),
     ...(typeChangeResult ? { type_change: typeChangeResult } : {}),
   });
});

/**
 * DELETE /data-fields/:id
 * Soft-deletes (deactivates) a custom field.
 * Blocks deletion if field has dependent fields, conditional dependents, or existing data.
 * When data exists, returns usage info so the client can offer a "clear data first" flow.
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

  // System fields cannot be deleted — they back core profile data. This mirrors the
  // rename and rollback guards above so all mutating operations treat system fields alike.
  if (field.is_system_field) {
    throw new AppError('System fields cannot be deleted', 400, 'CANNOT_MODIFY_SYSTEM_FIELD');
  }

  // Check for dependent fields
  const fieldDeps = await checkFieldDependencies(field._id.toString(), req.user.company_id);
  if (fieldDeps.hasDependents) {
    throw new AppError(
      `Cannot delete "${field.label}" because it is a dependency of: ${fieldDeps.dependentFields.map((d) => d.label).join(', ')}. Remove these dependencies first.`,
      400,
      'HAS_DEPENDENT_FIELDS',
    );
  }

  // Check for conditional dependents
  const conditionalDeps = await checkConditionalDependencies(field._id.toString(), req.user.company_id);
  if (conditionalDeps.hasDependents) {
    throw new AppError(
      `Cannot delete "${field.label}" because it is used in conditional rules by: ${conditionalDeps.dependentFields.map((d) => d.label).join(', ')}. Remove these conditions first.`,
      400,
      'HAS_CONDITIONAL_DEPENDENTS',
    );
  }

  // Check for workflow dependencies — workflows may reference this field in conditions or action config
  const workflowDeps = await checkWorkflowDependencies(field.slug, req.user.company_id);
  if (workflowDeps.hasDependents) {
    const workflowNames = workflowDeps.dependentWorkflows
      .map((w) => `"${w.name}" (step: "${w.stepName}")`)
      .join(', ');
    throw new AppError(
      `Cannot delete "${field.label}" because it is referenced by workflows: ${workflowNames}. Remove or update these workflow references before deleting.`,
      400,
      'HAS_WORKFLOW_DEPENDENTS',
    );
  }

  // Check for existing data — block deletion and return usage info so the client
  // can offer a "clear data first" flow instead of silently losing data.
  const dataUsage = await checkFieldExistsWithData(field._id.toString(), req.user.company_id, field.target_object);
  if (dataUsage.hasData) {
    throw new AppError(
      `Cannot delete "${field.label}" because it has data in ${dataUsage.recordCount} record${dataUsage.recordCount !== 1 ? 's' : ''}. Clear the data first before deleting this field.`,
      400,
      'FIELD_HAS_DATA',
    );
  }

  const beforeState = field.toObject();

  field.is_active = false;
  await field.save();

  await saveVersionSnapshot(
    field._id.toString(),
    req.user.company_id,
    'deleted',
    beforeState as unknown as Record<string, unknown>,
    req.user.userId,
    `Deleted field "${field.label}"`,
  );

  await auditLogger.log({
    req,
    action: 'custom_field.deleted',
    module: 'data_fields',
    object_type: 'CustomField',
    object_id: field._id.toString(),
    object_label: field.label,
    before_state: beforeState,
    after_state: null,
  });

  res.status(200).json({ success: true, data: { _id: field._id } });
});

/**
 * POST /data-fields/:id/clear-data
 * Removes the custom field's values from all records of the target object type.
 * This is a destructive but non-blocking operation: it unsets the field's slug
 * from the custom_fields map on every matching document.
 * Used before deletion when a field has existing data.
 */
export const clearFieldData = asyncHandler(async (req: Request, res: Response) => {
  const field = await CustomField.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  });

  if (!field) {
    throw new AppError('Custom field not found', 404, 'NOT_FOUND');
  }

  if (field.is_system_field) {
    throw new AppError('System fields cannot have their data cleared', 400, 'CANNOT_MODIFY_SYSTEM_FIELD');
  }

  const beforeState = field.toObject();
  let clearedCount = 0;

  switch (field.target_object) {
    case 'user': {
      const result = await User.updateMany(
        { company_id: req.user.company_id, [`custom_fields.${field.slug}`]: { $exists: true } },
        { $unset: { [`custom_fields.${field.slug}`]: '' } },
      );
      clearedCount = result.modifiedCount;
      break;
    }
    case 'department': {
      const result = await Department.updateMany(
        { company_id: req.user.company_id, [`custom_fields.${field.slug}`]: { $exists: true } },
        { $unset: { [`custom_fields.${field.slug}`]: '' } },
      );
      clearedCount = result.modifiedCount;
      break;
    }
    case 'policy': {
      const result = await PolicyVersion.updateMany(
        { company_id: req.user.company_id, [`custom_fields.${field.slug}`]: { $exists: true } },
        { $unset: { [`custom_fields.${field.slug}`]: '' } },
      );
      clearedCount = result.modifiedCount;
      break;
    }
    case 'team': {
      const result = await Team.updateMany(
        { company_id: req.user.company_id, [`custom_fields.${field.slug}`]: { $exists: true } },
        { $unset: { [`custom_fields.${field.slug}`]: '' } },
      );
      clearedCount = result.modifiedCount;
      break;
    }
    case 'location': {
      const result = await Location.updateMany(
        { company_id: req.user.company_id, [`custom_fields.${field.slug}`]: { $exists: true } },
        { $unset: { [`custom_fields.${field.slug}`]: '' } },
      );
      clearedCount = result.modifiedCount;
      break;
    }
    case 'holiday': {
      const result = await Holiday.updateMany(
        { [`custom_fields.${field.slug}`]: { $exists: true } },
        { $unset: { [`custom_fields.${field.slug}`]: '' } },
      );
      clearedCount = result.modifiedCount;
      break;
    }
    case 'holiday_calendar': {
      const result = await HolidayCalendar.updateMany(
        { company_id: req.user.company_id, [`custom_fields.${field.slug}`]: { $exists: true } },
        { $unset: { [`custom_fields.${field.slug}`]: '' } },
      );
      clearedCount = result.modifiedCount;
      break;
    }
    case 'work_schedule': {
      const result = await WorkSchedule.updateMany(
        { company_id: req.user.company_id, [`custom_fields.${field.slug}`]: { $exists: true } },
        { $unset: { [`custom_fields.${field.slug}`]: '' } },
      );
      clearedCount = result.modifiedCount;
      break;
    }
  }

  await auditLogger.log({
    req,
    action: 'custom_field.data_cleared',
    module: 'data_fields',
    object_type: 'CustomField',
    object_id: field._id.toString(),
    object_label: field.label,
    before_state: beforeState,
    after_state: { ...beforeState, cleared_records: clearedCount } as unknown as Record<string, unknown>,
  });

  res.status(200).json({
    success: true,
    data: { cleared_count: clearedCount },
  });
});

/**
 * PUT /data-fields/reorder
 * Updates display_order for multiple fields in one request.
 */
export const reorderCustomFields = asyncHandler(async (req: Request, res: Response) => {
  const { field_ids } = ReorderFieldsSchema.parse(req.body);

  if (field_ids.length === 0) {
    throw new AppError('field_ids array cannot be empty', 400, 'INVALID_INPUT');
  }

  const fields = await CustomField.find({
    _id: { $in: field_ids },
    company_id: req.user.company_id,
  });

  if (fields.length !== field_ids.length) {
    throw new AppError('One or more fields not found or not accessible', 404, 'NOT_FOUND');
  }

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

// ── Field Usage & Dependency ─────────────────────────────────────────────────

/**
 * GET /data-fields/dependency-map
 * Returns dependency counts for all fields of a given target_object.
 * Used by the table view to show at-a-glance dependency info.
 *
 * Response shape:
 * {
 *   fieldId: string,
 *   outgoingDeps: number,   // fields this field depends on (field_dependencies.length)
 *   incomingDeps: number,   // other fields that list this field in their field_dependencies
 *   conditionalDeps: number,// other fields with conditional_logic.field_slug referencing this field's slug
 *   workflowDeps: number,   // workflow steps referencing this field's slug
 * }[]
 */
export const getDependencyMap = asyncHandler(async (req: Request, res: Response) => {
  const { target_object } = req.query;

  if (!target_object || !TARGET_OBJECTS.includes(target_object as (typeof TARGET_OBJECTS)[number])) {
    throw new AppError('target_object is required (user, department, policy, team, location, holiday, holiday_calendar, or work_schedule)', 400, 'INVALID_INPUT');
  }

  const companyId = req.user.company_id;
  const targetObj = target_object as (typeof TARGET_OBJECTS)[number];

  const fields = await CustomField.find({
    company_id: companyId,
    target_object: targetObj,
    is_active: true,
  })
    .select('_id slug field_dependencies')
    .lean();

  // Build a slug→id map for conditional dependency lookups
  const slugToId = new Map<string, string>();
  for (const f of fields) {
    slugToId.set(f.slug, f._id.toString());
  }

  // ── Incoming field dependencies (reverse lookup) ──
  // Count how many times each field ID appears in other fields' field_dependencies arrays
  const incomingDepsResult = await CustomField.aggregate([
    { $match: { company_id: new Types.ObjectId(companyId), target_object: targetObj, is_active: true } },
    { $unwind: '$field_dependencies' },
    { $group: { _id: '$field_dependencies', count: { $sum: 1 } } },
  ]);

  const incomingDepsMap = new Map<string, number>();
  for (const row of incomingDepsResult) {
    incomingDepsMap.set(row._id.toString(), row.count);
  }

  // ── Conditional dependencies (reverse lookup) ──
  // Count how many other fields have conditional_logic referencing each field's slug
  const allActiveFields = await CustomField.find({
    company_id: companyId,
    target_object: targetObj,
    is_active: true,
  })
    .select('_id slug conditional_logic')
    .lean();

  const conditionalDepsMap = new Map<string, number>();
  for (const f of allActiveFields) {
    if (!f.conditional_logic || f.conditional_logic.length === 0) continue;
    for (const rule of f.conditional_logic) {
      const referencedSlug = (rule as { field_slug?: string }).field_slug;
      if (!referencedSlug) continue;
      const referencedId = slugToId.get(referencedSlug);
      if (referencedId && referencedId !== f._id.toString()) {
        conditionalDepsMap.set(referencedId, (conditionalDepsMap.get(referencedId) || 0) + 1);
      }
    }
  }

  // ── Workflow dependencies ──
  const workflowSteps = await WorkflowStep.find({
    company_id: companyId,
    is_active: true,
  })
    .select('conditions.field action_config.field_slug action_config.custom_field action_config.field')
    .lean();

  const workflowDepsMap = new Map<string, number>();
  for (const step of workflowSteps) {
    const refs = new Set<string>();
    const conds = (step as { conditions?: Array<{ field?: string }> }).conditions || [];
    for (const c of conds) {
      if (c.field) refs.add(c.field);
    }
    const ac = (step as { action_config?: Record<string, string> }).action_config || {};
    if (ac.field_slug) refs.add(ac.field_slug);
    if (ac.custom_field) refs.add(ac.custom_field);
    if (ac.field) refs.add(ac.field);

    for (const ref of refs) {
      const fieldId = slugToId.get(ref);
      if (fieldId) {
        workflowDepsMap.set(fieldId, (workflowDepsMap.get(fieldId) || 0) + 1);
      }
    }
  }

  // ── Assemble response ──
  const dependencyMap = fields.map((f) => ({
    fieldId: f._id.toString(),
    outgoingDeps: f.field_dependencies?.length || 0,
    incomingDeps: incomingDepsMap.get(f._id.toString()) || 0,
    conditionalDeps: conditionalDepsMap.get(f._id.toString()) || 0,
    workflowDeps: workflowDepsMap.get(f._id.toString()) || 0,
  }));

  res.status(200).json({ success: true, data: dependencyMap });
});

/**
 * GET /data-fields/:id/usage
 * Checks if a custom field has data stored in existing records.
 */
export const getFieldUsage = asyncHandler(async (req: Request, res: Response) => {
  const field = await CustomField.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!field) {
    throw new AppError('Custom field not found', 404, 'NOT_FOUND');
  }

  const usage = await checkFieldExistsWithData(field._id.toString(), req.user.company_id, field.target_object);
  const dependencies = await checkFieldDependencies(field._id.toString(), req.user.company_id);
  const conditionalDeps = await checkConditionalDependencies(field._id.toString(), req.user.company_id);
  const workflowDeps = await checkWorkflowDependencies(field.slug, req.user.company_id);

  res.status(200).json({
    success: true,
    data: {
      hasData: usage.hasData,
      recordCount: usage.recordCount,
      fieldDependencies: dependencies,
      conditionalDependents: conditionalDeps,
      workflowDependencies: workflowDeps,
    },
  });
});

/**
 * GET /data-fields/:id/dependencies
 * Returns all fields that depend on the given field (reverse dependency lookup).
 */
export const getFieldDependents = asyncHandler(async (req: Request, res: Response) => {
  const field = await CustomField.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!field) {
    throw new AppError('Custom field not found', 404, 'NOT_FOUND');
  }

  const dependencyCheck = await checkFieldDependencies(field._id.toString(), req.user.company_id);
  const conditionalCheck = await checkConditionalDependencies(field._id.toString(), req.user.company_id);
  const workflowCheck = await checkWorkflowDependencies(field.slug, req.user.company_id);

  res.status(200).json({
    success: true,
    data: {
      fieldDependents: dependencyCheck.dependentFields,
      conditionalDependents: conditionalCheck.dependentFields,
      workflowDependencies: workflowCheck,
    },
  });
});

// ── Schema Versioning ────────────────────────────────────────────────────────

/**
 * GET /data-fields/:id/versions
 * Returns the version history for a custom field.
 */
export const getFieldVersions = asyncHandler(async (req: Request, res: Response) => {
  const field = await CustomField.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!field) {
    throw new AppError('Custom field not found', 404, 'NOT_FOUND');
  }

  const versions = await CustomFieldVersion.find({
    field_id: req.params.id,
    company_id: req.user.company_id,
  })
    .sort({ version_number: -1 })
    .populate('changed_by', 'full_name email')
    .lean();

  res.status(200).json({ success: true, data: versions });
});

/**
 * POST /data-fields/:id/rollback
 * Rolls back a custom field to a previous version.
 */
export const rollbackFieldVersion = asyncHandler(async (req: Request, res: Response) => {
  const { version_number } = z.object({
    version_number: z.number().int().min(1),
  }).parse(req.body);

  const field = await CustomField.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!field) {
    throw new AppError('Custom field not found', 404, 'NOT_FOUND');
  }

  if (field.is_system_field) {
    throw new AppError('System fields cannot be rolled back', 400, 'CANNOT_ROLLBACK_SYSTEM_FIELD');
  }

  const targetVersion = await CustomFieldVersion.findOne({
    field_id: req.params.id,
    company_id: req.user.company_id,
    version_number,
  });

  if (!targetVersion) {
    throw new AppError('Version not found', 404, 'VERSION_NOT_FOUND');
  }

  const beforeState = field.toObject();
  const snapshot = targetVersion.snapshot as Record<string, unknown>;

  // Restore all editable fields from the snapshot (excluding immutable fields)
  const restoreFields = [
    'label', 'placeholder', 'description', 'required', 'default_value',
    'select_options', 'validation_rules', 'visibility', 'visible_roles',
    'edit_visibility', 'edit_visible_roles', 'conditional_logic',
    'field_dependencies', 'display_order',
  ];

  for (const key of restoreFields) {
    if (snapshot[key] !== undefined) {
      (field as unknown as ICustomField & Record<string, unknown>)[key] = snapshot[key];
    }
  }

  field.version = (field.version || 0) + 1;
  await field.save();

  await saveVersionSnapshot(
    field._id.toString(),
    req.user.company_id,
    'restored',
    field.toObject() as unknown as Record<string, unknown>,
    req.user.userId,
    `Rolled back field "${field.label}" to version ${version_number}`,
  );

  await auditLogger.log({
    req,
    action: 'custom_field.rolled_back',
    module: 'data_fields',
    object_type: 'CustomField',
    object_id: field._id.toString(),
    object_label: field.label,
    before_state: beforeState,
    after_state: field.toObject(),
  });

  res.status(200).json({ success: true, data: field });
});

// ── System Default Fields ────────────────────────────────────────────────────

/**
 * POST /data-fields/seed-defaults
 * Seeds system default fields for the company if they don't exist.
 */
export const seedDefaultFields = asyncHandler(async (req: Request, res: Response) => {
  const { target_object } = z.object({
    target_object: z.enum(TARGET_OBJECTS).optional().default('user'),
  }).parse(req.body);

  const created: Array<Record<string, unknown>> = [];
  const skipped: string[] = [];

  for (const defaultField of SYSTEM_DEFAULT_FIELDS) {
    const slug = generateSlug(defaultField.name);

    const existing = await CustomField.findOne({
      company_id: req.user.company_id,
      target_object,
      slug,
    });

    if (existing) {
      skipped.push(defaultField.label);
      continue;
    }

    const maxOrderField = await CustomField.findOne({
      company_id: req.user.company_id,
      target_object,
    })
      .sort({ display_order: -1 })
      .select('display_order')
      .lean();

    const displayOrder = maxOrderField ? maxOrderField.display_order + 1 : 0;

    const field = await CustomField.create({
      company_id: req.user.company_id,
      target_object,
      name: defaultField.name,
      slug,
      field_type: defaultField.field_type,
      label: defaultField.label,
      description: defaultField.description,
      required: defaultField.required || false,
      select_options: defaultField.select_options || undefined,
      is_system_field: true,
      display_order: displayOrder,
      visibility: 'all',
      edit_visibility: 'all',
      version: 1,
    });

    created.push(field.toObject() as unknown as Record<string, unknown>);
  }

  await auditLogger.log({
    req,
    action: 'custom_field.defaults_seeded',
    module: 'data_fields',
    object_type: 'CustomField',
    object_id: target_object,
    object_label: `Default fields seeded for ${target_object}`,
    before_state: null,
    after_state: { created: created.length, skipped: skipped.length },
  });

  res.status(201).json({
    success: true,
    data: {
      created,
      skipped,
      created_count: created.length,
      skipped_count: skipped.length,
    },
  });
});

/**
 * POST /data-fields/validate
 * Validates custom field values against their defined rules without saving.
 * Body: { target_object, object_id?, values: Record<string, unknown> }
 */
export const validateFieldValues = asyncHandler(async (req: Request, res: Response) => {
  const validateSchema = z.object({
    target_object: z.enum(TARGET_OBJECTS),
    values: z.record(z.string(), z.unknown()),
  });

  const { target_object, values } = validateSchema.parse(req.body);

  const fields = await CustomField.find({
    company_id: req.user.company_id,
    target_object,
    is_active: true,
  }).lean();

  const errors: Array<{ field: string; message: string }> = [];

  for (const field of fields) {
    const value = values[field.slug];
    const error = validateFieldValue(field as unknown as Record<string, unknown>, value);
    if (error) {
      errors.push({ field: field.slug, message: error });
    }
  }

  res.status(200).json({
    success: true,
    data: {
      valid: errors.length === 0,
      errors,
    },
  });
});

/**
 * GET /data-fields/effective
 * Returns the custom fields the requesting user is allowed to view/edit for a target object,
 * applying field-level visibility (story 108) and the applicable profile layout (story 111).
 * Query params: target_object (required), role_ids (record owner's roles, comma-separated, optional).
 */
export const getEffectiveCustomFields = asyncHandler(async (req: Request, res: Response) => {
  const { target_object, role_ids } = req.query;

  if (!target_object || !TARGET_OBJECTS.includes(target_object as (typeof TARGET_OBJECTS)[number])) {
    throw new AppError('target_object is required (user, department, policy, team, location, holiday, holiday_calendar, or work_schedule)', 400, 'INVALID_INPUT');
  }

  const recordRoleIds = typeof role_ids === 'string' && role_ids.length > 0
    ? role_ids.split(',').filter(Boolean)
    : [];

  const [result, standardFields] = await Promise.all([
    resolveEffectiveCustomFields(
      req.user.company_id,
      target_object as (typeof TARGET_OBJECTS)[number],
      req.user.userId,
      recordRoleIds,
    ),
    resolveStandardFieldPermissions(
      req.user.company_id,
      target_object as 'user' | 'department' | 'policy' | 'team' | 'location' | 'holiday' | 'holiday_calendar' | 'work_schedule',
      req.user.userId,
    ),
  ]);

  res.status(200).json({
    success: true,
    data: {
      ...result,
      standard_field_permissions: standardFields,
    },
  });
});

// ── Profile Layouts ──────────────────────────────────────────────────────────

/**
 * GET /data-fields/layouts
 * Returns all profile layouts for the company, optionally filtered by target_object.
 * Query params: target_object, role_id
 */
export const getProfileLayouts = asyncHandler(async (req: Request, res: Response) => {
  const { target_object, role_id } = req.query;

  const query: Record<string, unknown> = {
    company_id: req.user.company_id,
    is_active: true,
  };

  if (target_object && TARGET_OBJECTS.includes(target_object as (typeof TARGET_OBJECTS)[number])) {
    query.target_object = target_object;
  }
  if (role_id) {
    query.role_id = role_id;
  }

  const layouts = await ProfileLayout.find(query)
    .populate('fields.field_id', 'label slug field_type')
    .sort({ is_default: -1, created_at: 1 })
    .lean();

  res.status(200).json({ success: true, data: layouts });
});

/**
 * GET /data-fields/layouts/:id
 * Returns a single profile layout.
 */
export const getProfileLayoutById = asyncHandler(async (req: Request, res: Response) => {
  const layout = await ProfileLayout.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  })
    .populate('fields.field_id', 'label slug field_type')
    .populate('role_id', 'name');

  if (!layout) {
    throw new AppError('Profile layout not found', 404, 'NOT_FOUND');
  }

  res.status(200).json({ success: true, data: layout });
});

/**
 * POST /data-fields/layouts
 * Creates a new profile layout for role-based field visibility.
 */
export const createProfileLayout = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateProfileLayoutSchema.parse(req.body);

  // If this is set as default, unset any existing default for the same target_object
  if (input.is_default) {
    await ProfileLayout.updateMany(
      {
        company_id: req.user.company_id,
        target_object: input.target_object,
        is_default: true,
      },
      { is_default: false },
    );
  }

  const layout = await ProfileLayout.create({
    ...input,
    role_id: input.role_id || undefined,
    company_id: req.user.company_id,
  });

  await auditLogger.log({
    req,
    action: 'profile_layout.created',
    module: 'data_fields',
    object_type: 'ProfileLayout',
    object_id: layout._id.toString(),
    object_label: layout.name,
    before_state: null,
    after_state: layout.toObject(),
  });

  res.status(201).json({ success: true, data: layout });
});

/**
 * PUT /data-fields/layouts/:id
 * Updates a profile layout.
 */
export const updateProfileLayout = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateProfileLayoutSchema.parse(req.body);

  const layout = await ProfileLayout.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!layout) {
    throw new AppError('Profile layout not found', 404, 'NOT_FOUND');
  }

  if (input.is_default) {
    await ProfileLayout.updateMany(
      {
        company_id: req.user.company_id,
        target_object: layout.target_object,
        _id: { $ne: layout._id },
        is_default: true,
      },
      { is_default: false },
    );
  }

  const beforeState = layout.toObject();
  Object.assign(layout, input);
  await layout.save();

  await auditLogger.log({
    req,
    action: 'profile_layout.updated',
    module: 'data_fields',
    object_type: 'ProfileLayout',
    object_id: layout._id.toString(),
    object_label: layout.name,
    before_state: beforeState,
    after_state: layout.toObject(),
  });

  res.status(200).json({ success: true, data: layout });
});

/**
 * DELETE /data-fields/layouts/:id
 * Deletes a profile layout.
 */
export const deleteProfileLayout = asyncHandler(async (req: Request, res: Response) => {
  const layout = await ProfileLayout.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  });

  if (!layout) {
    throw new AppError('Profile layout not found', 404, 'NOT_FOUND');
  }

  const beforeState = layout.toObject();

  layout.is_active = false;
  await layout.save();

  await auditLogger.log({
    req,
    action: 'profile_layout.deleted',
    module: 'data_fields',
    object_type: 'ProfileLayout',
    object_id: layout._id.toString(),
    object_label: layout.name,
    before_state: beforeState,
    after_state: null,
  });

  res.status(200).json({ success: true, data: { _id: layout._id } });
});
