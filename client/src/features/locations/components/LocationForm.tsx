// src/features/locations/components/LocationForm.tsx
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { COMMON_TIMEZONES, formatTimezoneLabel } from '@/constants/timezones';
import { getLocalTime, getTimezoneOffset } from '@/lib/timezone';
import type { Location, LocationType } from '@/types';

// ── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, 'Location name is required').max(150, 'Name too long'),
  type: z.enum(['region', 'country', 'city', 'office']),
  parent_id: z.string().optional().nullable(),
  timezone: z.string().min(1, 'Timezone is required'),
  is_headquarters: z.boolean().default(false),
  address: z.string().optional().nullable(),
  working_days: z.array(z.number().min(0).max(6)).optional(),
  working_hours: z.object({
    start: z.string(),
    end: z.string(),
  }).optional().nullable(),
}).refine(data => data.type === 'region' || !!data.parent_id, {
  message: 'Parent location is required unless it is a Region.',
  path: ['parent_id'],
});

export type LocationFormData = z.infer<typeof schema>;

// ── Constants ────────────────────────────────────────────────────────────────

interface LocationFormProps {
  initialData?: Location;
  onSubmit: (data: LocationFormData) => void;
  locations: Location[];
  isSubmitting?: boolean;
}

const TYPE_OPTIONS: { value: LocationType; label: string; desc: string }[] = [
  { value: 'region',  label: 'Region',  desc: 'Top-level geographic area (e.g. North America)' },
  { value: 'country', label: 'Country', desc: 'Country within a region (e.g. Pakistan)' },
  { value: 'city',    label: 'City',    desc: 'City within a country (e.g. Karachi)' },
  { value: 'office',  label: 'Office',  desc: 'Physical office location' },
];

const DAY_LABELS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

// ── Form ─────────────────────────────────────────────────────────────────────

/**
 * LocationForm Component — dark glass theme.
 * Create/edit form for locations with full Zod validation.
 * Submits via a hidden button triggered from the modal footer.
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
    handleSubmit,
    formState: { errors },
  } = useForm<LocationFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialData?.name ?? '',
      type: initialData?.type ?? 'region',
      parent_id: typeof initialData?.parent_id === 'object'
        ? (initialData.parent_id as any)?._id ?? ''
        : initialData?.parent_id ?? '',
      timezone: initialData?.timezone ?? 'Asia/Karachi',
      is_headquarters: initialData?.is_headquarters ?? false,
      address: initialData?.address ?? '',
      working_days: initialData?.working_hours?.days ?? [],
      working_hours: initialData?.working_hours
        ? { start: initialData.working_hours.start, end: initialData.working_hours.end }
        : null,
    },
  });

  React.useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name ?? '',
        type: initialData.type ?? 'region',
        parent_id: typeof initialData.parent_id === 'object'
          ? (initialData.parent_id as any)?._id ?? ''
          : initialData.parent_id ?? '',
        timezone: initialData.timezone ?? 'Asia/Karachi',
        is_headquarters: initialData.is_headquarters ?? false,
        address: initialData.address ?? '',
        working_days: initialData.working_hours?.days ?? [],
        working_hours: initialData.working_hours
          ? { start: initialData.working_hours.start, end: initialData.working_hours.end }
          : null,
      });
    }
  }, [initialData, reset]);

  const selectedType = watch('type');
  const isHQ = watch('is_headquarters');
  const selectedTimezone = watch('timezone');

  const availableParents = locations.filter(
    (l) => l._id !== initialData?._id && l.type !== selectedType
  );

  const fieldStyle = (hasError?: boolean): React.CSSProperties => ({
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(8px)',
    border: hasError ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: '12px 16px',
    fontSize: 14,
    color: '#f8fafc',
    outline: 'none',
    transition: 'all 0.25s ease',
  });

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>, hasError?: boolean) => {
    e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
    e.currentTarget.style.borderColor = hasError ? 'rgba(239,68,68,0.5)' : 'rgba(245,176,42,0.35)';
    e.currentTarget.style.boxShadow = hasError ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(245,176,42,0.06)';
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>, hasError?: boolean) => {
    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
    e.currentTarget.style.borderColor = hasError ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)';
    e.currentTarget.style.boxShadow = 'none';
  };

  return (
    <form id="location-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>

      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="loc-name">
          Location Name <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          id="loc-name"
          {...register('name')}
          placeholder="e.g. North America, Karachi Office"
          disabled={isSubmitting}
          style={fieldStyle(!!errors.name)}
          onFocus={(e) => handleFocus(e, !!errors.name)}
          onBlur={(e) => handleBlur(e, !!errors.name)}
        />
        {errors.name && <p className="text-xs mt-1" style={{ color: '#f87171' }}>{errors.name.message}</p>}
      </div>

      {/* Type — card picker */}
      <div className="space-y-1.5">
        <label>Type <span style={{ color: '#ef4444' }}>*</span></label>
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <div className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map((opt) => {
                const selected = field.value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => field.onChange(opt.value)}
                    className="text-left p-3 rounded-xl transition-all border"
                    style={{
                      background: selected ? 'rgba(245,176,42,0.1)' : 'rgba(255,255,255,0.03)',
                      borderColor: selected ? 'rgba(245,176,42,0.4)' : 'rgba(255,255,255,0.08)',
                      boxShadow: selected ? '0 0 0 1px rgba(245,176,42,0.15)' : 'none',
                    }}
                  >
                    <p className="text-sm font-bold" style={{ color: selected ? '#f5b02a' : 'var(--text-main)' }}>
                      {opt.label}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          )}
        />
        {errors.type && <p className="text-xs mt-1" style={{ color: '#f87171' }}>{errors.type.message}</p>}
      </div>

      {/* Parent Location */}
      <div className="space-y-1.5">
        <label htmlFor="loc-parent">Parent Location</label>
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
          {selectedType === 'region'
            ? 'Regions are top-level and do not require a parent.'
            : `Select the parent ${selectedType === 'country' ? 'region' : selectedType === 'city' ? 'country or region' : 'city, country, or region'}.`}
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
              style={fieldStyle(!!errors.parent_id)}
              onFocus={(e) => handleFocus(e, !!errors.parent_id)}
              onBlur={(e) => handleBlur(e, !!errors.parent_id)}
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
        {errors.parent_id && <p className="text-xs mt-1" style={{ color: '#f87171' }}>{errors.parent_id.message}</p>}
      </div>

      {/* Timezone */}
      <div className="space-y-1.5">
        <label htmlFor="loc-timezone">Timezone <span style={{ color: '#ef4444' }}>*</span></label>
        <Controller
          name="timezone"
          control={control}
          render={({ field }) => (
            <select
              id="loc-timezone"
              {...field}
              disabled={isSubmitting}
              style={fieldStyle(!!errors.timezone)}
              onFocus={(e) => handleFocus(e, !!errors.timezone)}
              onBlur={(e) => handleBlur(e, !!errors.timezone)}
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{formatTimezoneLabel(tz)}</option>
              ))}
            </select>
          )}
        />
        {errors.timezone && <p className="text-xs mt-1" style={{ color: '#f87171' }}>{errors.timezone.message}</p>}
        {selectedTimezone && (
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>
              Local time: <span className="font-mono">{getLocalTime(selectedTimezone)}</span>
            </span>
            <span className="text-ink-muted">|</span>
            <span>
              {getTimezoneOffset(selectedTimezone)}
            </span>
          </div>
        )}
      </div>

      {/* Headquarters */}
      <div
        className="flex items-start gap-3 p-3 rounded-xl cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        onClick={() => !isSubmitting && register('is_headquarters').onChange({ target: { value: !isHQ, name: 'is_headquarters' } })}
      >
        <input
          id="loc-hq"
          type="checkbox"
          {...register('is_headquarters')}
          disabled={isSubmitting}
          className="mt-0.5 flex-shrink-0"
        />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Set as Headquarters</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Only one location per company can be HQ. This will replace any existing headquarters.
          </p>
        </div>
      </div>
      {isHQ && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
          style={{ background: 'rgba(245,176,42,0.08)', border: '1px solid rgba(245,176,42,0.2)', color: '#fbbf24' }}>
          ⚠ Setting this as HQ will override any existing headquarters location.
        </div>
      )}

      {/* Working Hours */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-ink">Working Hours</label>
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
          Set default working days and hours for this location. You can also assign a full work schedule from the Work Schedules page.
        </p>

        {/* Working Days */}
        <Controller
          name="working_days"
          control={control}
          render={({ field }) => (
            <div className="flex flex-wrap gap-2 mb-3">
              {DAY_LABELS.map((day) => {
                const currentDays = field.value ?? [];
                const isSelected = currentDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      if (isSelected) {
                        field.onChange(currentDays.filter((d) => d !== day.value));
                      } else {
                        field.onChange([...currentDays, day.value]);
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all border"
                    style={{
                      background: isSelected ? 'rgba(245,176,42,0.12)' : 'rgba(255,255,255,0.03)',
                      borderColor: isSelected ? 'rgba(245,176,42,0.4)' : 'rgba(255,255,255,0.08)',
                      color: isSelected ? '#f5b02a' : '#94a3b8',
                    }}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          )}
        />

        {/* Working Hours Time */}
        <Controller
          name="working_hours"
          control={control}
          render={({ field }) => (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Start Time</label>
                <input
                  type="time"
                  value={field.value?.start ?? '09:00'}
                  onChange={(e) => field.onChange({ ...field.value, start: e.target.value })}
                  disabled={isSubmitting}
                  className="w-full h-9 px-3 text-sm rounded-lg border bg-white text-ink"
                  style={{ borderColor: 'rgba(255,255,255,0.08)' }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs" style={{ color: 'var(--text-muted)' }}>End Time</label>
                <input
                  type="time"
                  value={field.value?.end ?? '17:00'}
                  onChange={(e) => field.onChange({ ...field.value, end: e.target.value })}
                  disabled={isSubmitting}
                  className="w-full h-9 px-3 text-sm rounded-lg border bg-white text-ink"
                  style={{ borderColor: 'rgba(255,255,255,0.08)' }}
                />
              </div>
            </div>
          )}
        />
      </div>

      {/* Address */}
      <div className="space-y-1.5">
        <label htmlFor="loc-address">Address</label>
        <input
          id="loc-address"
          {...register('address')}
          placeholder="e.g. 123 Main St, Karachi, Pakistan"
          disabled={isSubmitting}
          style={fieldStyle(!!errors.address)}
          onFocus={(e) => handleFocus(e, !!errors.address)}
          onBlur={(e) => handleBlur(e, !!errors.address)}
        />
        {errors.address && <p className="text-xs mt-1" style={{ color: '#f87171' }}>{errors.address.message}</p>}
      </div>

      {/* Hidden submit trigger */}
      <button type="submit" id="location-form-submit" className="hidden" />
    </form>
  );
};
