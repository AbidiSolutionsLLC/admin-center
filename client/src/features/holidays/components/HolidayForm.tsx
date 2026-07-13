// client/src/features/holidays/components/HolidayForm.tsx
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Calendar as CalendarIcon, Clock, Hash, CheckCircle } from 'lucide-react';
import { COMMON_TIMEZONES, formatTimezoneLabel } from '@/constants/timezones';
import { getLocalTime, getTimezoneOffset } from '@/lib/timezone';
import type { Holiday, HolidayCalendar } from '@/types';

const schema = z.object({
  name: z.string().min(1, 'Holiday name is required').max(150, 'Name too long'),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  recurring_type: z.enum(['yearly', 'monthly', 'quarterly', 'custom']).default('yearly'),
  recurring_details: z.object({
    year: z.number().optional(),
    month: z.number().optional(),
    day: z.number().optional(),
    pattern: z.string().optional(),
    end_date: z.string().optional(),
  }).optional().nullable(),
  holiday_code: z.string().optional().nullable(),
  is_observed: z.boolean().default(false),
});

export type HolidayFormData = z.infer<typeof schema>;

interface HolidayFormProps {
  initialData?: Holiday;
  onSubmit: (data: HolidayFormData) => void;
  calendars: HolidayCalendar[];
  isSubmitting?: boolean;
  isEdit?: boolean;
}

export const HolidayForm: React.FC<HolidayFormProps> = ({
  initialData,
  onSubmit,
  calendars,
  isSubmitting = false,
  isEdit = false,
}) => {
  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<HolidayFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialData?.name ?? '',
      date: initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : '',
      recurring_type: initialData?.recurring_type ?? 'yearly',
      recurring_details: initialData?.recurring_details ?? null,
      holiday_code: initialData?.holiday_code ?? '',
      is_observed: initialData?.is_observed ?? false,
    },
  });

  const selectedDate = watch('date');
  const selectedRecurringType = watch('recurring_type');
  const isObserved = watch('is_observed');

  const fieldStyle = (hasError?: boolean): React.CSSProperties => ({
    borderColor: hasError ? 'rgba(239,68,68,0.5)' : undefined,
    boxShadow: hasError ? '0 0 0 3px rgba(239,68,68,0.08)' : undefined,
  });

  const getDaysInMonth = (year: number, month: number): number => {
    return new Date(year, month + 1, 0).getDate();
  };

  return (
    <form id="holiday-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="holiday-name">
          Holiday Name <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          id="holiday-name"
          {...register('name')}
          placeholder="e.g. New Year's Day, Eid al-Fitr"
          disabled={isSubmitting}
          style={fieldStyle(!!errors.name)}
        />
        {errors.name && <p className="text-xs mt-1" style={{ color: '#f87171' }}>{errors.name.message}</p>}
      </div>

      {/* Date */}
      <div className="space-y-1.5">
        <label htmlFor="holiday-date">
          Date <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          id="holiday-date"
          type="date"
          {...register('date')}
          disabled={isSubmitting}
          style={fieldStyle(!!errors.date)}
        />
        {errors.date && <p className="text-xs mt-1" style={{ color: '#f87171' }}>{errors.date.message}</p>}
        {selectedDate && (
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>
              Local time: <span className="font-mono">{getLocalTime(selectedDate)}</span>
            </span>
            <span className="text-ink-muted">|</span>
            <span>
              {getTimezoneOffset(selectedDate)}
            </span>
          </div>
        )}
      </div>

      {/* Recurring Type */}
      <div className="space-y-1.5">
        <label htmlFor="holiday-recurring_type">
          Recurrence <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <Controller
          name="recurring_type"
          control={control}
          render={({ field }) => (
            <select
              id="holiday-recurring_type"
              {...field}
              disabled={isSubmitting}
              style={fieldStyle(!!errors.recurring_type)}
            >
              <option value="yearly">Yearly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="custom">Custom</option>
            </select>
          )}
        />
        {errors.recurring_type && <p className="text-xs mt-1" style={{ color: '#f87171' }}>{errors.recurring_type.message}</p>}
      </div>

      {/* Holiday Code */}
      <div className="space-y-1.5">
        <label htmlFor="holiday-code">Code</label>
        <input
          id="holiday-code"
          {...register('holiday_code')}
          placeholder="e.g. NW01, SAL-001"
          disabled={isSubmitting}
          style={fieldStyle(!!errors.holiday_code)}
        />
        {errors.holiday_code && <p className="text-xs mt-1" style={{ color: '#f87171' }}>{errors.holiday_code.message}</p>}
      </div>

      {/* Observed */}
      <div
        className="flex items-start gap-3 p-3 rounded-xl cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        onClick={() => !isSubmitting && register('is_observed').onChange({ target: { value: !isObserved, name: 'is_observed' } })}
      >
        <input
          id="holiday-observed"
          type="checkbox"
          {...register('is_observed')}
          disabled={isSubmitting}
          className="mt-0.5 flex-shrink-0"
        />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Observed Holiday</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            This holiday is officially observed with a different date than the actual celebration.
          </p>
        </div>
      </div>

      {/* Hidden submit trigger */}
      <button type="submit" id="holiday-form-submit" className="hidden" />
    </form>
  );
};