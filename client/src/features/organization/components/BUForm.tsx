// src/features/organization/components/BUForm.tsx
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Department } from '@/types';
import { cn } from '@/utils/cn';

const schema = z.object({
  name: z.string().min(1, 'Business Unit name is required').max(100, 'Name too long'),
  primary_manager_id: z
    .string()
    .optional()
    .nullable()
    .refine(
      (val) => !val || /^[a-fA-F0-9]{24}$/.test(val),
      { message: 'Must be a valid 24-character MongoDB ObjectId' }
    ),
  secondary_manager_id: z
    .string()
    .optional()
    .nullable()
    .refine(
      (val) => !val || /^[a-fA-F0-9]{24}$/.test(val),
      { message: 'Must be a valid 24-character MongoDB ObjectId' }
    ),
});

export type BUFormData = z.infer<typeof schema>;

interface BUFormProps {
  initialData?: Department;
  onSubmit: (data: BUFormData) => void;
  departments: Department[];
  isSubmitting?: boolean;
}

const inputClass = (hasError?: boolean) =>
  cn(
    'w-full h-9 px-3 text-sm rounded-md border bg-white text-ink',
    'placeholder:text-ink-muted transition-all duration-150',
    'focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/30',
    'disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed',
    hasError
      ? 'border-red-400 focus:border-red-400 focus:ring-red-300/30'
      : 'border-line'
  );

/**
 * BUForm Component
 * Create/edit form for Business Units.
 * Type is locked to 'business_unit' - no type selector shown.
 * Used on: OrganizationPage (Business Units tab - create/edit modal).
 */
export const BUForm: React.FC<BUFormProps> = ({
  initialData,
  onSubmit,
  isSubmitting = false,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BUFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialData?.name ?? '',
      primary_manager_id: initialData?.primary_manager_id ?? '',
      secondary_manager_id: initialData?.secondary_manager_id ?? '',
    },
  });

  return (
    <form id="bu-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="bu-name" className="text-sm font-medium text-ink">
          Business Unit Name <span className="text-red-500">*</span>
        </label>
        <input
          id="bu-name"
          {...register('name')}
          placeholder="e.g. North America Operations"
          disabled={isSubmitting}
          className={inputClass(!!errors.name)}
        />
        {errors.name && (
          <p className="text-xs text-red-500">{errors.name.message}</p>
        )}
        <p className="text-[11px] text-ink-muted">
          Business Units are the top-level containers in your organization hierarchy.
        </p>
      </div>

      {/* Primary Manager */}
      <div className="space-y-1.5">
        <label htmlFor="bu-manager" className="text-sm font-medium text-ink">
          Primary Manager ID
        </label>
        <input
          id="bu-manager"
          {...register('primary_manager_id')}
          placeholder="24-char MongoDB ObjectId"
          disabled={isSubmitting}
          className={inputClass(!!errors.primary_manager_id)}
        />
        <p className="text-[11px] text-ink-muted">
          Enter the 24-character hex ID of the primary manager user.
        </p>
        {errors.primary_manager_id && (
          <p className="text-xs text-red-500">{errors.primary_manager_id.message}</p>
        )}
      </div>

      {/* Secondary Manager */}
      <div className="space-y-1.5">
        <label htmlFor="bu-secondary-manager" className="text-sm font-medium text-ink">
          Secondary Manager ID
        </label>
        <input
          id="bu-secondary-manager"
          {...register('secondary_manager_id')}
          placeholder="24-char MongoDB ObjectId"
          disabled={isSubmitting}
          className={inputClass(!!errors.secondary_manager_id)}
        />
        <p className="text-[11px] text-ink-muted">
          Optional secondary manager for backup coverage.
        </p>
        {errors.secondary_manager_id && (
          <p className="text-xs text-red-500">{errors.secondary_manager_id.message}</p>
        )}
      </div>

      {/* Hidden submit — triggered by modal footer */}
      <button type="submit" className="hidden" aria-hidden="true" />
    </form>
  );
};
