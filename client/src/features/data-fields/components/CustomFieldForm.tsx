// src/features/data-fields/components/CustomFieldForm.tsx
import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { CustomField, FieldType, TargetObject } from '@/types';
import { cn } from '@/utils/cn';
import { Plus, X } from 'lucide-react';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100).regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers, and underscores only'),
  field_type: z.enum(['text', 'number', 'date', 'select', 'multi_select', 'checkbox', 'textarea']),
  target_object: z.enum(['user', 'department', 'policy']),
  label: z.string().min(1, 'Label is required').max(150),
  placeholder: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  required: z.boolean().default(false),
  select_options: z.array(z.string().min(1)).optional().nullable(),
  visibility: z.enum(['all', 'admin_only', 'role_specific']).default('all'),
});

export type CustomFieldFormData = z.infer<typeof schema>;

interface CustomFieldFormProps {
  initialData?: CustomField;
  onSubmit: (data: CustomFieldFormData) => void;
  isSubmitting?: boolean;
  fixedTargetObject?: TargetObject;
}

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown (Single Select)' },
  { value: 'multi_select', label: 'Dropdown (Multi Select)' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'textarea', label: 'Text Area' },
];

const VISIBILITY_OPTIONS: { value: 'all' | 'admin_only' | 'role_specific'; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'admin_only', label: 'Admins Only' },
  { value: 'role_specific', label: 'Specific Roles' },
];

const inputClass = (hasError?: boolean) =>
  cn(
    'w-full h-9 px-3 text-sm rounded-md border bg-white text-ink',
    'placeholder:text-ink-muted transition-all duration-150',
    'focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/30',
    'disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed',
    hasError ? 'border-red-400 focus:border-red-400 focus:ring-red-300/30' : 'border-line'
  );

/**
 * CustomFieldForm Component
 * Create/edit form for custom fields with full Zod validation.
 * Used on: DataFieldsPage (field builder).
 */
export const CustomFieldForm: React.FC<CustomFieldFormProps> = ({
  initialData,
  onSubmit,
  isSubmitting = false,
  fixedTargetObject,
}) => {
  const {
    register,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CustomFieldFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialData?.name ?? '',
      field_type: initialData?.field_type ?? 'text',
      target_object: initialData?.target_object ?? fixedTargetObject ?? 'user',
      label: initialData?.label ?? '',
      placeholder: initialData?.placeholder ?? '',
      description: initialData?.description ?? '',
      required: initialData?.required ?? false,
      select_options: initialData?.select_options ?? [],
      visibility: initialData?.visibility ?? 'all',
    },
  });

  // Sync internal form state when initialData changes
  React.useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name ?? '',
        field_type: initialData.field_type ?? 'text',
        target_object: initialData.target_object ?? fixedTargetObject ?? 'user',
        label: initialData.label ?? '',
        placeholder: initialData.placeholder ?? '',
        description: initialData.description ?? '',
        required: initialData.required ?? false,
        select_options: initialData.select_options ?? [],
        visibility: initialData.visibility ?? 'all',
      });
    }
  }, [initialData, reset, fixedTargetObject]);

  const fieldType = watch('field_type');
  const selectOptions = watch('select_options') || [];
  const isSelectField = fieldType === 'select' || fieldType === 'multi_select';

  const addOption = () => {
    setValue('select_options', [...selectOptions, '']);
  };

  const removeOption = (index: number) => {
    setValue('select_options', selectOptions.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...selectOptions];
    newOptions[index] = value;
    setValue('select_options', newOptions);
  };

  return (
    <form id="custom-field-form" onSubmit={(e) => { e.preventDefault(); }} className="space-y-5" noValidate>
      {/* Field Name (internal identifier) */}
      <div className="space-y-1.5">
        <label htmlFor="cf-name" className="text-sm font-medium text-ink">
          Field Name <span className="text-red-500">*</span>
        </label>
        <input
          id="cf-name"
          {...register('name')}
          placeholder="e.g. emergency_contact, cost_center"
          disabled={isSubmitting}
          className={inputClass(!!errors.name)}
        />
        {errors.name && <p className="text-xs text-error">{errors.name.message}</p>}
        <p className="text-xs text-ink-secondary">Internal identifier (lowercase, numbers, underscores only)</p>
      </div>

      {/* Display Label */}
      <div className="space-y-1.5">
        <label htmlFor="cf-label" className="text-sm font-medium text-ink">
          Display Label <span className="text-red-500">*</span>
        </label>
        <input
          id="cf-label"
          {...register('label')}
          placeholder="e.g. Emergency Contact, Cost Center"
          disabled={isSubmitting}
          className={inputClass(!!errors.label)}
        />
        {errors.label && <p className="text-xs text-error">{errors.label.message}</p>}
      </div>

      {/* Field Type */}
      <div className="space-y-1.5">
        <label htmlFor="cf-type" className="text-sm font-medium text-ink">
          Field Type <span className="text-red-500">*</span>
        </label>
        <Controller
          name="field_type"
          control={control}
          render={({ field }) => (
            <select
              id="cf-type"
              {...field}
              disabled={isSubmitting || !!initialData} // Cannot change after creation
              className={inputClass(!!errors.field_type)}
            >
              {FIELD_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
        />
        {errors.field_type && <p className="text-xs text-error">{errors.field_type.message}</p>}
        {initialData && (
          <p className="text-xs text-warning">Field type cannot be changed after creation.</p>
        )}
      </div>

      {/* Select Options (only for select/multi_select) */}
      {isSelectField && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink">
            Select Options <span className="text-red-500">*</span>
          </label>
          <div className="space-y-2">
            {selectOptions.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={option}
                  onChange={(e) => updateOption(index, e.target.value)}
                  placeholder={`Option ${index + 1}`}
                  disabled={isSubmitting}
                  className="flex-1 h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  disabled={isSubmitting}
                  className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-red-50 text-error transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addOption}
              disabled={isSubmitting}
              className="text-xs text-accent hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add Option
            </button>
          </div>
        </div>
      )}

      {/* Placeholder */}
      <div className="space-y-1.5">
        <label htmlFor="cf-placeholder" className="text-sm font-medium text-ink">
          Placeholder Text
        </label>
        <input
          id="cf-placeholder"
          {...register('placeholder')}
          placeholder="e.g. Enter emergency contact name"
          disabled={isSubmitting}
          className={inputClass(!!errors.placeholder)}
        />
        {errors.placeholder && <p className="text-xs text-error">{errors.placeholder.message}</p>}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label htmlFor="cf-description" className="text-sm font-medium text-ink">
          Help Text
        </label>
        <input
          id="cf-description"
          {...register('description')}
          placeholder="Brief description shown below the field"
          disabled={isSubmitting}
          className={inputClass(!!errors.description)}
        />
        {errors.description && <p className="text-xs text-error">{errors.description.message}</p>}
      </div>

      {/* Required Checkbox */}
      <div className="flex items-center gap-2">
        <input
          id="cf-required"
          type="checkbox"
          {...register('required')}
          disabled={isSubmitting}
          className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
        />
        <label htmlFor="cf-required" className="text-sm font-medium text-ink">
          Required field
        </label>
      </div>

      {/* Visibility */}
      <div className="space-y-1.5">
        <label htmlFor="cf-visibility" className="text-sm font-medium text-ink">
          Visibility
        </label>
        <Controller
          name="visibility"
          control={control}
          render={({ field }) => (
            <select
              id="cf-visibility"
              {...field}
              disabled={isSubmitting}
              className={inputClass(!!errors.visibility)}
            >
              {VISIBILITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
        />
        {errors.visibility && <p className="text-xs text-error">{errors.visibility.message}</p>}
      </div>

      {/* Hidden submit button for modal footer trigger */}
      <button type="submit" id="custom-field-form-submit" className="hidden" />
    </form>
  );
};
