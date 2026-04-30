// server/src/controllers/company.controller.ts
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { Company } from '../models/Company.model';
import { AppError } from '../utils/AppError';
import { auditLogger } from '../lib/auditLogger';
import { z } from 'zod';
import { validateEmployeeIdFormat } from '../services/employeeId';

// ── Common timezones list for validation ────────────────────────────────────
let VALID_TIMEZONES: string[] = [];
try {
  // Intl.supportedValuesOf is available in Node 16+ / V8 9.3+
  VALID_TIMEZONES = (Intl as any).supportedValuesOf('timeZone') as string[];
} catch {
  // Fallback: skip server-side validation — client already restricts to known values
  VALID_TIMEZONES = [];
}

const UpdateCompanyNameSchema = z.object({
  name: z.string().min(2, 'Company name must be at least 2 characters').max(100, 'Company name must be 100 characters or fewer'),
});

const UpdateTimezoneSchema = z.object({
  timezone: z.string().min(1, 'Timezone is required'),
});

const UpdateLocaleSchema = z.object({
  locale: z
    .string()
    .min(2, 'Locale is required')
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Locale must be a valid IETF language tag (e.g. en-US, fr-FR)'),
});

const UpdateEmployeeIdFormatSchema = z.object({
  employee_id_format: z
    .string()
    .min(1)
    .max(50)                                     // FIX-12: max length guard
    .superRefine((value, ctx) => {
      const validation = validateEmployeeIdFormat(value);
      if (!validation.valid) {
        validation.errors.forEach((error) => {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: error.message,
          });
        });
      }
    }),
});

const UpdateRequiredUserFieldsSchema = z.object({
  required_user_fields: z.array(z.string()).min(1, 'At least one required field must be specified'),
});

const UpdateDomainEnforcementSchema = z.object({
  allowed_domains: z.array(z.string()).min(0),
  is_domain_enforcement_active: z.boolean(),
});

export const getCompanySettings = asyncHandler(async (req: Request, res: Response) => {
  const company = await Company.findById(req.user.company_id)
    .select('name employee_id_format employee_id_counter settings');
  if (!company) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');
  res.json({ success: true, data: company });
});

export const updateEmployeeIdFormat = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateEmployeeIdFormatSchema.parse(req.body);

  const before = await Company.findById(req.user.company_id).lean();
  if (!before) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');

  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    { employee_id_format: input.employee_id_format },
    { new: true, runValidators: true },
  );

  await auditLogger.log({
    req,
    action: 'company.employee_id_format_updated',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: { employee_id_format: before.employee_id_format },
    after_state: { employee_id_format: input.employee_id_format },
  });

  res.json({ success: true, data: company });
});

export const updateRequiredUserFields = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateRequiredUserFieldsSchema.parse(req.body);

  const before = await Company.findById(req.user.company_id).lean();
  if (!before) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');

  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    { 'settings.required_user_fields': input.required_user_fields },
    { new: true, runValidators: true },
  );

  await auditLogger.log({
    req,
    action: 'company.required_user_fields_updated',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: { required_user_fields: before.settings?.required_user_fields || ['email', 'full_name'] },
    after_state: { required_user_fields: input.required_user_fields },
  });

  res.json({ success: true, data: company });
});

export const updateDomainEnforcement = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateDomainEnforcementSchema.parse(req.body);

  const before = await Company.findById(req.user.company_id).lean();
  if (!before) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');

  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    {
      'settings.allowed_domains': input.allowed_domains,
      'settings.is_domain_enforcement_active': input.is_domain_enforcement_active,
    },
    { new: true, runValidators: true },
  );

  await auditLogger.log({
    req,
    action: 'company.domain_enforcement_updated',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: {
      allowed_domains: before.settings?.allowed_domains || [],
      is_domain_enforcement_active: before.settings?.is_domain_enforcement_active || false,
    },
    after_state: {
      allowed_domains: input.allowed_domains,
      is_domain_enforcement_active: input.is_domain_enforcement_active,
    },
  });

  res.json({ success: true, data: company });
});

/**
 * Resets company settings to factory defaults.
 */
export const resetCompanySettings = asyncHandler(async (req: Request, res: Response) => {
  const before = await Company.findById(req.user.company_id).lean();
  if (!before) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');

  const defaults = {
    employee_id_format: 'EMP-{counter:5}',
    'settings.required_user_fields': ['email', 'full_name'],
    'settings.is_domain_enforcement_active': false,
    'settings.allowed_domains': [],
    'settings.timezone': 'UTC',
    'settings.locale': 'en-US',
  };

  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    defaults,
    { new: true, runValidators: true }
  );

  await auditLogger.log({
    req,
    action: 'company.settings_reset',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: before,
    after_state: company?.toObject(),
  });

  res.json({ success: true, data: company });
});

/**
 * PUT /settings/company-name
 * Updates the company display name.
 */
export const updateCompanyName = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateCompanyNameSchema.parse(req.body);

  const before = await Company.findById(req.user.company_id).lean();
  if (!before) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');

  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    { name: input.name },
    { new: true, runValidators: true },
  );

  await auditLogger.log({
    req,
    action: 'company.name_updated',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: { name: before.name },
    after_state: { name: input.name },
  });

  res.json({ success: true, data: company });
});

/**
 * PUT /settings/timezone
 * Updates the company-wide default timezone.
 */
export const updateTimezone = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateTimezoneSchema.parse(req.body);

  // Validate the timezone is an IANA timezone identifier
  if (VALID_TIMEZONES.length > 1 && !VALID_TIMEZONES.includes(input.timezone)) {
    throw new AppError(`Invalid timezone: "${input.timezone}". Must be a valid IANA timezone.`, 400, 'INVALID_TIMEZONE');
  }

  const before = await Company.findById(req.user.company_id).lean();
  if (!before) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');

  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    { 'settings.timezone': input.timezone },
    { new: true, runValidators: true },
  );

  await auditLogger.log({
    req,
    action: 'company.timezone_updated',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: { timezone: before.settings?.timezone || 'UTC' },
    after_state: { timezone: input.timezone },
  });

  res.json({ success: true, data: company });
});

/**
 * PUT /settings/locale
 * Updates the company-wide locale (e.g. en-US, fr-FR).
 */
export const updateLocale = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateLocaleSchema.parse(req.body);

  const before = await Company.findById(req.user.company_id).lean();
  if (!before) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');

  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    { 'settings.locale': input.locale },
    { new: true, runValidators: true },
  );

  await auditLogger.log({
    req,
    action: 'company.locale_updated',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: { locale: before.settings?.locale || 'en-US' },
    after_state: { locale: input.locale },
  });

  res.json({ success: true, data: company });
});
