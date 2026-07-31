// src/features/data-fields/components/CustomFieldForm.tsx
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { CustomField, FieldType, TargetObject } from '@/types';
import { cn } from '@/utils/cn';
import { Plus, X, ChevronDown } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100).regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers, and underscores only'),
  field_type: z.enum(['text', 'number', 'date', 'boolean', 'select', 'multi_select', 'url', 'email', 'phone']),
  target_object: z.enum(['user', 'department', 'policy']),
  label: z.string().min(1, 'Label is required').max(150),
  placeholder: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  required: z.boolean().default(false),
  default_value: z.string().optional().nullable(),
  select_options: z.array(z.string().min(1)).optional().nullable(),
  validation_rules: z.object({
    required: z.boolean().optional(),
    min_length: z.number().int().min(0).optional().nullable(),
    max_length: z.number().int().min(1).optional().nullable(),
    min: z.number().optional().nullable(),
    max: z.number().optional().nullable(),
    pattern: z.string().optional().nullable(),
    pattern_message: z.string().optional().nullable(),
  }).optional().nullable(),
  visibility: z.enum(['all', 'admin_only', 'role_specific']).default('all'),
  visible_roles: z.array(z.string()).optional().nullable(),
  edit_visibility: z.enum(['all', 'admin_only', 'role_specific']).default('all'),
  edit_visible_roles: z.array(z.string()).optional().nullable(),
  conditional_logic: z.array(z.object({
    field_slug: z.string().min(1),
    operator: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty']),
    value: z.any(),
    action: z.enum(['show', 'hide', 'require', 'optional']),
  })).optional().nullable(),
  field_dependencies: z.array(z.string()).optional().nullable(),
});

export type CustomFieldFormData = z.input<typeof schema>;

interface CustomFieldFormProps {
  initialData?: CustomField;
  onSubmit: (data: CustomFieldFormData) => void;
  isSubmitting?: boolean;
  fixedTargetObject?: TargetObject;
  availableFields?: CustomField[];
}

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Boolean (Yes/No)' },
  { value: 'select', label: 'Dropdown (Single Select)' },
  { value: 'multi_select', label: 'Dropdown (Multi Select)' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
];

const VISIBILITY_OPTIONS: { value: 'all' | 'admin_only' | 'role_specific'; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'admin_only', label: 'Admins Only' },
  { value: 'role_specific', label: 'Specific Roles' },
];

const CONDITIONAL_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
  { value: 'is_empty', label: 'Is empty' },
  { value: 'is_not_empty', label: 'Is not empty' },
];

const CONDITIONAL_ACTIONS = [
  { value: 'show', label: 'Show' },
  { value: 'hide', label: 'Hide' },
  { value: 'require', label: 'Make required' },
  { value: 'optional', label: 'Make optional' },
];

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
      default_value: initialData?.default_value ?? '',
      select_options: initialData?.select_options ?? [],
      validation_rules: initialData?.validation_rules ?? null,
      visibility: initialData?.visibility ?? 'all',
      visible_roles: initialData?.visible_roles?.map((r) => typeof r === 'string' ? r : r._id) ?? [],
      edit_visibility: initialData?.edit_visibility ?? 'all',
      edit_visible_roles: initialData?.edit_visible_roles?.map((r) => typeof r === 'string' ? r : r._id) ?? [],
       conditional_logic: initialData?.conditional_logic ?? [],
      field_dependencies: (initialData?.field_dependencies ?? []).map((d) => typeof d === 'string' ? d : d._id),
    },
  });

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
        default_value: initialData.default_value ?? '',
        select_options: initialData.select_options ?? [],
        validation_rules: initialData.validation_rules ?? null,
        visibility: initialData.visibility ?? 'all',
        visible_roles: initialData.visible_roles?.map((r) => typeof r === 'string' ? r : r._id) ?? [],
        edit_visibility: initialData.edit_visibility ?? 'all',
        edit_visible_roles: initialData.edit_visible_roles?.map((r) => typeof r === 'string' ? r : r._id) ?? [],
        conditional_logic: initialData.conditional_logic ?? [],
        field_dependencies: (initialData?.field_dependencies ?? []).map((d) => typeof d === 'string' ? d : d._id),
      });
    }
  }, [initialData, reset, fixedTargetObject]);

  const fieldType = watch('field_type');
  const selectOptions = watch('select_options') || [];
  const conditionalLogic = watch('conditional_logic') || [];
  const fieldDependencies = watch('field_dependencies') || [];
  const visibility = watch('visibility');
  const editVisibility = watch('edit_visibility');
  const isSelectField = fieldType === 'select' || fieldType === 'multi_select';
  const showValidationRules = ['text', 'number', 'email', 'phone', 'url'].includes(fieldType);

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

  const addConditionalRule = () => {
    setValue('conditional_logic', [
      ...conditionalLogic,
      { field_slug: '', operator: 'equals', value: '', action: 'show' },
    ]);
  };

  const toggleFieldDependency = (fieldId: string) => {
    setValue('field_dependencies', fieldDependencies.includes(fieldId)
      ? fieldDependencies.filter((id) => id !== fieldId)
      : [...fieldDependencies, fieldId],
    );
  };

  const removeConditionalRule = (index: number) => {
    setValue('conditional_logic', conditionalLogic.filter((_, i) => i !== index));
  };

  const updateConditionalRule = (index: number, field: string, value: string) => {
    const updated = conditionalLogic.map((rule, i) =>
      i === index ? { ...rule, [field]: value } : rule
    );
    setValue('conditional_logic', updated as any);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = watch();
    const cleaned: Record<string, unknown> = { ...formData };
    if (isSelectField && (!cleaned.select_options || (cleaned.select_options as any[]).length === 0)) {
      cleaned.select_options = null;
    }
    if (!showValidationRules) {
      cleaned.validation_rules = null;
    }
    if (!cleaned.conditional_logic || (cleaned.conditional_logic as any[]).length === 0) {
      cleaned.conditional_logic = null;
    }
    if (cleaned.visibility !== 'role_specific') {
      cleaned.visible_roles = null;
    }
     if (cleaned.edit_visibility !== 'role_specific') {
      cleaned.edit_visible_roles = null;
    }
    if (!cleaned.field_dependencies || (cleaned.field_dependencies as any[]).length === 0) {
      cleaned.field_dependencies = null;
    }
    onSubmit(cleaned as unknown as CustomFieldFormData);
  };

  return (
    <form id="custom-field-form" onSubmit={handleFormSubmit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="cf-name" className="text-sm font-medium text-ink">
          Field Name <span className="text-error">*</span>
        </label>
        <input
          id="cf-name"
          {...register('name')}
          placeholder="e.g. emergency_contact, cost_center"
          disabled={isSubmitting || initialData?.is_system_field}
          className={inputClass(!!errors.name)}
        />
        {errors.name && <p className="text-xs text-error">{errors.name.message}</p>}
        <p className="text-xs text-ink-muted">Internal identifier (lowercase, numbers, underscores only)</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="cf-label" className="text-sm font-medium text-ink">
          Display Label <span className="text-error">*</span>
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

      <div className="space-y-1.5">
        <label htmlFor="cf-type" className="text-sm font-medium text-ink">
          Field Type <span className="text-error">*</span>
        </label>
        <Controller
          name="field_type"
          control={control}
          render={({ field }) => (
            <select
              id="cf-type"
              {...field}
              disabled={isSubmitting || !!initialData}
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
          <p className="text-xs text-amber-600">Field type cannot be changed after creation.</p>
        )}
      </div>

      {isSelectField && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink">
            Select Options <span className="text-error">*</span>
          </label>
          <div className="space-y-2">
            {selectOptions.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={option}
                  onChange={(e) => updateOption(index, e.target.value)}
                  placeholder={`Option ${index + 1}`}
                  disabled={isSubmitting}
                  className="flex-1 h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  disabled={isSubmitting}
                  className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-red-50 text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addOption}
              disabled={isSubmitting}
              className="text-xs text-accent font-medium hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add Option
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="cf-default" className="text-sm font-medium text-ink">
          Default Value
        </label>
        {fieldType === 'boolean' ? (
          <Controller
            name="default_value"
            control={control}
            render={({ field }) => (
              <select
                id="cf-default"
                value={field.value || ''}
                onChange={(e) => field.onChange(e.target.value || null)}
                disabled={isSubmitting}
                className={inputClass()}
              >
                <option value="">No default</option>
                <option value="true">Yes / True</option>
                <option value="false">No / False</option>
              </select>
            )}
          />
        ) : fieldType === 'date' ? (
          <input
            id="cf-default"
            type="date"
            {...register('default_value')}
            disabled={isSubmitting}
            className={inputClass()}
          />
        ) : (
          <input
            id="cf-default"
            {...register('default_value')}
            placeholder="Default value for new records"
            disabled={isSubmitting}
            className={inputClass()}
          />
        )}
        <p className="text-xs text-ink-muted">Value applied automatically to new records</p>
      </div>

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
      </div>

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
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg border border-line bg-surface-alt">
        <div className="space-y-0.5">
          <label htmlFor="cf-required" className="text-sm font-medium text-ink cursor-pointer">
            Required field
          </label>
          <p className="text-xs text-ink-muted">Force users to fill this field before saving</p>
        </div>
        <Controller
          name="required"
          control={control}
          render={({ field }) => (
            <Switch
              id="cf-required"
              checked={field.value}
              onCheckedChange={field.onChange}
              disabled={isSubmitting}
            />
          )}
        />
      </div>

      {showValidationRules && (
        <details className="rounded-lg border border-line bg-white">
          <summary className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-ink cursor-pointer hover:bg-surface-alt rounded-lg transition-colors">
            <ChevronDown className="w-3.5 h-3.5 text-ink-muted" />
            Validation Rules
          </summary>
          <div className="px-3 pb-3 space-y-3 border-t border-line pt-3 mt-0">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-secondary">Min Length</label>
                <input
                  type="number"
                  {...register('validation_rules.min_length', { valueAsNumber: true })}
                  placeholder="0"
                  disabled={isSubmitting}
                  className={inputClass()}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-secondary">Max Length</label>
                <input
                  type="number"
                  {...register('validation_rules.max_length', { valueAsNumber: true })}
                  placeholder="255"
                  disabled={isSubmitting}
                  className={inputClass()}
                />
              </div>
            </div>

            {fieldType === 'number' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-secondary">Min Value</label>
                  <input
                    type="number"
                    {...register('validation_rules.min', { valueAsNumber: true })}
                    placeholder="0"
                    disabled={isSubmitting}
                    className={inputClass()}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-secondary">Max Value</label>
                  <input
                    type="number"
                    {...register('validation_rules.max', { valueAsNumber: true })}
                    placeholder="999999"
                    disabled={isSubmitting}
                    className={inputClass()}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-ink-secondary">Regex Pattern</label>
              <input
                {...register('validation_rules.pattern')}
                placeholder="e.g. ^[A-Z]{3}\\d{4}$"
                disabled={isSubmitting}
                className={inputClass()}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-ink-secondary">Pattern Error Message</label>
              <input
                {...register('validation_rules.pattern_message')}
                placeholder="e.g. Must be 3 uppercase letters followed by 4 digits"
                disabled={isSubmitting}
                className={inputClass()}
              />
            </div>
          </div>
        </details>
      )}

      <details className="rounded-lg border border-line bg-white">
        <summary className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-ink cursor-pointer hover:bg-surface-alt rounded-lg transition-colors">
          <ChevronDown className="w-3.5 h-3.5 text-ink-muted" />
          Conditional Logic
        </summary>
        <div className="px-3 pb-3 space-y-3 border-t border-line pt-3 mt-0">
          {conditionalLogic.length === 0 && (
            <p className="text-xs text-ink-muted">No conditional rules defined. This field will always be visible.</p>
          )}
          {conditionalLogic.map((_rule, index) => (
            <div key={index} className="flex items-start gap-2 p-2 rounded-md bg-surface-alt">
              <div className="flex-1 grid grid-cols-4 gap-2">
                <div className="space-y-0.5">
                  <label className="text-[10px] font-medium text-ink-muted">Field</label>
                  <input
                    value={(_rule as any).field_slug || ''}
                    onChange={(e) => updateConditionalRule(index, 'field_slug', e.target.value)}
                    placeholder="field_slug"
                    className="w-full h-8 px-2 text-xs rounded border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:border-primary/50"
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] font-medium text-ink-muted">Operator</label>
                  <select
                    value={(_rule as any).operator || 'equals'}
                    onChange={(e) => updateConditionalRule(index, 'operator', e.target.value)}
                    className="w-full h-8 px-2 text-xs rounded border border-line bg-white text-ink focus:outline-none focus:ring-1 focus:border-primary/50"
                  >
                    {CONDITIONAL_OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] font-medium text-ink-muted">Value</label>
                  <input
                    value={String((_rule as any).value || '')}
                    onChange={(e) => updateConditionalRule(index, 'value', e.target.value)}
                    placeholder="Value"
                    className="w-full h-8 px-2 text-xs rounded border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:border-primary/50"
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] font-medium text-ink-muted">Action</label>
                  <select
                    value={(_rule as any).action || 'show'}
                    onChange={(e) => updateConditionalRule(index, 'action', e.target.value)}
                    className="w-full h-8 px-2 text-xs rounded border border-line bg-white text-ink focus:outline-none focus:ring-1 focus:border-primary/50"
                  >
                    {CONDITIONAL_ACTIONS.map((act) => (
                      <option key={act.value} value={act.value}>{act.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeConditionalRule(index)}
                className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-red-50 text-red-500 transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addConditionalRule}
            disabled={isSubmitting}
            className="text-xs text-accent font-medium hover:underline flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Add Condition
          </button>
        </div>
    </details>

    {availableFields && availableFields.length > 0 && (
      <div className="space-y-2">
        <label className="text-sm font-medium text-ink">
          Field Dependencies
        </label>
        <p className="text-xs text-ink-muted">Select fields that must exist before this field can be used.</p>
        <div className="border border-line rounded-lg divide-y divide-line max-h-60 overflow-y-auto bg-white">
          {availableFields
            .filter((f) => !f.is_system_field && f._id !== initialData?._id && f.target_object === fixedTargetObject)
            .map((field) => {
              const fieldId = typeof field._id === 'string' ? field._id : (field._id as any)._id;
              return (
                <label key={fieldId} className="flex items-center gap-3 p-2 hover:bg-surface-alt cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fieldDependencies.includes(fieldId)}
                    onChange={() => toggleFieldDependency(fieldId)}
                    disabled={isSubmitting}
                    className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-ink">{field.label}</span>
                    <span className="ml-2 text-[10px] font-mono text-ink-muted">{field.name}</span>
                  </div>
                </label>
              );
            })}
        </div>

        {fieldDependencies.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {fieldDependencies.map((depId) => {
              const depField = availableFields.find((f) => {
                const fid = typeof f._id === 'string' ? f._id : (f._id as any)._id;
                return fid === depId;
              });
              return (
                <span
                  key={depId}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-primary-light/20 text-primary rounded-full"
                >
                  {depField?.label || depId}
                  <button
                    type="button"
                    onClick={() => toggleFieldDependency(depId)}
                    className="hover:text-primary/70"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>
    )}

    <div className="space-y-1.5">
      <label htmlFor="cf-visibility" className="text-sm font-medium text-ink">
        View Permission
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
        <p className="text-xs text-ink-muted">Who can see this field in forms and profiles</p>
        {visibility === 'role_specific' && (
          <input
            {...register('visible_roles')}
            placeholder="Role IDs (comma-separated)"
            className={inputClass()}
          />
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="cf-edit-visibility" className="text-sm font-medium text-ink">
          Edit Permission
        </label>
        <Controller
          name="edit_visibility"
          control={control}
          render={({ field }) => (
            <select
              id="cf-edit-visibility"
              {...field}
              disabled={isSubmitting}
              className={inputClass()}
            >
              {VISIBILITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
        />
        <p className="text-xs text-ink-muted">Who can edit this field value</p>
        {editVisibility === 'role_specific' && (
          <input
            {...register('edit_visible_roles')}
            placeholder="Role IDs (comma-separated)"
            className={inputClass()}
          />
        )}
      </div>

      <button type="submit" id="custom-field-form-submit" className="hidden" />
    </form>
  );
};
