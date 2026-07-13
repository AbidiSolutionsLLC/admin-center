// client/src/features/holidays/components/HolidayCalendarForm.tsx
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { HolidayCalendar } from '@/types';

const schema = z.object({
  name: z.string().min(1, 'Calendar name is required').max(150, 'Name too long'),
  description: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
});

export type HolidayCalendarFormData = z.infer<typeof schema>;

interface HolidayCalendarFormProps {
  initialData?: HolidayCalendar;
  onSubmit: (data: HolidayCalendarFormData) => void;
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

  const fieldStyle = (hasError?: boolean): React.CSSProperties => ({
    borderColor: hasError ? 'rgba(239,68,68,0.5)' : undefined,
    boxShadow: hasError ? '0 0 0 3px rgba(239,68,68,0.08)' : undefined,
  });

  return (
    <form id="holiday-calendar-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
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

      {/* Hidden submit trigger */}
      <button type="submit" id="holiday-calendar-form-submit" className="hidden" />
    </form>
  );
};