// src/features/locations/components/LocationForm.tsx
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Location, LocationType } from '@/types';
import { cn } from '@/utils/cn';

const schema = z.object({
  name: z.string().min(1, 'Location name is required').max(150, 'Name too long'),
  type: z.enum(['region', 'country', 'city', 'office']),
  parent_id: z.string().optional().nullable(),
  timezone: z.string().min(1, 'Timezone is required'),
  is_headquarters: z.boolean().default(false),
  address: z.string().optional().nullable(),
  working_hours: z.object({
    start: z.string(),
    end: z.string(),
    days: z.array(z.number().min(0).max(6)),
  }).optional().nullable(),
});

export type LocationFormData = z.infer<typeof schema>;

interface LocationFormProps {
  initialData?: Location;
  onSubmit: (data: LocationFormData) => void;
  locations: Location[];
  isSubmitting?: boolean;
}

const TYPE_OPTIONS: { value: LocationType; label: string }[] = [
  { value: 'region', label: 'Region' },
  { value: 'country', label: 'Country' },
  { value: 'city', label: 'City' },
  { value: 'office', label: 'Office' },
];

// Common IANA timezones
const TIMEZONE_OPTIONS = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const inputClass = (hasError?: boolean) =>
  cn(
    'w-full h-9 px-3 text-sm rounded-md border bg-white text-ink',
    'placeholder:text-ink-muted transition-all duration-150',
    'focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/30',
    'disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed',
    hasError ? 'border-red-400 focus:border-red-400 focus:ring-red-300/30' : 'border-line'
  );

/**
 * LocationForm Component
 * Create/edit form for locations with full Zod validation.
 * Submits via a hidden button (id="location-form") triggered from the modal footer.
 * Used on: LocationsPage (create + edit modal).
 */
export const LocationForm: React.FC<LocationFormProps> = ({
  initialData,
  onSubmit,
  locations,
  isSubmitting = false,
}) => {
  const {
    register,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<LocationFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialData?.name ?? '',
      type: initialData?.type ?? 'office',
      parent_id: typeof initialData?.parent_id === 'object'
        ? (initialData.parent_id as any)?._id
        : initialData?.parent_id ?? '',
      timezone: initialData?.timezone ?? 'UTC',
      is_headquarters: initialData?.is_headquarters ?? false,
      address: initialData?.address ?? '',
      working_hours: initialData?.working_hours ?? null,
    },
  });

  // Reset form when initialData changes
  React.useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name ?? '',
        type: initialData.type ?? 'office',
        parent_id: typeof initialData.parent_id === 'object'
          ? (initialData.parent_id as any)?._id
          : initialData.parent_id ?? '',
        timezone: initialData.timezone ?? 'UTC',
        is_headquarters: initialData.is_headquarters ?? false,
        address: initialData.address ?? '',
        working_hours: initialData.working_hours ?? null,
      });
    }
  }, [initialData, reset]);

  const selectedType = watch('type');
  const isHQ = watch('is_headquarters');
  const availableParents = locations.filter(
    (l) => l._id !== initialData?._id && l.type !== selectedType
  );

  return (
    <form id="location-form" onSubmit={(e) => { e.preventDefault(); }} className="space-y-5" noValidate>
      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="loc-name" className="text-sm font-medium text-ink">
          Location Name <span className="text-red-500">*</span>
        </label>
        <input
          id="loc-name"
          {...register('name')}
          placeholder="e.g. North America, New York Office"
          disabled={isSubmitting}
          className={inputClass(!!errors.name)}
        />
        {errors.name && <p className="text-xs text-error">{errors.name.message}</p>}
      </div>

      {/* Type */}
      <div className="space-y-1.5">
        <label htmlFor="loc-type" className="text-sm font-medium text-ink">
          Type <span className="text-red-500">*</span>
        </label>
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <select
              id="loc-type"
              {...field}
              disabled={isSubmitting}
              className={inputClass(!!errors.type)}
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
        />
        {errors.type && <p className="text-xs text-error">{errors.type.message}</p>}
      </div>

      {/* Parent Location */}
      <div className="space-y-1.5">
        <label htmlFor="loc-parent" className="text-sm font-medium text-ink">
          Parent Location
        </label>
        <p className="text-xs text-ink-secondary">
          {selectedType === 'region'
            ? 'Regions are top-level and cannot have a parent.'
            : `Select the parent ${selectedType === 'country' ? 'region' : selectedType === 'city' ? 'country' : 'city or region'}.`}
        </p>
        <Controller
          name="parent_id"
          control={control}
          render={({ field }) => (
            <select
              id="loc-parent"
              {...field}
              value={field.value ?? ''}
              disabled={isSubmitting || selectedType === 'region'}
              className={inputClass(!!errors.parent_id)}
            >
              <option value="">No parent (top-level)</option>
              {availableParents.map((loc) => (
                <option key={loc._id} value={loc._id}>
                  {loc.name} ({loc.type})
                </option>
              ))}
            </select>
          )}
        />
        {errors.parent_id && <p className="text-xs text-error">{errors.parent_id.message}</p>}
      </div>

      {/* Timezone */}
      <div className="space-y-1.5">
        <label htmlFor="loc-timezone" className="text-sm font-medium text-ink">
          IANA Timezone <span className="text-red-500">*</span>
        </label>
        <Controller
          name="timezone"
          control={control}
          render={({ field }) => (
            <select
              id="loc-timezone"
              {...field}
              disabled={isSubmitting}
              className={inputClass(!!errors.timezone)}
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          )}
        />
        {errors.timezone && <p className="text-xs text-error">{errors.timezone.message}</p>}
        <p className="text-xs text-ink-secondary">
          Local time preview: {getTimePreview(watch('timezone'))}
        </p>
      </div>

      {/* Headquarters Flag */}
      <div className="flex items-center gap-2">
        <input
          id="loc-hq"
          type="checkbox"
          {...register('is_headquarters')}
          disabled={isSubmitting}
          className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
        />
        <label htmlFor="loc-hq" className="text-sm font-medium text-ink">
          Set as Headquarters
        </label>
      </div>
      {isHQ && (
        <p className="text-xs text-warning bg-warningLight border border-warningBorder rounded px-3 py-2">
          Only one location per company can be set as headquarters. This will override any existing HQ.
        </p>
      )}

      {/* Address */}
      <div className="space-y-1.5">
        <label htmlFor="loc-address" className="text-sm font-medium text-ink">
          Address
        </label>
        <input
          id="loc-address"
          {...register('address')}
          placeholder="e.g. 123 Main St, New York, NY 10001"
          disabled={isSubmitting}
          className={inputClass(!!errors.address)}
        />
        {errors.address && <p className="text-xs text-error">{errors.address.message}</p>}
      </div>

      {/* Working Hours */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-ink">Working Hours</label>
        <Controller
          name="working_hours"
          control={control}
          render={({ field }) => (
            <WorkingHoursField
              value={field.value}
              onChange={field.onChange}
              disabled={isSubmitting}
            />
          )}
        />
      </div>

      {/* Hidden submit button for modal footer trigger */}
      <button type="submit" id="location-form-submit" className="hidden" />
    </form>
  );
};

// ── Sub-components ───────────────────────────────────────────────────────────

function getTimePreview(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return formatter.format(now);
  } catch {
    return 'Invalid timezone';
  }
}

interface WorkingHoursFieldProps {
  value: { start: string; end: string; days: number[] } | null;
  onChange: (value: { start: string; end: string; days: number[] } | null) => void;
  disabled?: boolean;
}

const WorkingHoursField: React.FC<WorkingHoursFieldProps> = ({ value, onChange, disabled }) => {
  if (!value) {
    return (
      <button
        type="button"
        onClick={() => onChange({ start: '09:00', end: '17:00', days: [0, 1, 2, 3, 4] })}
        className="text-xs text-accent hover:underline"
        disabled={disabled}
      >
        + Add working hours
      </button>
    );
  }

  return (
    <div className="space-y-2 p-3 border border-line rounded-md bg-surface-alt">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="text-xs text-ink-secondary">Start</label>
          <input
            type="time"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
            disabled={disabled}
            className="w-full h-8 px-2 text-sm rounded border border-line bg-white"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-ink-secondary">End</label>
          <input
            type="time"
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            disabled={disabled}
            className="w-full h-8 px-2 text-sm rounded border border-line bg-white"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-ink-secondary">Days</label>
        <div className="flex gap-1 mt-1">
          {DAYS.map((day, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                const days = value.days.includes(idx)
                  ? value.days.filter((d) => d !== idx)
                  : [...value.days, idx];
                onChange({ ...value, days });
              }}
              disabled={disabled}
              className={cn(
                'w-8 h-7 text-xs rounded border transition-colors',
                value.days.includes(idx)
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-ink-secondary border-line hover:bg-surface'
              )}
            >
              {day.charAt(0)}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(null)}
        className="text-xs text-error hover:underline"
        disabled={disabled}
      >
        Remove working hours
      </button>
    </div>
  );
};
