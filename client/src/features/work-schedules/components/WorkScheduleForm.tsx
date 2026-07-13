// client/src/features/work-schedules/components/WorkScheduleForm.tsx
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { COMMON_TIMEZONES, formatTimezoneLabel } from '@/constants/timezones';
import type { WorkSchedule } from '@/types';

const schema = z.object({
  name: z.string().min(1, 'Schedule name is required').max(150, 'Name too long'),
  description: z.string().optional().nullable(),
  timezone: z.string().min(1, 'Timezone is required'),
  working_days: z.array(z.number().min(0).max(6)).min(1, 'Select at least one working day'),
  working_hours: z.object({
    start: z.string().min(1, 'Start time is required'),
    end: z.string().min(1, 'End time is required'),
  }),
  break_hours: z.object({
    start: z.string(),
    end: z.string(),
  }).optional().nullable(),
  is_active: z.boolean().default(true),
});

export type WorkScheduleFormData = z.infer<typeof schema>;

interface WorkScheduleFormProps {
  initialData?: WorkSchedule;
  onSubmit: (data: WorkScheduleFormData) => void;
  isSubmitting?: boolean;
  isEdit?: boolean;
}

const DAY_LABELS = [
  { value: 0, label: 'Sun', full: 'Sunday' },
  { value: 1, label: 'Mon', full: 'Monday' },
  { value: 2, label: 'Tue', full: 'Tuesday' },
  { value: 3, label: 'Wed', full: 'Wednesday' },
  { value: 4, label: 'Thu', full: 'Thursday' },
  { value: 5, label: 'Fri', full: 'Friday' },
  { value: 6, label: 'Sat', full: 'Saturday' },
];

export const WorkScheduleForm: React.FC<WorkScheduleFormProps> = ({
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
  } = useForm<WorkScheduleFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialData?.name ?? '',
      description: initialData?.description ?? '',
      timezone: initialData?.timezone ?? 'UTC',
      working_days: initialData?.working_days ?? [1, 2, 3, 4, 5],
      working_hours: initialData?.working_hours ?? { start: '09:00', end: '17:00' },
      break_hours: initialData?.break_hours ?? { start: '12:00', end: '13:00' },
      is_active: initialData?.is_active ?? true,
    },
  });

  const fieldStyle = (hasError?: boolean): React.CSSProperties => ({
    borderColor: hasError ? 'rgba(239,68,68,0.5)' : undefined,
    boxShadow: hasError ? '0 0 0 3px rgba(239,68,68,0.08)' : undefined,
  });

  return (
    <form id="work-schedule-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="schedule-name" className="text-sm font-medium text-ink">
          Schedule Name <span className="text-error">*</span>
        </label>
        <input
          id="schedule-name"
          {...register('name')}
          placeholder="e.g. Standard Business Hours, Weekend Shift"
          disabled={isSubmitting}
          className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed transition-all duration-150"
          style={fieldStyle(!!errors.name)}
        />
        {errors.name && <p className="text-xs text-error">{errors.name.message}</p>}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label htmlFor="schedule-description" className="text-sm font-medium text-ink">Description</label>
        <textarea
          id="schedule-description"
          {...register('description')}
          placeholder="Description of this work schedule"
          disabled={isSubmitting}
          rows={2}
          className="w-full px-3 py-2 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed transition-all duration-150 resize-none"
        />
      </div>

      {/* Timezone */}
      <div className="space-y-1.5">
        <label htmlFor="schedule-timezone" className="text-sm font-medium text-ink">
          Timezone <span className="text-error">*</span>
        </label>
        <Controller
          name="timezone"
          control={control}
          render={({ field }) => (
            <select
              id="schedule-timezone"
              {...field}
              disabled={isSubmitting}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed transition-all duration-150"
              style={fieldStyle(!!errors.timezone)}
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{formatTimezoneLabel(tz)}</option>
              ))}
            </select>
          )}
        />
        {errors.timezone && <p className="text-xs text-error">{errors.timezone.message}</p>}
      </div>

      {/* Working Days */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-ink">
          Working Days <span className="text-error">*</span>
        </label>
        <p className="text-xs text-ink-muted mb-2">Select the days this schedule is active.</p>
        <Controller
          name="working_days"
          control={control}
          render={({ field }) => (
            <div className="flex flex-wrap gap-2">
              {DAY_LABELS.map((day) => {
                const isSelected = field.value.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      if (isSelected) {
                        field.onChange(field.value.filter((d) => d !== day.value));
                      } else {
                        field.onChange([...field.value, day.value]);
                      }
                    }}
                    className="px-3 py-1.5 text-sm font-medium rounded-md border transition-all duration-150"
                    style={{
                      background: isSelected ? 'rgba(232,135,10,0.1)' : 'rgba(255,255,255,0.03)',
                      borderColor: isSelected ? 'rgba(232,135,10,0.4)' : 'rgba(255,255,255,0.08)',
                      color: isSelected ? '#E8870A' : '#9BA5B7',
                    }}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          )}
        />
        {errors.working_days && <p className="text-xs text-error">{errors.working_days.message}</p>}
      </div>

      {/* Working Hours */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-ink">
          Working Hours <span className="text-error">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="schedule-start" className="text-xs text-ink-secondary">Start Time</label>
            <input
              id="schedule-start"
              type="time"
              {...register('working_hours.start')}
              disabled={isSubmitting}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed transition-all duration-150"
              style={fieldStyle(!!errors.working_hours?.start)}
            />
            {errors.working_hours?.start && <p className="text-xs text-error">{errors.working_hours.start.message}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor="schedule-end" className="text-xs text-ink-secondary">End Time</label>
            <input
              id="schedule-end"
              type="time"
              {...register('working_hours.end')}
              disabled={isSubmitting}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed transition-all duration-150"
              style={fieldStyle(!!errors.working_hours?.end)}
            />
            {errors.working_hours?.end && <p className="text-xs text-error">{errors.working_hours.end.message}</p>}
          </div>
        </div>
      </div>

      {/* Break Hours */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-ink">
          Break Hours <span className="text-ink-muted">(Optional)</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="schedule-break-start" className="text-xs text-ink-secondary">Break Start</label>
            <input
              id="schedule-break-start"
              type="time"
              {...register('break_hours.start')}
              disabled={isSubmitting}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed transition-all duration-150"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="schedule-break-end" className="text-xs text-ink-secondary">Break End</label>
            <input
              id="schedule-break-end"
              type="time"
              {...register('break_hours.end')}
              disabled={isSubmitting}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed transition-all duration-150"
            />
          </div>
        </div>
      </div>

      {/* Active */}
      <div
        className="flex items-start gap-3 p-3 rounded-lg border border-line cursor-pointer hover:bg-surface-alt transition-colors"
        onClick={() => !isSubmitting && register('is_active').onChange({ target: { value: !watch('is_active'), name: 'is_active' } })}
      >
        <input
          id="schedule-active"
          type="checkbox"
          {...register('is_active')}
          disabled={isSubmitting}
          className="mt-0.5 flex-shrink-0"
        />
        <div>
          <p className="text-sm font-medium text-ink">Active</p>
          <p className="text-xs text-ink-secondary">
            Inactive schedules won't be used for SLA calculations or notifications.
          </p>
        </div>
      </div>

      {/* Hidden submit trigger */}
      <button type="submit" id="work-schedule-form-submit" className="hidden" />
    </form>
  );
};
