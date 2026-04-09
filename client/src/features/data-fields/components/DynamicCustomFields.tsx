// src/features/data-fields/components/DynamicCustomFields.tsx
import React from 'react';
import type { CustomField, TargetObject } from '@/types';
import { cn } from '@/utils/cn';

interface DynamicCustomFieldsProps {
  fields: CustomField[];
  values: Record<string, unknown>;
  onChange: (slug: string, value: unknown) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}

const inputClass = (hasError?: boolean) =>
  cn(
    'w-full h-9 px-3 text-sm rounded-md border bg-white text-ink',
    'placeholder:text-ink-muted transition-all duration-150',
    'focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/30',
    'disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed',
    hasError ? 'border-red-400 focus:border-red-400 focus:ring-red-300/30' : 'border-line'
  );

/**
 * DynamicCustomFields Component
 * Renders custom field inputs dynamically based on field definitions.
 * Used in: UserForm, DepartmentForm, and other forms that support custom fields.
 *
 * @param fields - Array of custom field definitions
 * @param values - Current field values (keyed by slug)
 * @param onChange - Callback when a field value changes
 * @param errors - Validation errors (keyed by slug)
 * @param disabled - Whether fields should be disabled
 */
export const DynamicCustomFields: React.FC<DynamicCustomFieldsProps> = ({
  fields,
  values,
  onChange,
  errors = {},
  disabled = false,
}) => {
  if (!fields?.length) return null;

  return (
    <div className="space-y-4 pt-4 border-t border-line mt-4">
      <h3 className="text-base font-semibold text-ink">Custom Fields</h3>
      {fields.map((field) => (
        <CustomFieldInput
          key={field._id}
          field={field}
          value={values[field.slug] ?? null}
          onChange={(value) => onChange(field.slug, value)}
          error={errors[field.slug]}
          disabled={disabled}
        />
      ))}
    </div>
  );
};

// ── Individual Field Renderer ────────────────────────────────────────────────

interface CustomFieldInputProps {
  field: CustomField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled: boolean;
}

const CustomFieldInput: React.FC<CustomFieldInputProps> = ({
  field,
  value,
  onChange,
  error,
  disabled,
}) => {
  const renderInput = () => {
    switch (field.field_type) {
      case 'text':
      case 'number':
        return (
          <input
            type={field.field_type}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
            disabled={disabled}
            className={inputClass(!!error)}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
            disabled={disabled}
            rows={3}
            className={cn(inputClass(!!error), 'resize-y min-h-[60px]')}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={inputClass(!!error)}
          />
        );

      case 'select':
        return (
          <select
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={inputClass(!!error)}
          >
            <option value="">Select...</option>
            {field.select_options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case 'multi_select':
        return (
          <select
            multiple
            value={Array.isArray(value) ? value : []}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value);
              onChange(selected);
            }}
            disabled={disabled}
            className={cn(inputClass(!!error), 'h-24')}
          >
            {field.select_options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={(value as boolean) ?? false}
              onChange={(e) => onChange(e.target.checked)}
              disabled={disabled}
              className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
            />
            <span className="text-sm text-ink-secondary">{field.label}</span>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-1.5">
      {field.field_type !== 'checkbox' && (
        <label className="text-sm font-medium text-ink">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {renderInput()}
      {field.description && field.field_type !== 'checkbox' && (
        <p className="text-xs text-ink-secondary">{field.description}</p>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
};
