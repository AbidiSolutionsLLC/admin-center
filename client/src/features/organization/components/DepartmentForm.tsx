// src/features/organization/components/DepartmentForm.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserSelect } from '@/components/ui/UserSelect';
import { MultiUserSelect } from '@/components/ui/MultiUserSelect';
import { DynamicCustomFields } from '@/features/data-fields/components/DynamicCustomFields';
import { useCustomFields } from '@/features/data-fields/hooks/useCustomFields';
import type { Department, CustomField } from '@/types';
import { cn } from '@/utils/cn';

const schema = z.object({
  name: z.string().trim().min(1, 'Department name is required').max(100, 'Name too long').regex(/^[^<>]+$/, 'HTML tags not allowed'),
  type: z.enum(['business_unit', 'division', 'department', 'cost_center']),
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
}).refine(data => {
  // Only Business Units are allowed to be top-level (no parent_id)
  if (data.type !== 'business_unit' && !data.parent_id) {
    return false;
  }
  return true;
}, {
  message: 'All units except Business Units must have a parent to avoid being orphaned.',
  path: ['parent_id'],
});

export type DepartmentFormData = z.infer<typeof schema>;

interface DepartmentFormProps {
  initialData?: Department;
  onSubmit: (data: DepartmentFormData & { custom_fields?: Record<string, unknown> }) => void;
  departments: Department[];
  isSubmitting?: boolean;
  allowedTypes?: Array<'business_unit' | 'division' | 'department' | 'cost_center'>;
}

const DEPT_TYPE_OPTIONS: { value: 'business_unit' | 'division' | 'department' | 'cost_center'; label: string }[] = [
  { value: 'business_unit', label: 'Business Unit' },
  { value: 'division', label: 'Division' },
  { value: 'department', label: 'Department' },
  { value: 'cost_center', label: 'Cost Center' },
];

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
 * DepartmentForm Component
 * Create/edit form for departments with full Zod validation.
 * Includes dynamic custom fields for all field types.
 * Submits via a hidden button (id="department-form") triggered from the modal footer.
 * Used on: OrganizationPage (create + edit modal).
 */
export const DepartmentForm: React.FC<DepartmentFormProps> = ({
  initialData,
  onSubmit,
  departments,
  isSubmitting = false,
  allowedTypes,
}) => {
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<DepartmentFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialData?.name ?? '',
      type: initialData?.type ?? 'department',
      parent_id: (typeof initialData?.parent_id === 'object' && initialData?.parent_id !== null) ? initialData.parent_id._id : (initialData?.parent_id as string ?? ''),
      primary_manager_id: (typeof initialData?.primary_manager_id === 'object' && initialData?.primary_manager_id !== null) ? initialData.primary_manager_id._id : (initialData?.primary_manager_id as string ?? ''),
      secondary_manager_ids: initialData?.secondary_manager_ids ?? [],
    },
  });

  // Sync internal form state when initialData changes
  useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name ?? '',
        type: initialData.type ?? 'department',
        parent_id: (typeof initialData.parent_id === 'object' && initialData.parent_id !== null) ? initialData.parent_id._id : (initialData.parent_id as string ?? ''),
        primary_manager_id: (typeof initialData.primary_manager_id === 'object' && initialData.primary_manager_id !== null) ? initialData.primary_manager_id._id : (initialData.primary_manager_id as string ?? ''),
        secondary_manager_ids: initialData.secondary_manager_ids ?? [],
      });
      setCustomFieldValues(initialData.custom_fields ?? {});
    }
  }, [initialData, reset]);

  const selectedType = watch('type');
  const availableParents = departments.filter((d) => d._id !== initialData?._id);

  // ── Custom fields ──────────────────────────────────────────────────────
  const { data: customFields = [] } = useCustomFields('department');
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>(
    initialData?.custom_fields ?? {}
  );
  const [customFieldErrors, setCustomFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData?.custom_fields && Object.keys(initialData.custom_fields).length > 0) {
      setCustomFieldValues(initialData.custom_fields);
    }
  }, [initialData]);

  const handleCustomFieldChange = useCallback((slug: string, value: unknown) => {
    setCustomFieldValues((prev) => ({ ...prev, [slug]: value }));
    setCustomFieldErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
  }, []);

  const validateCustomFields = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    for (const field of customFields) {
      if (field.required) {
        const value = customFieldValues[field.slug];
        if (value === null || value === undefined || value === '') {
          newErrors[field.slug] = `${field.label} is required`;
        }
      }
    }
    setCustomFieldErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [customFields, customFieldValues]);

  const handleSubmitWithCustomFields = handleSubmit((data) => {
    if (!validateCustomFields()) return;
    onSubmit({
      ...data,
      custom_fields: customFieldValues,
    });
  });

  return (
    <form id="department-form" onSubmit={(e) => { e.preventDefault(); handleSubmitWithCustomFields(); }} className="space-y-5" noValidate>
      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="dept-name" className="text-sm font-medium text-ink">
          Department Name <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            id="dept-name"
            {...register('name')}
            placeholder="e.g. Engineering"
            disabled={isSubmitting}
            maxLength={100}
            style={{
  width: '100%', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(8px)',
  border: !!errors.name ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#f8fafc', outline: 'none', transition: 'all 0.25s ease'
}}
onFocus={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = !!errors.name ? 'rgba(239,68,68,0.5)' : 'rgba(245,176,42,0.35)'; e.currentTarget.style.boxShadow = !!errors.name ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(245,176,42,0.06)'; }}
onBlur={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = !!errors.name ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-muted bg-white px-1">
            {watch('name')?.length || 0}/100
          </div>
        </div>
        {errors.name && (
          <p className="text-xs text-red-500">{errors.name.message}</p>
        )}
      </div>

      {/* Type */}
      <div className="space-y-1.5">
        <label htmlFor="dept-type" className="text-sm font-medium text-ink">
          Type <span className="text-red-500">*</span>
        </label>
        <select
          id="dept-type"
          {...register('type')}
          disabled={isSubmitting}
          style={{
  width: '100%', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(8px)',
  border: !!errors.type ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#f8fafc', outline: 'none', transition: 'all 0.25s ease'
}}
onFocus={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = !!errors.type ? 'rgba(239,68,68,0.5)' : 'rgba(245,176,42,0.35)'; e.currentTarget.style.boxShadow = !!errors.type ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(245,176,42,0.06)'; }}
onBlur={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = !!errors.type ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          {DEPT_TYPE_OPTIONS.filter(opt => !allowedTypes || allowedTypes.includes(opt.value)).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {errors.type && (
          <p className="text-xs text-red-500">{errors.type.message}</p>
        )}
      </div>

      {/* Parent Department */}
      <div className="space-y-1.5">
        <label htmlFor="dept-parent" className="text-sm font-medium text-ink">
          Parent Department {selectedType !== 'business_unit' && <span className="text-red-500">*</span>}
        </label>
        <select
          id="dept-parent"
          {...register('parent_id')}
          disabled={isSubmitting}
          style={{
  width: '100%', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(8px)',
  border: !!errors.parent_id ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#f8fafc', outline: 'none', transition: 'all 0.25s ease'
}}
onFocus={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = !!errors.parent_id ? 'rgba(239,68,68,0.5)' : 'rgba(245,176,42,0.35)'; e.currentTarget.style.boxShadow = !!errors.parent_id ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(245,176,42,0.06)'; }}
onBlur={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = !!errors.parent_id ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          {selectedType === 'business_unit' && <option value="">None (Top Level)</option>}
          <option value="" disabled={selectedType !== 'business_unit'}>
            {selectedType === 'business_unit' ? 'None (Top Level)' : 'Select a parent...'}
          </option>
          {availableParents.map((d) => (
            <option key={d._id} value={d._id}>
              {d.name}
              {d.type ? ` · ${d.type.replace(/_/g, ' ')}` : ''}
            </option>
          ))}
        </select>
        {errors.parent_id && (
          <p className="text-xs text-red-500">{errors.parent_id.message}</p>
        )}
        <p className="text-[11px] text-ink-muted">
          {selectedType === 'business_unit' 
            ? 'Leave empty to create a top-level unit.' 
            : 'Every unit must belong to a Business Unit hierarchy.'}
        </p>
      </div>

      {/* Primary Manager */}
      <div className="space-y-1.5">
        <label htmlFor="dept-manager" className="text-sm font-medium text-ink">
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
              placeholder="None"
              onlyActive={true}
            />
          )}
        />
        <p className="text-[11px] text-ink-muted">
          Select the primary manager who leads and is accountable for this department.
        </p>
        {errors.primary_manager_id && (
          <p className="text-xs text-red-500">{errors.primary_manager_id.message}</p>
        )}
      </div>

      {/* Secondary Managers */}
      <div className="space-y-1.5">
        <label htmlFor="dept-secondary-managers" className="text-sm font-medium text-ink">
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
              placeholder="Select secondary managers..."
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
        values={customFieldValues}
        onChange={handleCustomFieldChange}
        errors={customFieldErrors}
        disabled={isSubmitting}
      />

      {/* Hidden submit — triggered by modal footer */}
      <button type="submit" className="hidden" aria-hidden="true" />
    </form>
  );
};

