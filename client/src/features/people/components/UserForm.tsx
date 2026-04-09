// src/features/people/components/UserForm.tsx
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserSelect } from '@/components/ui/UserSelect';
import type { User, EmploymentType, Department, Location } from '@/types';
import { cn } from '@/utils/cn';

const schema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(150, 'Name too long'),
  phone: z.string().optional().nullable(),
  department_id: z.string().optional().nullable(),
  team_id: z.string().optional().nullable(),
  manager_id: z.string().optional().nullable(),
  employment_type: z.enum(['full_time', 'part_time', 'contractor', 'intern']),
  hire_date: z.string().optional().nullable(),
  location_id: z.string().optional().nullable(),
});

export type UserFormData = z.infer<typeof schema>;

interface UserFormProps {
  initialData?: User;
  onSubmit: (data: UserFormData) => void;
  departments: Department[];
  locations?: Location[];
  isSubmitting?: boolean;
}

const EMPLOYMENT_TYPE_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'intern', label: 'Intern' },
];

const inputClass = (hasError?: boolean) =>
  cn(
    'w-full h-9 px-3 text-sm rounded-md border bg-white text-ink',
    'placeholder:text-ink-muted transition-all duration-150',
    'focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/30',
    'disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed',
    hasError
      ? 'border-red-400 focus:border-red-400 focus:ring-red-300/30'
      : 'border-line'
  );

/**
 * UserForm Component
 * Profile edit form for users with employment details, department, manager, etc.
 * Submits via a hidden button (id="user-form") triggered from the modal footer.
 * Used on: PeoplePage (edit modal), UserProfilePage.
 */
export const UserForm: React.FC<UserFormProps> = ({
  initialData,
  onSubmit,
  departments,
  locations = [],
  isSubmitting = false,
}) => {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: initialData?.full_name ?? '',
      phone: initialData?.phone ?? '',
      department_id: initialData?.department_id ?? '',
      team_id: initialData?.team_id ?? '',
      manager_id: initialData?.manager_id ?? '',
      employment_type: initialData?.employment_type ?? 'full_time',
      hire_date: initialData?.hire_date ?? '',
      location_id: initialData?.location_id ?? '',
    },
  });

  return (
    <form id="user-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {/* Full Name */}
      <div className="space-y-1.5">
        <label htmlFor="user-name" className="text-sm font-medium text-ink">
          Full Name <span className="text-red-500">*</span>
        </label>
        <input
          id="user-name"
          {...register('full_name')}
          placeholder="e.g. John Doe"
          disabled={isSubmitting}
          className={inputClass(!!errors.full_name)}
        />
        {errors.full_name && (
          <p className="text-xs text-red-500">{errors.full_name.message}</p>
        )}
      </div>

      {/* Phone */}
      <div className="space-y-1.5">
        <label htmlFor="user-phone" className="text-sm font-medium text-ink">
          Phone
        </label>
        <input
          id="user-phone"
          {...register('phone')}
          placeholder="e.g. +1234567890"
          disabled={isSubmitting}
          className={inputClass(!!errors.phone)}
        />
        {errors.phone && (
          <p className="text-xs text-red-500">{errors.phone.message}</p>
        )}
      </div>

      {/* Department */}
      <div className="space-y-1.5">
        <label htmlFor="user-dept" className="text-sm font-medium text-ink">
          Department
        </label>
        <select
          id="user-dept"
          {...register('department_id')}
          disabled={isSubmitting}
          className={inputClass(false)}
        >
          <option value="">No department</option>
          {departments.map((d) => (
            <option key={d._id} value={d._id}>
              {d.name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-ink-muted">
          Assign the user to a department.
        </p>
      </div>

      {/* Location */}
      <div className="space-y-1.5">
        <label htmlFor="user-location" className="text-sm font-medium text-ink">
          Location
        </label>
        <select
          id="user-location"
          {...register('location_id')}
          disabled={isSubmitting}
          className={inputClass(false)}
        >
          <option value="">No location</option>
          {locations.map((loc) => (
            <option key={loc._id} value={loc._id}>
              {loc.name} ({loc.timezone})
            </option>
          ))}
        </select>
        <p className="text-[11px] text-ink-muted">
          Assign the user to a physical location.
        </p>
      </div>

      {/* Manager */}
      <div className="space-y-1.5">
        <label htmlFor="user-manager" className="text-sm font-medium text-ink">
          Manager ID
        </label>
        <Controller
          name="manager_id"
          control={control}
          render={({ field }) => (
            <UserSelect
              value={field.value}
              onChange={field.onChange}
              disabled={isSubmitting}
              hasError={!!errors.manager_id}
              placeholder="Select manager..."
            />
          )}
        />
        <p className="text-[11px] text-ink-muted">
          Enter the 24-character hex ID of the manager.
        </p>
        {errors.manager_id && (
          <p className="text-xs text-red-500">{errors.manager_id.message}</p>
        )}
      </div>

      {/* Employment Type */}
      <div className="space-y-1.5">
        <label htmlFor="user-emp-type" className="text-sm font-medium text-ink">
          Employment Type <span className="text-red-500">*</span>
        </label>
        <select
          id="user-emp-type"
          {...register('employment_type')}
          disabled={isSubmitting}
          className={inputClass(!!errors.employment_type)}
        >
          {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {errors.employment_type && (
          <p className="text-xs text-red-500">{errors.employment_type.message}</p>
        )}
      </div>

      {/* Hire Date */}
      <div className="space-y-1.5">
        <label htmlFor="user-hire-date" className="text-sm font-medium text-ink">
          Hire Date
        </label>
        <input
          id="user-hire-date"
          type="date"
          {...register('hire_date')}
          disabled={isSubmitting}
          className={inputClass(!!errors.hire_date)}
        />
        {errors.hire_date && (
          <p className="text-xs text-red-500">{errors.hire_date.message}</p>
        )}
      </div>

      {/* Hidden submit — triggered by modal footer */}
      <button type="submit" className="hidden" aria-hidden="true" />
    </form>
  );
};
