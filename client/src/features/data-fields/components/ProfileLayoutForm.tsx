// src/features/data-fields/components/ProfileLayoutForm.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { CustomField, TargetObject } from '@/types';
import { cn } from '@/utils/cn';
import { Star, Eye, EyeOff } from 'lucide-react';

const LayoutFieldSchema = z.object({
  field_id: z.string(),
  display_order: z.number().int().min(0),
  is_visible: z.boolean(),
  is_editable: z.boolean(),
});

const schema = z.object({
  name: z.string().min(1, 'Layout name is required').max(100),
  target_object: z.enum(['user', 'department', 'policy', 'team', 'location', 'holiday', 'holiday_calendar', 'work_schedule']),
  role_id: z.string().optional().nullable(),
  is_default: z.boolean().default(false),
  fields: z.array(LayoutFieldSchema).min(1, 'Select at least one field'),
});

export type ProfileLayoutFormData = z.input<typeof schema>;

export interface ProfileLayoutFormProps {
  availableFields: CustomField[];
  targetObject: TargetObject;
  onSubmit: (data: ProfileLayoutFormData) => void;
  isSubmitting?: boolean;
  initialData?: {
    name?: string;
    role_id?: string | { _id: string; name: string } | null;
    is_default?: boolean;
    fields?: Array<{
      field_id: string | { _id: string };
      display_order: number;
      is_visible: boolean;
      is_editable: boolean;
    }>;
  };
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

interface FieldConfig {
  display_order: number;
  is_visible: boolean;
  is_editable: boolean;
}

export const ProfileLayoutForm: React.FC<ProfileLayoutFormProps> = ({
  availableFields,
  targetObject,
  onSubmit,
  isSubmitting = false,
  initialData,
}) => {
  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string>>(new Set());
  const [fieldConfigs, setFieldConfigs] = useState<Record<string, FieldConfig>>({});

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ProfileLayoutFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialData?.name ?? '',
      target_object: targetObject,
      role_id: typeof initialData?.role_id === 'string'
        ? initialData.role_id
        : typeof initialData?.role_id === 'object' && initialData?.role_id
        ? initialData.role_id._id
        : '',
      is_default: initialData?.is_default ?? false,
      fields: [],
    },
  });

  // Initialize selected fields and configs from initialData (edit mode)
  useEffect(() => {
    if (initialData?.fields) {
      const ids = new Set<string>();
      const configs: Record<string, FieldConfig> = {};
      initialData.fields.forEach((f, index) => {
        const fieldId = typeof f.field_id === 'string' ? f.field_id : f.field_id._id;
        ids.add(fieldId);
        configs[fieldId] = {
          display_order: f.display_order ?? index,
          is_visible: f.is_visible ?? true,
          is_editable: f.is_editable ?? true,
        };
      });
      setSelectedFieldIds(ids);
      setFieldConfigs(configs);
    }
  }, [initialData]);

  // Keep target_object in sync with prop
  useEffect(() => {
    setValue('target_object', targetObject);
  }, [targetObject, setValue]);

  const getFieldId = (field: CustomField): string => {
    return field._id;
  };

  const toggleField = useCallback((fieldId: string) => {
    setSelectedFieldIds((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) {
        next.delete(fieldId);
        const { [fieldId]: _, ...rest } = fieldConfigs;
        setFieldConfigs(rest);
      } else {
        next.add(fieldId);
        setFieldConfigs((prevConfigs) => ({
          ...prevConfigs,
          [fieldId]: {
            display_order: next.size,
            is_visible: true,
            is_editable: true,
          },
        }));
      }
      return next;
    });
  }, [fieldConfigs]);

  const updateFieldConfig = useCallback((fieldId: string, key: keyof FieldConfig, value: boolean | number) => {
    setFieldConfigs((prev) => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        [key]: value,
      },
    }));
  }, []);

  // Sync order numbers when fields are toggled
  useEffect(() => {
    const sortedIds = Array.from(selectedFieldIds);
    let changed = false;
    const newConfigs: Record<string, FieldConfig> = {};
    sortedIds.forEach((id, index) => {
      const order = fieldConfigs[id]?.display_order ?? index;
      newConfigs[id] = { ...fieldConfigs[id], display_order: order };
      if (order !== index) changed = true;
    });
    if (changed) {
      setFieldConfigs(newConfigs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFieldIds.size]);

  const handleFormSubmit = (data: ProfileLayoutFormData) => {
    const fields = Array.from(selectedFieldIds).map((fieldId) => {
      const config = fieldConfigs[fieldId] || { display_order: 0, is_visible: true, is_editable: true };
      return {
        field_id: fieldId,
        display_order: config.display_order,
        is_visible: config.is_visible,
        is_editable: config.is_editable,
      };
    });

    const cleaned: ProfileLayoutFormData = {
      ...data,
      target_object: targetObject,
      role_id: data.role_id || null,
      fields,
    };

    onSubmit(cleaned);
  };

  const visibleFields = availableFields.filter((f) => f.is_active);

  return (
    <form
      id="profile-layout-form"
      onSubmit={handleSubmit(handleFormSubmit)}
      className="space-y-5"
      noValidate
    >
      <div className="space-y-1.5">
        <label htmlFor="pl-name" className="text-sm font-medium text-ink">
          Layout Name <span className="text-error">*</span>
        </label>
        <input
          id="pl-name"
          {...register('name')}
          placeholder="e.g. HR Admin Layout, IT Manager View"
          disabled={isSubmitting}
          className={inputClass(!!errors.name)}
        />
        {errors.name && <p className="text-xs text-error">{errors.name.message}</p>}
      </div>

      <input type="hidden" {...register('target_object')} value={targetObject} />

      <div className="space-y-1.5">
        <label htmlFor="pl-role" className="text-sm font-medium text-ink">
          Role (Optional)
        </label>
        <input
          id="pl-role"
          {...register('role_id')}
          placeholder="Role ID — leave empty for default layout"
          disabled={isSubmitting}
          className={inputClass()}
        />
        <p className="text-xs text-ink-muted">Assign this layout to a specific role. Leave empty for a default layout.</p>
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg border border-line bg-surface-alt">
        <div className="space-y-0.5">
          <label htmlFor="pl-default" className="text-sm font-medium text-ink cursor-pointer">
            Default layout
          </label>
          <p className="text-xs text-ink-muted">Applied to users without a role-specific layout</p>
        </div>
        <input
          id="pl-default"
          type="checkbox"
          {...register('is_default')}
          disabled={isSubmitting}
          className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-ink">
          Fields <span className="text-error">*</span>
        </label>
        {errors.fields && <p className="text-xs text-error">{errors.fields.message}</p>}
        <p className="text-xs text-ink-muted">Select fields to include in this layout and configure their properties.</p>

        <div className="border border-line rounded-lg divide-y divide-line max-h-80 overflow-y-auto bg-white">
          {visibleFields.map((field) => {
            const fieldId = getFieldId(field);
            const isSelected = selectedFieldIds.has(fieldId);
            const config = fieldConfigs[fieldId];

            return (
              <div
                key={fieldId}
                className={cn(
                  'p-3 transition-colors',
                  isSelected ? 'bg-primary-light/30' : 'hover:bg-surface-alt'
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleField(fieldId)}
                    disabled={isSubmitting}
                    className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-ink flex items-center gap-1.5">
                      {field.label}
                      {field.is_system_field && <Star className="w-3 h-3 text-primary" />}
                      {isSelected && (
                        <div className="relative group">
                          <button
                            type="button"
                            onClick={() => updateFieldConfig(fieldId, 'is_visible', !config?.is_visible)}
                            disabled={isSubmitting}
                            className={cn(
                              'p-0.5 rounded transition-colors',
                              config?.is_visible
                                ? 'text-primary hover:bg-surface-alt'
                                : 'text-ink-muted hover:bg-surface-alt'
                            )}
                          >
                            {config?.is_visible ? (
                              <Eye className="w-3.5 h-3.5" />
                            ) : (
                              <EyeOff className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <span
                            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 text-xs text-ink bg-popover border border-line rounded-md shadow-md whitespace-nowrap z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-in-out delay-200"
                          >
                            Click to hide field from user profile view
                          </span>
                        </div>
                      )}
                    </span>
                    <span className="ml-2 text-[10px] font-mono text-ink-muted">{field.name}</span>
                    <span className="ml-2 text-[10px] text-ink-muted">({field.field_type})</span>
                  </div>
                </div>

                 {isSelected && config && (
                   <div className="grid grid-cols-2 gap-4 ml-7">
                     <div className="space-y-1">
                       <label className="text-[10px] font-medium text-ink-secondary">Order</label>
                       <input
                         type="number"
                         min={0}
                         value={config.display_order}
                         onChange={(e) => updateFieldConfig(fieldId, 'display_order', parseInt(e.target.value) || 0)}
                         disabled={isSubmitting}
                         className="w-full h-7 px-2 text-xs rounded border border-line bg-white text-ink focus:outline-none focus:ring-1 focus:border-primary/50"
                       />
                     </div>
                     <div className="flex items-end">
                       <label className="flex items-center gap-1.5 text-xs">
                         <input
                           type="checkbox"
                           checked={config.is_editable}
                           onChange={(e) => updateFieldConfig(fieldId, 'is_editable', e.target.checked)}
                           disabled={isSubmitting}
                           className="h-3.5 w-3.5 rounded border-line text-primary focus:ring-primary/30"
                         />
                         <span className="text-ink-secondary">Editable</span>
                       </label>
                     </div>
                   </div>
                 )}
              </div>
            );
          })}
        </div>

        {visibleFields.length === 0 && (
          <p className="text-xs text-ink-muted">No active fields available for this object.</p>
        )}
      </div>

      <button type="submit" id="profile-layout-form-submit" className="hidden" />
    </form>
  );
};
