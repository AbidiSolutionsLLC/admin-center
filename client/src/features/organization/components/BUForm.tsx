// src/features/organization/components/BUForm.tsx
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserSelect } from '@/components/ui/UserSelect';
import { MultiUserSelect } from '@/components/ui/MultiUserSelect';
import type { Department } from '@/types';
import { cn } from '@/utils/cn';

const schema = z.object({
  name: z.string()
    .min(1, 'Business Unit name is required')
    .max(100, 'Name too long')
    .regex(/^[a-zA-Z0-9\s\-\.\(\)]+$/, 'Name contains invalid characters'),
  parent_id: z.string().optional().nullable(),
  primary_manager_id: z.string().optional().nullable(),
  secondary_manager_ids: z.array(z.string()).optional().default([]),
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
  departments,
  isSubmitting = false,
}) => {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<BUFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialData?.name ?? '',
      parent_id: (typeof initialData?.parent_id === 'object' && initialData?.parent_id !== null) ? initialData.parent_id._id : (initialData?.parent_id as string ?? ''),
      primary_manager_id: (typeof initialData?.primary_manager_id === 'object' && initialData?.primary_manager_id !== null) ? initialData.primary_manager_id._id : (initialData?.primary_manager_id as string ?? ''),
      secondary_manager_ids: initialData?.secondary_manager_ids ?? [],
    },
  });

  // Reset form when initialData changes
  React.useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name ?? '',
        parent_id: (typeof initialData.parent_id === 'object' && initialData.parent_id !== null) ? initialData.parent_id._id : (initialData.parent_id as string ?? ''),
        primary_manager_id: (typeof initialData.primary_manager_id === 'object' && initialData.primary_manager_id !== null) ? initialData.primary_manager_id._id : (initialData.primary_manager_id as string ?? ''),
        secondary_manager_ids: initialData.secondary_manager_ids ?? [],
      });
    }
  }, [initialData, reset]);

  // Business Units can only have other Business Units as parents
  const availableBUs = departments.filter(
    (d) => d.type === 'business_unit' && d._id !== initialData?._id
  );

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

      {/* Parent Business Unit */}
      <div className="space-y-1.5">
        <label htmlFor="bu-parent" className="text-sm font-medium text-ink">
          Parent Business Unit
        </label>
        <select
          id="bu-parent"
          {...register('parent_id')}
          disabled={isSubmitting}
          className={inputClass(false)}
        >
          <option value="">None (Top Level)</option>
          {availableBUs.map((bu) => (
            <option key={bu._id} value={bu._id}>
              {bu.name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-link-muted">
          Select a parent Business Unit to create a nested hierarchy.
        </p>
      </div>

      {/* Primary Manager */}
      <div className="space-y-1.5">
        <label htmlFor="bu-manager" className="text-sm font-medium text-ink">
          Primary Manager
        </label>
        <Controller
          name="primary_manager_id"
          control={control}
          render={({ field }) => (
            <UserSelect
              value={field.value}
              onChange={field.onChange}
              disabled={isSubmitting}
              hasError={!!errors.primary_manager_id}
              placeholder="Select primary manager"
            />
          )}
        />
        <p className="text-[11px] text-ink-muted">
          Designate a leader for this business unit.
        </p>
        {errors.primary_manager_id && (
          <p className="text-xs text-red-500">{errors.primary_manager_id.message}</p>
        )}
      </div>

      {/* Secondary Managers */}
      <div className="space-y-1.5">
        <label htmlFor="bu-secondary-managers" className="text-sm font-medium text-ink">
          Secondary Managers
        </label>
        <Controller
          name="secondary_manager_ids"
          control={control}
          render={({ field }) => (
            <MultiUserSelect
              value={field.value}
              onChange={field.onChange}
              disabled={isSubmitting}
              hasError={!!errors.secondary_manager_ids}
              placeholder="Select secondary managers"
            />
          )}
        />
        <p className="text-[11px] text-ink-muted">
          Optional secondary managers for matrix leadership and coverage.
        </p>
        {errors.secondary_manager_ids && (
          <p className="text-xs text-red-500">{errors.secondary_manager_ids.message}</p>
        )}
      </div>

      {/* Hidden submit — triggered by modal footer */}
      <button type="submit" className="hidden" aria-hidden="true" />
    </form>
  );
};

