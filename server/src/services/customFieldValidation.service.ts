// server/src/services/customFieldValidation.service.ts
import { CustomField, FieldType } from '../models/CustomField.model';
import { CustomFieldVersion } from '../models/CustomFieldVersion.model';
import { ProfileLayout } from '../models/ProfileLayout.model';
import { FieldPermission, STANDARD_FIELDS, FieldVisibility } from '../models/FieldPermission.model';
import { UserRole } from '../models/UserRole.model';
import { AppError } from '../utils/AppError';
import { Types } from 'mongoose';
import { ROLES } from '../constants/roles';

export type TargetObject = 'user' | 'department' | 'policy';

const ADMIN_ROLE_NAMES = new Set<string>([ROLES.SUPER_ADMIN, ROLES.OPS_ADMIN, ROLES.ADMIN, ROLES.HR_ADMIN, ROLES.IT_ADMIN]);

export function isAdminRole(roleName: string | undefined): boolean {
  return !!roleName && ADMIN_ROLE_NAMES.has(roleName);
}

export async function getActiveCustomFields(companyId: string | Types.ObjectId, targetObject: string) {
  return CustomField.find({
    company_id: companyId,
    target_object: targetObject,
    is_active: true,
  })
    .sort({ is_system_field: -1, display_order: 1, created_at: 1 })
    .lean();
}

export interface CustomFieldValidationOptions {
  enforceRequired?: boolean;
}

export interface FieldValidationError {
  field: string;
  message: string;
}

export function evaluateCondition(fieldValue: unknown, operator: string, ruleValue: unknown): boolean {
  switch (operator) {
    case 'equals':
      return String(fieldValue) === String(ruleValue);
    case 'not_equals':
      return String(fieldValue) !== String(ruleValue);
    case 'contains':
      return String(fieldValue).includes(String(ruleValue));
    case 'greater_than':
      return Number(fieldValue) > Number(ruleValue);
    case 'less_than':
      return Number(fieldValue) < Number(ruleValue);
    case 'is_empty':
      return fieldValue === null || fieldValue === undefined || fieldValue === '';
    case 'is_not_empty':
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
    default:
      return false;
  }
}

/**
 * Coerces a single field value from one type to another.
 * Returns { ok: true, value } when the value can be safely converted,
 * or { ok: false, error } when the transformation is not possible.
 *
 * Used during schema updates: when a field's type changes, existing data
 * must be validated and migrated (or the change blocked) so no data is lost.
 */
export function coerceFieldValue(
  value: unknown,
  fromType: FieldType,
  toType: FieldType,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (fromType === toType) {
    return { ok: true, value };
  }

  if (value === null || value === undefined || value === '') {
    return { ok: true, value: null };
  }

  const stringValue = String(value);

  // To text — everything can be safely stringified
  if (toType === 'text') {
    if (Array.isArray(value)) return { ok: true, value: JSON.stringify(value) };
    if (value instanceof Date) return { ok: true, value: value.toISOString().split('T')[0] };
    if (typeof value === 'boolean') return { ok: true, value: value ? 'true' : 'false' };
    if (typeof value === 'object' && value !== null) return { ok: true, value: stringValue };
    return { ok: true, value: stringValue };
  }

  // To number — accept text or number inputs
  if (toType === 'number') {
    if (fromType === 'text' || fromType === 'number' || fromType === 'select') {
      const num = Number(value);
      if (isNaN(num) || !isFinite(num)) {
        return { ok: false, error: `Cannot convert "${stringValue}" to a number` };
      }
      return { ok: true, value: num };
    }
    if (fromType === 'boolean') {
      if (value === true || value === 'true' || value === 1) return { ok: true, value: 1 };
      if (value === false || value === 'false' || value === 0) return { ok: true, value: 0 };
      return { ok: false, error: 'Cannot convert boolean value to a number' };
    }
    return { ok: false, error: `Cannot convert ${fromType} to number` };
  }

  // To date — accept text or date inputs
  if (toType === 'date') {
    if (fromType === 'text') {
      const date = new Date(stringValue);
      if (isNaN(date.getTime())) {
        return { ok: false, error: `Cannot convert "${stringValue}" to a valid date` };
      }
      return { ok: true, value: date.toISOString().split('T')[0] };
    }
    if (fromType === 'date') return { ok: true, value };
    return { ok: false, error: `Cannot convert ${fromType} to date` };
  }

  // To boolean — accept text, number, or boolean inputs
  if (toType === 'boolean') {
    if (fromType === 'text' || fromType === 'select') {
      const normalized = stringValue.toLowerCase().trim();
      if (['true', '1', 'yes'].includes(normalized)) return { ok: true, value: true };
      if (['false', '0', 'no'].includes(normalized)) return { ok: true, value: false };
      return { ok: false, error: `Cannot convert "${stringValue}" to a boolean` };
    }
    if (fromType === 'number') {
      if (value === 1) return { ok: true, value: true };
      if (value === 0) return { ok: true, value: false };
      return { ok: false, error: `Cannot convert number ${stringValue} to a boolean` };
    }
    if (fromType === 'boolean') return { ok: true, value };
    return { ok: false, error: `Cannot convert ${fromType} to boolean` };
  }

  // To select — accept text, number, boolean, or select (coerce to string)
  if (toType === 'select') {
    if (['text', 'number', 'boolean', 'select'].includes(fromType)) {
      return { ok: true, value: stringValue };
    }
    return { ok: false, error: `Cannot convert ${fromType} to select` };
  }

  // To multi_select — accept multi_select, text (JSON or single value), or select
  if (toType === 'multi_select') {
    if (fromType === 'multi_select') return { ok: true, value };
    if (fromType === 'text') {
      try {
        const parsed = JSON.parse(stringValue);
        if (Array.isArray(parsed)) return { ok: true, value: parsed };
      } catch {
        // fall through — treat as single value
      }
      return { ok: true, value: [stringValue] };
    }
    if (fromType === 'select') return { ok: true, value: [stringValue] };
    return { ok: false, error: `Cannot convert ${fromType} to multi-select` };
  }

  // To email / url / phone — accept text or same-type inputs (keep as string)
  if (toType === 'email' || toType === 'url' || toType === 'phone') {
    if (['text', 'email', 'url', 'phone', 'select', 'number', 'boolean'].includes(fromType)) {
      return { ok: true, value: stringValue };
    }
    return { ok: false, error: `Cannot convert ${fromType} to ${toType}` };
  }

  return { ok: false, error: `Cannot convert from ${fromType} to ${toType}` };
}

/**
 * Validates a single value against a custom field's type and validation rules.
 * Returns an error message, or null if the value is valid.
 */
export function validateFieldValue(field: Record<string, unknown>, value: unknown): string | null {
  const rules = field.validation_rules as Record<string, unknown> | undefined;

  if (value === null || value === undefined || value === '') {
    if (field.required || rules?.required === true) {
      return `${String(field.label)} is required`;
    }
    return null;
  }

  const fieldType = field.field_type as string;

  // Type-specific validation
  if (fieldType === 'number') {
    const numVal = Number(value);
    if (value === '' || isNaN(numVal) || !isFinite(numVal)) {
      return `${String(field.label)} must be a valid number`;
    }
    if (rules?.min !== undefined && numVal < (rules.min as number)) {
      return `${String(field.label)} must be at least ${rules.min}`;
    }
    if (rules?.max !== undefined && numVal > (rules.max as number)) {
      return `${String(field.label)} must be at most ${rules.max}`;
    }
  }

  if (fieldType === 'date') {
    const dateVal = new Date(String(value));
    if (isNaN(dateVal.getTime())) {
      return `${field.label} must be a valid date`;
    }
  }

  if (fieldType === 'boolean') {
    if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
      return `${field.label} must be true or false`;
    }
  }

  if (fieldType === 'select') {
    const options = (field.select_options as string[]) || [];
    if (!options.includes(String(value))) {
      return `${field.label} must be one of: ${options.join(', ')}`;
    }
  }

  if (fieldType === 'multi_select') {
    if (!Array.isArray(value)) {
      return `${field.label} must be an array of selected options`;
    }
    const options = (field.select_options as string[]) || [];
    for (const item of value) {
      if (!options.includes(String(item))) {
        return `${field.label} contains an invalid option: ${String(item)}`;
      }
    }
  }

  if (fieldType === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(value))) return `${field.label} must be a valid email address`;
  }

  if (fieldType === 'url') {
    try {
      new URL(String(value));
    } catch {
      return `${field.label} must be a valid URL`;
    }
  }

  if (fieldType === 'phone') {
    const phoneRegex = /^[+]?[\d\s\-().]{7,20}$/;
    if (!phoneRegex.test(String(value))) return `${field.label} must be a valid phone number`;
  }

  // Shared string-based rules
  if (fieldType === 'text' || fieldType === 'email' || fieldType === 'url' || fieldType === 'phone' || fieldType === 'select') {
    const strVal = String(value);
    if (rules?.min_length !== undefined && strVal.length < (rules.min_length as number)) {
      return `${field.label} must be at least ${rules.min_length} characters`;
    }
    if (rules?.max_length !== undefined && strVal.length > (rules.max_length as number)) {
      return `${field.label} must be at most ${rules.max_length} characters`;
    }
  }

  if (rules?.pattern) {
    try {
      const regex = new RegExp(rules.pattern as string);
      if (!regex.test(String(value))) {
        return (rules.pattern_message as string) || `${field.label} has an invalid format`;
      }
    } catch {
      return `${field.label} has an invalid validation pattern`;
    }
  }

  return null;
}

/**
 * Validates and sanitizes custom field values against the company's field schema.
 * - Drops values whose slug does not match an active field (prevents garbage data).
 * - Blocks values that violate field type, format, option, range, or pattern rules.
 * - Optionally enforces required fields (used on update and full create flows).
 * Throws AppError(400, 'CUSTOM_FIELD_VALIDATION') with a summary of all errors.
 */
export async function validateAndSanitizeCustomFields(
  companyId: string | Types.ObjectId,
  targetObject: string,
  values: Record<string, unknown> | undefined | null,
  options: CustomFieldValidationOptions = {},
): Promise<Record<string, unknown>> {
  const sanitized: Record<string, unknown> = {};
  if (!values || typeof values !== 'object') return sanitized;

  const fields = await getActiveCustomFields(companyId, targetObject);
  if (fields.length === 0) return sanitized;

  const bySlug = new Map<string, Record<string, unknown>>();
  for (const field of fields) {
    bySlug.set(field.slug, field as unknown as Record<string, unknown>);
  }

  const errors: FieldValidationError[] = [];

  for (const [slug, value] of Object.entries(values)) {
    const field = bySlug.get(slug);
    if (!field) {
      // Unknown slug — silently drop to avoid corrupting records
      continue;
    }
    const error = validateFieldValue(field, value);
    if (error) {
      errors.push({ field: slug, message: error });
      continue;
    }
    if (value !== null && value !== undefined && value !== '') {
      sanitized[slug] = value;
    }
  }

  if (options.enforceRequired) {
    const conditionallyRequired = new Set<string>();
    const conditionallyOptional = new Set<string>();
    for (const field of fields) {
      const logic = field.conditional_logic as Array<{
        field_slug: string; operator: string; value: unknown; action: string;
      }> | undefined;
      if (!logic || logic.length === 0) continue;
      for (const rule of logic) {
        const dependentValue = sanitized[rule.field_slug];
        if (!evaluateCondition(dependentValue, rule.operator, rule.value)) continue;
        if (rule.action === 'require') {
          conditionallyRequired.add(field.slug);
        }
        if (rule.action === 'optional') {
          conditionallyOptional.add(field.slug);
        }
      }
    }

    for (const field of fields) {
      if (conditionallyOptional.has(field.slug)) continue;
      const fieldRules = field.validation_rules as Record<string, unknown> | undefined;
      const isRequired = field.required === true || fieldRules?.required === true || conditionallyRequired.has(field.slug);
      if (!isRequired) continue;
      const hasValue = sanitized[field.slug] !== undefined && sanitized[field.slug] !== null && sanitized[field.slug] !== '';
      if (!hasValue) {
        errors.push({ field: field.slug, message: `${String(field.label)} is required` });
      }
    }
  }

  if (errors.length > 0) {
    const details = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    throw new AppError(`Custom field validation failed: ${details}`, 400, 'CUSTOM_FIELD_VALIDATION');
  }

  return sanitized;
}

/**
 * Resolves the custom fields the requesting user is allowed to view/edit for a target object,
 * applying field-level visibility (story 108) and profile layouts (story 111).
 * - Viewer access is based on the authenticated user's roles.
 * - Layout selection is based on the record owner's role IDs (passed via query param).
 * Returns fields annotated with can_view / can_edit plus the applied layout name.
 */
export async function resolveEffectiveCustomFields(
  companyId: string | Types.ObjectId,
  targetObject: string,
  viewerUserId: string,
  recordRoleIds: string[],
): Promise<{ fields: Array<Record<string, unknown> & { can_view: boolean; can_edit: boolean }>; layout_name: string | null; layout_id: string | null }> {
  const [fields, layouts] = await Promise.all([
    getActiveCustomFields(companyId, targetObject),
    ProfileLayout.find({ company_id: companyId, target_object: targetObject, is_active: true }).lean(),
  ]);

  const { viewerRoleIds, viewerHasAdminAccess } = await resolveViewerAccess(companyId, viewerUserId);

  // Select the applicable layout: role-specific first, then default.
  let layout: { _id: Types.ObjectId; name: string; fields: Array<{ field_id: Types.ObjectId; display_order: number; is_visible: boolean; is_editable: boolean }> } | null = null;
  if (layouts.length > 0) {
    const recordRoleSet = new Set(recordRoleIds.map((id) => id.toString()));
    const candidate = layouts.find((l) => l.role_id && recordRoleSet.has((l.role_id as Types.ObjectId).toString())) ||
      layouts.find((l) => !l.role_id && l.is_default) ||
      layouts.find((l) => !l.role_id) ||
      null;

    layout = candidate
      ? {
          _id: candidate._id,
          name: candidate.name,
          fields: candidate.fields,
        }
      : null;
  }

  const layoutVisibleFieldIds = layout
    ? new Set(
        layout.fields
          .filter((f) => f.is_visible)
          .map((f) => f.field_id.toString()),
      )
    : null;

  const fieldOrder = layout ? new Map<string, number>() : null;
  if (layout) {
    layout.fields.forEach((f, index) => fieldOrder!.set(f.field_id.toString(), index));
  }

  const result: Array<Record<string, unknown> & { can_view: boolean; can_edit: boolean }> = fields
    .map((field) => {
      const rawField = field as unknown as Record<string, unknown>;
      const visibility = field.visibility as FieldVisibility;
      const visibleRoles = (field.visible_roles || []).map((r) => r.toString());
      const editVisibility = field.edit_visibility as FieldVisibility;
      const editVisibleRoles = (field.edit_visible_roles || []).map((r) => r.toString());

      const { can_view, can_edit } = computeFieldAccess(
        visibility, visibleRoles, editVisibility, editVisibleRoles,
        viewerRoleIds, viewerHasAdminAccess,
      );

      return {
        ...rawField,
        can_view,
        can_edit,
      };
    })
    .filter((f) => f.can_view);

  // Apply layout: restrict to layout fields (when a layout is configured) and honor layout order.
  let finalFields = result;
  if (layout && layoutVisibleFieldIds) {
    finalFields = result.filter((f) => layoutVisibleFieldIds.has((f._id as unknown as Types.ObjectId).toString()));
    finalFields = finalFields.sort((a, b) => {
      const oa = fieldOrder!.get((a._id as unknown as Types.ObjectId).toString()) ?? Number.MAX_SAFE_INTEGER;
      const ob = fieldOrder!.get((b._id as unknown as Types.ObjectId).toString()) ?? Number.MAX_SAFE_INTEGER;
      return oa - ob;
    });
  }

  return {
    fields: finalFields,
    layout_name: layout?.name ?? null,
    layout_id: layout ? layout._id.toString() : null,
  };
}

// ── Shared access-resolution helpers ───────────────────────────────────────────

/**
 * Resolves the viewer's role IDs and whether they hold an admin-level role.
 * Admins bypass all field-level view/edit restrictions.
 */
export async function resolveViewerAccess(
  companyId: string | Types.ObjectId,
  viewerUserId: string,
): Promise<{ viewerRoleIds: Set<string>; viewerHasAdminAccess: boolean }> {
  const { Role } = await import('../models/Role.model');

  const [viewerRoles, adminRoles] = await Promise.all([
    UserRole.find({ user_id: viewerUserId, company_id: companyId }).select('role_id').lean(),
    Role.find({
      company_id: companyId,
      name: { $in: [...ADMIN_ROLE_NAMES] },
      is_active: true,
    }).select('_id').lean(),
  ]);

  const viewerRoleIds = new Set(viewerRoles.map((r) => r.role_id.toString()));
  const adminRoleIds = new Set(adminRoles.map((r) => r._id.toString()));
  const viewerHasAdminAccess = [...viewerRoleIds].some((id) => adminRoleIds.has(id));

  return { viewerRoleIds, viewerHasAdminAccess };
}

/**
 * Computes can_view / can_edit for a single field given its visibility config.
 * Reused by both custom-field resolution and standard-field permission resolution.
 */
export function computeFieldAccess(
  visibility: FieldVisibility,
  visibleRoles: string[] | undefined,
  editVisibility: FieldVisibility,
  editVisibleRoles: string[] | undefined,
  viewerRoleIds: Set<string>,
  viewerHasAdminAccess: boolean,
): { can_view: boolean; can_edit: boolean } {
  let can_view = visibility === 'all';
  if (visibility === 'admin_only') can_view = viewerHasAdminAccess;
  if (visibility === 'role_specific') {
    can_view = (visibleRoles?.some((id) => viewerRoleIds.has(id)) ?? false) || viewerHasAdminAccess;
  }

  let can_edit = editVisibility === 'all';
  if (editVisibility === 'admin_only') can_edit = viewerHasAdminAccess;
  if (editVisibility === 'role_specific') {
    can_edit = (editVisibleRoles?.some((id) => viewerRoleIds.has(id)) ?? false) || viewerHasAdminAccess;
  }

  return { can_view, can_edit };
}

// ── Standard (built-in) field permissions ──────────────────────────────────────

export interface StandardFieldPermission {
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
}

/**
 * Resolves view/edit permissions for all standard (built-in) fields of a
 * target object, using the FieldPermission collection.
 *
 * Falls back to full access (can_view=true, can_edit=true) for any field
 * that has no explicit FieldPermission record — preserving legacy behaviour
 * until an admin configures restrictions.
 *
 * Returns an array of { field_name, can_view, can_edit } entries.
 */
export async function resolveStandardFieldPermissions(
  companyId: string | Types.ObjectId,
  targetObject: 'user' | 'department' | 'policy',
  viewerUserId: string,
): Promise<StandardFieldPermission[]> {
  const { viewerRoleIds, viewerHasAdminAccess } = await resolveViewerAccess(companyId, viewerUserId);

  const permissionRecords = await FieldPermission.find({
    company_id: companyId,
    target_object: targetObject,
    is_active: true,
  }).lean();

  const byFieldName = new Map<string, Record<string, unknown>>();
  for (const record of permissionRecords) {
    byFieldName.set(record.field_name, record as unknown as Record<string, unknown>);
  }

  const standardFields = STANDARD_FIELDS[targetObject] || [];

  return standardFields.map((fieldName) => {
    const perm = byFieldName.get(fieldName);
    if (!perm) {
      return { field_name: fieldName, can_view: true, can_edit: true };
    }

    const visibleRoles = (perm.visible_roles as Types.ObjectId[] | undefined)?.map((r) => r.toString());
    const editVisibleRoles = (perm.edit_visible_roles as Types.ObjectId[] | undefined)?.map((r) => r.toString());

    const { can_view, can_edit } = computeFieldAccess(
      perm.visibility as FieldVisibility,
      visibleRoles,
      perm.edit_visibility as FieldVisibility,
      editVisibleRoles,
      viewerRoleIds,
      viewerHasAdminAccess,
    );

    return { field_name: fieldName, can_view, can_edit };
  });
}

/**
 * Strips standard fields from an update payload that the viewer is not
 * allowed to edit. Returns a filtered copy of the updates object.
 *
 * THIS IS THE SECURITY BOUNDARY — the frontend may be tampered with, so
 * non-editable fields are removed before they reach the model layer.
 */
export async function enforceStandardFieldPermissions(
  companyId: string | Types.ObjectId,
  targetObject: 'user' | 'department' | 'policy',
  viewerUserId: string,
  updates: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const permissions = await resolveStandardFieldPermissions(companyId, targetObject, viewerUserId);
  const nonEditable = new Set(
    permissions.filter((p) => !p.can_edit).map((p) => p.field_name),
  );

  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (nonEditable.has(key)) continue;
    filtered[key] = value;
  }

  return filtered;
}

/**
 * Strips custom fields from a values record that the viewer is not
 * allowed to edit, applying the same can_edit logic as
 * resolveEffectiveCustomFields.
 *
 * THIS IS THE SECURITY BOUNDARY for custom fields.
 */
export async function enforceCustomFieldPermissions(
  companyId: string | Types.ObjectId,
  targetObject: 'user' | 'department' | 'policy',
  viewerUserId: string,
  values: Record<string, unknown> | undefined,
): Promise<Record<string, unknown>> {
  if (!values) return {};

  const effective = await resolveEffectiveCustomFields(companyId, targetObject, viewerUserId, []);
  const nonEditableSlugs = new Set(
    effective.fields.filter((f) => !f.can_edit).map((f) => (f as Record<string, unknown>).slug as string),
  );

  const filtered: Record<string, unknown> = {};
  for (const [slug, value] of Object.entries(values)) {
    if (nonEditableSlugs.has(slug)) continue;
    filtered[slug] = value;
  }

  return filtered;
}
