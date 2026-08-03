// src/features/organization/components/BUForm.tsx
import React, { useState, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserSelect } from '@/components/ui/UserSelect';
import { MultiUserSelect } from '@/components/ui/MultiUserSelect';
import { DynamicCustomFields, isFieldRequired } from '@/features/data-fields/components/DynamicCustomFields';
import { useEffectiveCustomFields } from '@/features/data-fields/hooks/useEffectiveCustomFields';
import type { Department } from '@/types';
import { cn } from '@/utils/cn';

const schema = z.object({
  name: z.string()
    .trim()
    .min(1, 'Business Unit name is required')
    .max(100, 'Name too long')
    .regex(/^[^<>]+$/, 'HTML tags not allowed'),
  parent_id: z.string().optional().nullable(),
  primary_manager_id: z.string().optional().nullable(),
  secondary_manager_ids: z.array(z.string()).optional().default([]),
}).superRefine((data, ctx) => {
  if (data.primary_manager_id && data.secondary_manager_ids.includes(data.primary_manager_id)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'User cannot be both primary and secondary manager',
      path: ['secondary_manager_ids'],
    });
  }
});

export type BUFormData = z.infer<typeof schema>;

interface BUFormProps {
  initialData?: Department;
  onSubmit: (data: BUFormData & { custom_fields?: Record<string, unknown> }) => void;
  departments: Department[];
  isSubmitting?: boolean;
}

const inputClass = (hasError?: boolean) =>
  cn(
    'w-full h-10 px-3 text-sm rounded-md border bg-white/5 text-slate-200 border-white/10',
    'placeholder:text-slate-500 transition-all duration-150',
    'focus:outline-none focus:ring-1 focus:border-primary/50 focus:ring-primary/50',
    'disabled:bg-black/20 disabled:text-slate-500 disabled:cursor-not-allowed',
    hasError
      ? 'border-error focus:border-error focus:ring-error/50'
      : 'hover:border-white/20'
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
    watch,
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
      setCustomFieldValues(initialData.custom_fields ?? {});
    }
  }, [initialData, reset]);

  // ── Custom fields ──
  const { data: effectiveFields } = useEffectiveCustomFields('department', []);
  const customFields = React.useMemo(
    () => (effectiveFields?.fields ?? []).filter((f) => !f.is_system_field),
    [effectiveFields],
  );
  const readOnlyCustomFieldSlugs = React.useMemo(
    () => customFields.filter((f) => !f.can_edit).map((f) => f.slug),
    [customFields],
  );
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>(
    initialData?.custom_fields ?? {}
  );
  const [customFieldErrors, setCustomFieldErrors] = useState<Record<string, string>>({});

  const handleCustomFieldChange = useCallback((slug: string, value: unknown) => {
    setCustomFieldValues((prev) => ({ ...prev, [slug]: value }));
    setCustomFieldErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
  }, []);

  const formValues = watch();
  const allValues = React.useMemo(() => ({ ...formValues, ...customFieldValues }), [formValues, customFieldValues]);

  const validateCustomFields = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    for (const field of customFields) {
      if (isFieldRequired(field, allValues)) {
        const value = customFieldValues[field.slug] ?? field.default_value;
        if (value === null || value === undefined || value === '') {
          newErrors[field.slug] = `${field.label} is required`;
        }
      }
    }
    setCustomFieldErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [customFields, customFieldValues, allValues]);

  const handleSubmitWithCustomFields = handleSubmit((data) => {
    if (!validateCustomFields()) return;
    onSubmit({
      ...data,
      custom_fields: customFields.reduce((acc, field) => {
        if (field.can_edit) {
          acc[field.slug] = customFieldValues[field.slug] ?? (field.default_value ?? null);
        }
        return acc;
      }, {} as Record<string, unknown>),
    });
  });

  // Business Units can only have other Business Units as parents
  const availableBUs = departments.filter(
    (d) => d.type === 'business_unit' && d._id !== initialData?._id
  );

  return (
    <form id="bu-form" onSubmit={(e) => { e.preventDefault(); handleSubmitWithCustomFields(); }} className="space-y-5" noValidate>
      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="bu-name" className="text-sm font-medium text-ink">
          Business Unit Name <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            id="bu-name"
            {...register('name')}
            placeholder="e.g. North America Operations"
            disabled={isSubmitting}
            maxLength={100}
            className={inputClass(!!errors.name)}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-muted bg-white px-1">
            {watch('name')?.length || 0}/100
          </div>
        </div>
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
              onlyActive={true}
            />
          )}
        />
        <p className="text-[11px] text-ink-muted">
          Select the primary manager who leads and is accountable for this business unit.
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
              onlyActive={true}
            />
          )}
        />
        <p className="text-[11px] text-ink-muted">
          Assign one or more secondary managers who provide matrix leadership or dotted-line supervision.
        </p>
        {errors.secondary_manager_ids && (
          <p className="text-xs text-red-500">{errors.secondary_manager_ids.message}</p>
        )}
      </div>

      {/* ── Custom Fields ── */}
      <DynamicCustomFields
        fields={customFields}
        values={allValues}
        onChange={handleCustomFieldChange}
        errors={customFieldErrors}
        disabled={isSubmitting}
        readOnlySlugs={readOnlyCustomFieldSlugs}
      />

      {/* Hidden submit — triggered by modal footer */}
      <button type="submit" className="hidden" aria-hidden="true" />
    </form>
  );
};

