// src/features/organization/components/DepartmentForm.tsx
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserSelect } from '@/components/ui/UserSelect';
import type { Department } from '@/types';
import { cn } from '@/utils/cn';

const schema = z.object({
  name: z.string().min(1, 'Department name is required').max(100, 'Name too long'),
  type: z.enum(['business_unit', 'division', 'department', 'team', 'cost_center']),
  parent_id: z.string().optional().nullable(),
  primary_manager_id: z
    .string()
    .optional()
    .nullable(),
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
  onSubmit: (data: DepartmentFormData) => void;
  departments: Department[];
  isSubmitting?: boolean;
}

const DEPT_TYPE_OPTIONS: { value: Department['type']; label: string }[] = [
  { value: 'business_unit', label: 'Business Unit' },
  { value: 'division', label: 'Division' },
  { value: 'department', label: 'Department' },
  { value: 'team', label: 'Team' },
  { value: 'cost_center', label: 'Cost Center' },
];

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
 * DepartmentForm Component
 * Create/edit form for departments with full Zod validation.
 * Submits via a hidden button (id="department-form") triggered from the modal footer.
 * Used on: OrganizationPage (create + edit modal).
 */
export const DepartmentForm: React.FC<DepartmentFormProps> = ({
  initialData,
  onSubmit,
  departments,
  isSubmitting = false,
}) => {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<DepartmentFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialData?.name ?? '',
      type: initialData?.type ?? 'department',
      parent_id: typeof initialData?.parent_id === 'object' ? (initialData.parent_id as any)?._id : initialData?.parent_id ?? '',
      primary_manager_id: typeof initialData?.primary_manager_id === 'object' ? (initialData.primary_manager_id as any)?._id : (initialData?.primary_manager_id as any) ?? '',
    },
  });

  const selectedType = watch('type');
  const availableParents = departments.filter((d) => d._id !== initialData?._id);

  return (
    <form id="department-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="dept-name" className="text-sm font-medium text-ink">
          Department Name <span className="text-red-500">*</span>
        </label>
        <input
          id="dept-name"
          {...register('name')}
          placeholder="e.g. Engineering"
          disabled={isSubmitting}
          className={inputClass(!!errors.name)}
        />
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
          className={inputClass(!!errors.type)}
        >
          {DEPT_TYPE_OPTIONS.map((opt) => (
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
          className={inputClass(!!errors.parent_id)}
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
            />
          )}
        />
        <p className="text-[11px] text-ink-muted">
          Select the manager for this department.
        </p>
        {errors.primary_manager_id && (
          <p className="text-xs text-red-500">{errors.primary_manager_id.message}</p>
        )}
      </div>

      {/* Hidden submit — triggered by modal footer */}
      <button type="submit" className="hidden" aria-hidden="true" />
    </form>
  );
};
