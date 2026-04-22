// server/src/controllers/company.controller.ts
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { Company } from '../models/Company.model';
import { AppError } from '../utils/AppError';
import { auditLogger } from '../lib/auditLogger';
import { z } from 'zod';
import { validateEmployeeIdFormat } from '../services/employeeId';

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
