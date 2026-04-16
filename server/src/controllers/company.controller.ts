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

export const getCompanySettings = asyncHandler(async (req: Request, res: Response) => {
  const company = await Company.findById(req.user.company_id)
    .select('name employee_id_format employee_id_counter');
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
