// src/features/data-fields/components/DynamicCustomFields.tsx
import React, { useMemo } from 'react';
import type { CustomField, ConditionalRule } from '@/types';
import { cn } from '@/utils/cn';

interface DynamicCustomFieldsProps {
  fields: CustomField[];
  values: Record<string, unknown>;
  onChange: (slug: string, value: unknown) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  readOnlySlugs?: string[];
}

const inputClass = (hasError?: boolean) =>
  cn(
    'w-full h-9 px-3 text-sm rounded-md border bg-white text-ink',
    'placeholder:text-ink-muted transition-all duration-150',
    'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
    'disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed',
    hasError
      ? 'border-error focus:border-error focus:ring-error/30'
      : 'border-line hover:border-line-strong'
  );

export function evaluateCondition(rule: ConditionalRule, allValues: Record<string, unknown>): boolean {
  const targetValue = allValues[rule.field_slug];

  switch (rule.operator) {
    case 'equals':
      return String(targetValue) === String(rule.value);
    case 'not_equals':
      return String(targetValue) !== String(rule.value);
    case 'contains':
      return String(targetValue).includes(String(rule.value));
    case 'greater_than':
      return Number(targetValue) > Number(rule.value);
    case 'less_than':
      return Number(targetValue) < Number(rule.value);
    case 'is_empty':
      return targetValue === null || targetValue === undefined || targetValue === '' || (Array.isArray(targetValue) && targetValue.length === 0);
    case 'is_not_empty':
      return targetValue !== null && targetValue !== undefined && targetValue !== '' && !(Array.isArray(targetValue) && targetValue.length === 0);
    default:
      return true;
  }
}

export function isFieldVisible(field: CustomField, allValues: Record<string, unknown>): boolean {
  if (!field.conditional_logic || field.conditional_logic.length === 0) return true;

  return field.conditional_logic.every((rule) => {
    const conditionMet = evaluateCondition(rule, allValues);
    if (rule.action === 'show') return conditionMet;
    if (rule.action === 'hide') return !conditionMet;
    return true;
  });
}

export function isFieldRequired(field: CustomField, allValues: Record<string, unknown>): boolean {
  if (field.conditional_logic && field.conditional_logic.length > 0) {
    const isConditionallyOptional = field.conditional_logic.some((rule) => {
      if (rule.action !== 'optional') return false;
      return evaluateCondition(rule, allValues);
    });
    if (isConditionallyOptional) return false;

    const isConditionallyRequired = field.conditional_logic.some((rule) => {
      if (rule.action !== 'require') return false;
      return evaluateCondition(rule, allValues);
    });
    if (isConditionallyRequired) return true;
  }

  return field.required;
}

function validateField(field: CustomField, value: unknown): string | null {
  const isRequired = field.required || field.validation_rules?.required;

  if (value === null || value === undefined || value === '') {
    if (isRequired) return `${field.label} is required`;
    return null;
  }

  const rules = field.validation_rules;
  if (!rules) return null;

  if (field.field_type === 'number' || field.field_type === 'text' || field.field_type === 'email' || field.field_type === 'url' || field.field_type === 'phone') {
    const strVal = String(value);
    if (rules.min_length !== undefined && strVal.length < rules.min_length) {
      return `${field.label} must be at least ${rules.min_length} characters`;
    }
    if (rules.max_length !== undefined && strVal.length > rules.max_length) {
      return `${field.label} must be at most ${rules.max_length} characters`;
    }
  }

  if (field.field_type === 'number') {
    const numVal = Number(value);
    if (isNaN(numVal)) return `${field.label} must be a valid number`;
    if (rules.min !== undefined && numVal < rules.min) {
      return `${field.label} must be at least ${rules.min}`;
    }
    if (rules.max !== undefined && numVal > rules.max) {
      return `${field.label} must be at most ${rules.max}`;
    }
  }

  if (field.field_type === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(value))) return `${field.label} must be a valid email address`;
  }

  if (field.field_type === 'url') {
    try {
      new URL(String(value));
    } catch {
      return `${field.label} must be a valid URL`;
    }
  }

  if (field.field_type === 'phone') {
    const phoneRegex = /^[+]?[\d\s\-().]{7,20}$/;
    if (!phoneRegex.test(String(value))) return `${field.label} must be a valid phone number`;
  }

  if (rules.pattern) {
    try {
      const regex = new RegExp(rules.pattern);
      if (!regex.test(String(value))) {
        return rules.pattern_message || `${field.label} has an invalid format`;
      }
    } catch {
      return `${field.label} has an invalid validation pattern`;
    }
  }

  return null;
}

export const DynamicCustomFields: React.FC<DynamicCustomFieldsProps> = ({
  fields,
  values,
  onChange,
  errors = {},
  disabled = false,
  readOnlySlugs = [],
}) => {
  const visibleFields = useMemo(
    () => fields.filter((f) => isFieldVisible(f, values)),
    [fields, values]
  );

  if (!visibleFields?.length) return null;

  return (
    <div className="space-y-4 pt-4 border-t border-line mt-4">
      <h3 className="text-base font-semibold text-ink">Custom Fields</h3>
      {visibleFields.map((field) => {
        const fieldRequired = isFieldRequired(field, values);
        const computedError = errors[field.slug] || validateField(field, values[field.slug]) || undefined;
        const isReadOnly = readOnlySlugs.includes(field.slug);

        return (
          <div key={field._id} className="space-y-1.5">
            <CustomFieldInput
              field={field}
              value={values[field.slug] ?? (field.default_value ?? null)}
              onChange={(value) => onChange(field.slug, value)}
              error={computedError}
              disabled={disabled || isReadOnly}
              isRequired={fieldRequired}
            />
            {isReadOnly && (
              <p className="text-xs text-ink-muted">You have view-only access to this field.</p>
            )}
          </div>
        );
      })}
    </div>
  );
};

interface CustomFieldInputProps {
  field: CustomField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled: boolean;
  isRequired: boolean;
}

const CustomFieldInput: React.FC<CustomFieldInputProps> = ({
  field,
  value,
  onChange,
  error,
  disabled,
  isRequired,
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

      case 'url':
        return (
          <input
            type="url"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? 'https://'}
            disabled={disabled}
            className={inputClass(!!error)}
          />
        );

      case 'email':
        return (
          <input
            type="email"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? 'email@example.com'}
            disabled={disabled}
            className={inputClass(!!error)}
          />
        );

      case 'phone':
        return (
          <input
            type="tel"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? '+1 (555) 000-0000'}
            disabled={disabled}
            className={inputClass(!!error)}
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

      case 'boolean':
        return (
          <div className="flex items-center gap-3">
            <select
              value={value === null || value === undefined ? '' : String(value)}
              onChange={(e) => {
                if (e.target.value === '') onChange(null);
                else onChange(e.target.value === 'true');
              }}
              disabled={disabled}
              className={cn(inputClass(!!error), 'max-w-[200px]')}
            >
              <option value="">Select...</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
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

      default:
        return null;
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-ink">
        {field.label}
        {isRequired && <span className="text-error ml-1">*</span>}
      </label>
      {renderInput()}
      {field.description && (
        <p className="text-xs text-ink-muted">{field.description}</p>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
};

export { validateField as validateCustomField };
