// server/src/controllers/company.controller.ts
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { Company } from '../models/Company.model';
import { AppError } from '../utils/AppError';
import { auditLogger } from '../lib/auditLogger';
import { runInTransaction, emitPlatformEvent, correlationIdFor } from '../lib/platformEvents';
import { z } from 'zod';
import { validateEmployeeIdFormat } from '../services/employeeId';
import { ALL_IANA_TIMEZONES } from '../constants/timezones';

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

const UpdateAuditLogRetentionSchema = z.object({
  audit_log_retention_days: z.number().min(0).max(3650),
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

  const correlation_id = correlationIdFor(req);
  const company = await runInTransaction(async (session) => {
  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    { employee_id_format: input.employee_id_format },
    { new: true, runValidators: true, session },
  );

  await auditLogger.logTx(session, {
    req,
    correlation_id,
    action: 'company.employee_id_format_updated',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: { employee_id_format: before.employee_id_format },
    after_state: { employee_id_format: input.employee_id_format },
  });
  await emitPlatformEvent(session, {
    org_id: req.user.company_id, type: 'org.updated',
    subject: { type: 'org', id: String(req.user.company_id) },
    actor: { type: 'member', id: String(req.user.userId) }, correlation_id,
    data: { employee_id_format: input.employee_id_format },
  });
  return company;
  });

  res.json({ success: true, data: company });
});

export const updateRequiredUserFields = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateRequiredUserFieldsSchema.parse(req.body);

  const before = await Company.findById(req.user.company_id).lean();
  if (!before) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');

  const correlation_id = correlationIdFor(req);
  const company = await runInTransaction(async (session) => {
  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    { 'settings.required_user_fields': input.required_user_fields },
    { new: true, runValidators: true, session },
  );

  await auditLogger.logTx(session, {
    req,
    correlation_id,
    action: 'company.required_user_fields_updated',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: { required_user_fields: before.settings?.required_user_fields || ['email', 'full_name'] },
    after_state: { required_user_fields: input.required_user_fields },
  });
  await emitPlatformEvent(session, {
    org_id: req.user.company_id, type: 'org.updated',
    subject: { type: 'org', id: String(req.user.company_id) },
    actor: { type: 'member', id: String(req.user.userId) }, correlation_id,
    data: { required_user_fields: input.required_user_fields },
  });
  return company;
  });

  res.json({ success: true, data: company });
});

export const updateDomainEnforcement = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateDomainEnforcementSchema.parse(req.body);

  const before = await Company.findById(req.user.company_id).lean();
  if (!before) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');

  const correlation_id = correlationIdFor(req);
  const company = await runInTransaction(async (session) => {
  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    {
      'settings.allowed_domains': input.allowed_domains,
      'settings.is_domain_enforcement_active': input.is_domain_enforcement_active,
    },
    { new: true, runValidators: true, session },
  );

  await auditLogger.logTx(session, {
    req,
    correlation_id,
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
  await emitPlatformEvent(session, {
    org_id: req.user.company_id, type: 'org.updated',
    subject: { type: 'org', id: String(req.user.company_id) },
    actor: { type: 'member', id: String(req.user.userId) }, correlation_id,
    data: {
      allowed_domains: input.allowed_domains,
      is_domain_enforcement_active: input.is_domain_enforcement_active,
    },
  });
  return company;
  });

  res.json({ success: true, data: company });
});

import { CustomField } from '../models/CustomField.model';

/**
 * Resets company settings to factory defaults.
 */
export const resetCompanySettings = asyncHandler(async (req: Request, res: Response) => {
  const before = await Company.findById(req.user.company_id).lean();
  if (!before) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');

  const defaultSettings = {
    required_user_fields: ['email', 'full_name'],
    employee_id_format: 'EMP-####',
    is_domain_enforcement_active: false,
    allowed_domains: [],
    timezone: 'UTC',
    locale: 'en-US',
    default_location_id: null,
  };

  const correlation_id = correlationIdFor(req);
  const company = await runInTransaction(async (session) => {
  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    {
      $set: {
        employee_id_format: 'EMP-{counter:5}',
        settings: defaultSettings
      }
    },
    { new: true, runValidators: true, session }
  );

  // Align with frontend: Purge all non-system custom fields
  await CustomField.deleteMany({
    company_id: req.user.company_id,
    is_system_field: false,
  }, { session });

  await auditLogger.logTx(session, {
    req,
    correlation_id,
    action: 'company.settings_reset',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: before,
    after_state: company?.toObject(),
  });
  await emitPlatformEvent(session, {
    org_id: req.user.company_id, type: 'org.updated',
    subject: { type: 'org', id: String(req.user.company_id) },
    actor: { type: 'member', id: String(req.user.userId) }, correlation_id,
    data: { settings_reset: true },
  });
  return company;
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

  const correlation_id = correlationIdFor(req);
  const company = await runInTransaction(async (session) => {
  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    { name: input.name },
    { new: true, runValidators: true, session },
  );

  await auditLogger.logTx(session, {
    req,
    correlation_id,
    action: 'company.name_updated',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: { name: before.name },
    after_state: { name: input.name },
  });
  await emitPlatformEvent(session, {
    org_id: req.user.company_id, type: 'org.updated',
    subject: { type: 'org', id: String(req.user.company_id) },
    actor: { type: 'member', id: String(req.user.userId) }, correlation_id,
    data: { name: input.name },
  });
  return company;
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
  if (ALL_IANA_TIMEZONES.length > 1 && !ALL_IANA_TIMEZONES.includes(input.timezone)) {
    throw new AppError(`Invalid timezone: "${input.timezone}". Must be a valid IANA timezone.`, 400, 'INVALID_TIMEZONE');
  }

  const before = await Company.findById(req.user.company_id).lean();
  if (!before) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');

  const correlation_id = correlationIdFor(req);
  const company = await runInTransaction(async (session) => {
  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    { 'settings.timezone': input.timezone },
    { new: true, runValidators: true, session },
  );

  await auditLogger.logTx(session, {
    req,
    correlation_id,
    action: 'company.timezone_updated',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: { timezone: before.settings?.timezone || 'UTC' },
    after_state: { timezone: input.timezone },
  });
  await emitPlatformEvent(session, {
    org_id: req.user.company_id, type: 'org.updated',
    subject: { type: 'org', id: String(req.user.company_id) },
    actor: { type: 'member', id: String(req.user.userId) }, correlation_id,
    data: { timezone: input.timezone },
  });
  return company;
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

  const correlation_id = correlationIdFor(req);
  const company = await runInTransaction(async (session) => {
  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    { 'settings.locale': input.locale },
    { new: true, runValidators: true, session },
  );

  await auditLogger.logTx(session, {
    req,
    correlation_id,
    action: 'company.locale_updated',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: { locale: before.settings?.locale || 'en-US' },
    after_state: { locale: input.locale },
  });
  await emitPlatformEvent(session, {
    org_id: req.user.company_id, type: 'org.updated',
    subject: { type: 'org', id: String(req.user.company_id) },
    actor: { type: 'member', id: String(req.user.userId) }, correlation_id,
    data: { locale: input.locale },
  });
  return company;
  });

  res.json({ success: true, data: company });
});

const UpdateDefaultLocationSchema = z.object({
  default_location_id: z.string().nullable(),
});

export const updateDefaultLocation = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateDefaultLocationSchema.parse(req.body);

  // Validate the location exists and belongs to this company
  if (input.default_location_id) {
    const { Location } = await import('../models/Location.model');
    const location = await Location.findOne({
      _id: input.default_location_id,
      company_id: req.user.company_id,
      is_deleted: { $ne: true },
    });
    if (!location) {
      throw new AppError('Location not found or deleted', 404, 'LOCATION_NOT_FOUND');
    }
  }

  const before = await Company.findById(req.user.company_id).lean();
  if (!before) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');

  const correlation_id = correlationIdFor(req);
  const company = await runInTransaction(async (session) => {
  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    { 'settings.default_location_id': input.default_location_id },
    { new: true, runValidators: true, session },
  );

  await auditLogger.logTx(session, {
    req,
    correlation_id,
    action: 'company.default_location_updated',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: { default_location_id: before.settings?.default_location_id ?? null },
    after_state: { default_location_id: input.default_location_id },
  });
  await emitPlatformEvent(session, {
    org_id: req.user.company_id, type: 'org.updated',
    subject: { type: 'org', id: String(req.user.company_id) },
    actor: { type: 'member', id: String(req.user.userId) }, correlation_id,
    data: { default_location_id: input.default_location_id },
  });
  return company;
  });

  res.json({ success: true, data: company });
});

/**
 * PUT /settings/audit-log-retention
 * Updates the company-wide audit log retention policy.
 */
export const updateAuditLogRetention = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateAuditLogRetentionSchema.parse(req.body);

  const before = await Company.findById(req.user.company_id).lean();
  if (!before) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');

  const correlation_id = correlationIdFor(req);
  const company = await runInTransaction(async (session) => {
  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    { 'settings.audit_log_retention_days': input.audit_log_retention_days },
    { new: true, runValidators: true, session },
  );

  await auditLogger.logTx(session, {
    req,
    correlation_id,
    action: 'company.audit_log_retention_updated',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: { audit_log_retention_days: before.settings?.audit_log_retention_days || 0 },
    after_state: { audit_log_retention_days: input.audit_log_retention_days },
  });
  await emitPlatformEvent(session, {
    org_id: req.user.company_id, type: 'org.updated',
    subject: { type: 'org', id: String(req.user.company_id) },
    actor: { type: 'member', id: String(req.user.userId) }, correlation_id,
    data: { audit_log_retention_days: input.audit_log_retention_days },
  });
  return company;
  });

  res.json({ success: true, data: company });
});

const UpdateInsightSensitivitySchema = z.object({
  insight_sensitivity: z.enum(['low', 'medium', 'high']),
});

/**
 * PUT /settings/insight-sensitivity
 * Updates the company-wide insight sensitivity policy.
 */
export const updateInsightSensitivity = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateInsightSensitivitySchema.parse(req.body);

  const before = await Company.findById(req.user.company_id).lean();
  if (!before) throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');

  const correlation_id = correlationIdFor(req);
  const company = await runInTransaction(async (session) => {
  const company = await Company.findByIdAndUpdate(
    req.user.company_id,
    { 'settings.insight_sensitivity': input.insight_sensitivity },
    { new: true, runValidators: true, session },
  );

  await auditLogger.logTx(session, {
    req,
    correlation_id,
    action: 'company.insight_sensitivity_updated',
    module: 'company',
    object_type: 'company',
    object_id: req.user.company_id,
    object_label: company?.name || 'company',
    before_state: { insight_sensitivity: (before.settings as any)?.insight_sensitivity || 'medium' },
    after_state: { insight_sensitivity: input.insight_sensitivity },
  });
  await emitPlatformEvent(session, {
    org_id: req.user.company_id, type: 'org.updated',
    subject: { type: 'org', id: String(req.user.company_id) },
    actor: { type: 'member', id: String(req.user.userId) }, correlation_id,
    data: { insight_sensitivity: input.insight_sensitivity },
  });
  return company;
  });

  res.json({ success: true, data: company });
});
