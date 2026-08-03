// client/src/features/holidays/components/HolidayCalendarForm.tsx
import React, { useState, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DynamicCustomFields, isFieldRequired } from '@/features/data-fields/components/DynamicCustomFields';
import { useEffectiveCustomFields } from '@/features/data-fields/hooks/useEffectiveCustomFields';
import type { HolidayCalendar } from '@/types';

const schema = z.object({
  name: z.string().min(1, 'Calendar name is required').max(150, 'Name too long'),
  description: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
});

export type HolidayCalendarFormData = z.infer<typeof schema>;

interface HolidayCalendarFormProps {
  initialData?: HolidayCalendar;
  onSubmit: (data: HolidayCalendarFormData & { custom_fields?: Record<string, unknown> }) => void;
  isSubmitting?: boolean;
  isEdit?: boolean;
}

export const HolidayCalendarForm: React.FC<HolidayCalendarFormProps> = ({
  initialData,
  onSubmit,
  isSubmitting = false,
  isEdit = false,
}) => {
  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<HolidayCalendarFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialData?.name ?? '',
      description: initialData?.description ?? '',
      is_active: initialData?.is_active ?? true,
    },
  });

  // ── Custom fields ──
  const { data: effectiveFields } = useEffectiveCustomFields('holiday_calendar', []);
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

  React.useEffect(() => {
    if (initialData?.custom_fields) {
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

  const fieldStyle = (hasError?: boolean): React.CSSProperties => ({
    borderColor: hasError ? 'rgba(239,68,68,0.5)' : undefined,
    boxShadow: hasError ? '0 0 0 3px rgba(239,68,68,0.08)' : undefined,
  });

  return (
    <form id="holiday-calendar-form" onSubmit={(e) => { e.preventDefault(); handleSubmitWithCustomFields(); }} className="space-y-5" noValidate>
      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="calendar-name">
          Calendar Name <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          id="calendar-name"
          {...register('name')}
          placeholder="e.g. General Holidays, Regional holidays"
          disabled={isSubmitting}
          style={fieldStyle(!!errors.name)}
        />
        {errors.name && <p className="text-xs mt-1" style={{ color: '#f87171' }}>{errors.name.message}</p>}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label htmlFor="calendar-description">Description</label>
        <textarea
          id="calendar-description"
          {...register('description')}
          placeholder="Description of this holiday calendar"
          disabled={isSubmitting}
          rows={3}
          style={fieldStyle(!!errors.description)}
        />
        {errors.description && <p className="text-xs mt-1" style={{ color: '#f87171' }}>{errors.description.message}</p>}
      </div>

      {/* Active */}
      <div
        className="flex items-start gap-3 p-3 rounded-xl cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        onClick={() => !isSubmitting && watch('is_active') && register('is_active').onChange({ target: { value: !watch('is_active'), name: 'is_active' } })}
      >
        <input
          id="calendar-active"
          type="checkbox"
          {...register('is_active')}
          disabled={isSubmitting}
          className="mt-0.5 flex-shrink-0"
        />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Active</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Inactive calendars won't appear in assignments and users won't inherit them.
          </p>
        </div>
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

      {/* Hidden submit trigger */}
      <button type="submit" id="holiday-calendar-form-submit" className="hidden" />
    </form>
  );
};