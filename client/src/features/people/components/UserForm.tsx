// src/features/people/components/UserForm.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserSelect } from '@/components/ui/UserSelect';
import { MultiUserSelect } from '@/components/ui/MultiUserSelect';
import { DynamicCustomFields } from '@/features/data-fields/components/DynamicCustomFields';
import { useCustomFields } from '@/features/data-fields/hooks/useCustomFields';
import type { User, EmploymentType, Department, CustomField, Location, UserRole } from '@/types';
import { cn } from '@/utils/cn';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'Super Admin', label: 'Super Admin' },
  { value: 'Admin', label: 'Admin' },
  { value: 'HR', label: 'HR' },
  { value: 'Manager', label: 'Manager' },
  { value: 'Employee', label: 'Employee' },
  { value: 'Technician', label: 'Technician' },
];

const createSchema = (requiredFields: string[], editingUserId?: string) => z.object({
  full_name: z.string().min(1, 'Full name is required').max(150, 'Name too long'),
  phone: z.string().regex(/^\d*$/, 'Phone must contain only numbers').optional().nullable(),
  department_id: z.string().optional().nullable(),
  manager_id: z.string().optional().nullable(),
  secondary_manager_ids: z.array(z.string()).optional().default([]),
  role: z.enum(['Super Admin', 'Admin', 'HR', 'Manager', 'Employee', 'Technician']),
  employment_type: z.enum(['full_time', 'part_time', 'contractor', 'intern']),
  hire_date: z.string().optional().nullable(),
  location_id: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  // Check for required fields from company settings
  // Note: We exclude 'email' here because it's not editable in this form
  requiredFields.filter(f => f !== 'email').forEach(field => {
    const value = (data as any)[field];
    if (value === undefined || value === null || value === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'This field is required',
        path: [field],
      });
    }
  });

  // Prevent user from being their own manager
  if (data.manager_id && data.manager_id === editingUserId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'User cannot be their own manager',
      path: ['manager_id'],
    });
  }

  // Prevent user from being their own secondary manager
  if (data.secondary_manager_ids.includes(editingUserId || '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'User cannot be their own secondary manager',
      path: ['secondary_manager_ids'],
    });
  }

  if (data.manager_id && data.secondary_manager_ids.includes(data.manager_id)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'User cannot be both primary and secondary manager',
      path: ['secondary_manager_ids'],
    });
  }
});

export type UserFormData = z.infer<ReturnType<typeof createSchema>>;

interface UserFormProps {
  initialData?: Partial<User>;
  onSubmit: (data: UserFormData & { custom_fields?: Record<string, unknown> }) => void;
  departments?: Department[];
  locations?: Location[];
  isSubmitting?: boolean;
  requiredFields?: string[];
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
 * Includes dynamic custom fields for all field types.
 * Submits via a hidden button (id="user-form") triggered from the modal footer.
 * Used on: PeoplePage (edit modal), UserProfilePage.
 */
export const UserForm: React.FC<UserFormProps> = ({
  initialData,
  onSubmit,
  departments,
  teams = [],
  locations = [],
  isSubmitting = false,
  requiredFields = [],
}) => {
  const schema = React.useMemo(() => createSchema(requiredFields, initialData?._id), [requiredFields, initialData?._id]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: initialData?.full_name ?? '',
      phone: initialData?.phone?.replace(/\D/g, '') ?? '',
      department_id: (typeof initialData?.department_id === 'object' && initialData?.department_id !== null) ? initialData.department_id._id : (initialData?.department_id as string ?? ''),
      manager_id: (typeof initialData?.manager_id === 'object' && initialData?.manager_id !== null) ? initialData.manager_id._id : (initialData?.manager_id as string ?? ''),
      secondary_manager_ids: initialData?.secondary_manager_ids ?? [],
      role: initialData?.role || 'Employee',
      employment_type: initialData?.employment_type || 'full_time',
      hire_date: initialData?.hire_date ? new Date(initialData.hire_date).toISOString().split('T')[0] : '',
      location_id: (typeof initialData?.location_id === 'object' && initialData?.location_id !== null) ? (initialData.location_id as any)._id : (initialData?.location_id as string ?? ''),
    },
  });

  // ── Custom fields ──────────────────────────────────────────────────────
  const { data: customFields = [] } = useCustomFields('user');
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>(
    initialData?.custom_fields ?? {}
  );
  const [customFieldErrors, setCustomFieldErrors] = useState<Record<string, string>>({});

  // Reset form when initialData changes
  useEffect(() => {
    if (initialData) {
      reset({
        full_name: initialData.full_name ?? '',
        phone: initialData.phone?.replace(/\D/g, '') ?? '',
        department_id: (typeof initialData.department_id === 'object' && initialData.department_id !== null) ? initialData.department_id._id : (initialData.department_id as string ?? ''),
        manager_id: (typeof initialData.manager_id === 'object' && initialData.manager_id !== null) ? initialData.manager_id._id : (initialData.manager_id as string ?? ''),
        secondary_manager_ids: initialData.secondary_manager_ids ?? [],
        role: initialData.role || 'Employee',
        employment_type: initialData.employment_type || 'full_time',
        hire_date: initialData.hire_date ? new Date(initialData.hire_date).toISOString().split('T')[0] : '',
        location_id: (typeof initialData.location_id === 'object' && initialData.location_id !== null) ? (initialData.location_id as any)._id : (initialData.location_id as string ?? ''),
      });
      setCustomFieldValues(initialData.custom_fields ?? {});
    }
  }, [initialData, reset]);

  const handleCustomFieldChange = useCallback((slug: string, value: unknown) => {
    setCustomFieldValues((prev) => ({ ...prev, [slug]: value }));
    // Clear error on change
    setCustomFieldErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
  }, []);

  // Validate required custom fields before submit
  const validateCustomFields = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    for (const field of customFields) {
      if (field.required) {
        const value = customFieldValues[field.slug];
        if (value === null || value === undefined || value === '') {
          newErrors[field.slug] = `${field.label} is required`;
        }
      }
    }
    setCustomFieldErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [customFields, customFieldValues]);

  return (
    <form
      id="user-form"
      onSubmit={handleSubmit(
        (data) => {
          if (!validateCustomFields()) return;
          onSubmit({
            ...data,
            custom_fields: customFieldValues,
          });
        },
        (errors) => {
          console.error('UserForm validation errors:', errors);
        }
      )}
      className="space-y-5"
    >
      {/* Full Name */}
      <div className="space-y-1.5">
        <label htmlFor="user-name" className="text-sm font-medium text-ink">
          Full Name {requiredFields.includes('full_name') && <span className="text-red-500">*</span>}
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
          Phone {requiredFields.includes('phone') && <span className="text-red-500">*</span>}
        </label>
        <input
          id="user-phone"
          {...register('phone')}
          placeholder="e.g. 1234567890"
          disabled={isSubmitting}
          className={inputClass(!!errors.phone)}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '');
            e.target.value = val;
            register('phone').onChange(e);
          }}
        />
        {errors.phone && (
          <p className="text-xs text-red-500">{errors.phone.message}</p>
        )}
      </div>

      {/* Department */}
      <div className="space-y-1.5">
        <label htmlFor="user-dept" className="text-sm font-medium text-ink">
          Department {requiredFields.includes('department_id') && <span className="text-red-500">*</span>}
        </label>
        <select
          id="user-dept"
          {...register('department_id')}
          disabled={isSubmitting}
          className={inputClass(!!errors.department_id)}
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
        {errors.department_id && (
          <p className="text-xs text-red-500">{errors.department_id.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="user-role" className="text-sm font-medium text-ink">
          Role {requiredFields.includes('role') && <span className="text-red-500">*</span>}
        </label>
        <select
          id="user-role"
          {...register('role')}
          disabled={isSubmitting}
          className={inputClass(!!errors.role)}
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-ink-muted">
          Set the user's access role.
        </p>
        {errors.role && (
          <p className="text-xs text-red-500">{errors.role.message}</p>
        )}
      </div>

      {/* Location */}
      <div className="space-y-1.5">
        <label htmlFor="user-location" className="text-sm font-medium text-ink">
          Location {requiredFields.includes('location_id') && <span className="text-red-500">*</span>}
        </label>
        <select
          id="user-location"
          {...register('location_id')}
          disabled={isSubmitting}
          className={inputClass(!!errors.location_id)}
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
        {errors.location_id && (
          <p className="text-xs text-red-500">{errors.location_id.message}</p>
        )}
      </div>

      {/* Manager */}
      <div className="space-y-1.5">
        <label htmlFor="user-manager" className="text-sm font-medium text-ink">
          Manager {requiredFields.includes('manager_id') && <span className="text-red-500">*</span>}
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
              onlyActive={true}
            />
          )}
        />
        <p className="text-[11px] text-ink-muted">
          Select the primary manager this user reports to directly.
        </p>
        {errors.manager_id && (
          <p className="text-xs text-red-500">{errors.manager_id.message}</p>
        )}
      </div>

      {/* Secondary Managers */}
      <div className="space-y-1.5">
        <label htmlFor="user-secondary-managers" className="text-sm font-medium text-ink">
          Secondary Managers
        </label>
        <Controller
          name="secondary_manager_ids"
          control={control}
          render={({ field }) => (
            <MultiUserSelect
              value={field.value}
              onChange={field.onChange}
              disabled={isSubmitting}
              hasError={!!errors.secondary_manager_ids}
              placeholder="Select secondary managers..."
              onlyActive={true}
            />
          )}
        />
        <p className="text-[11px] text-ink-muted">
          Assign one or more secondary managers for matrix reporting or dotted-line supervision.
        </p>
        {errors.secondary_manager_ids && (
          <p className="text-xs text-red-500">{errors.secondary_manager_ids.message}</p>
        )}
      </div>

      {/* Employment Type */}
      <div className="space-y-1.5">
        <label htmlFor="user-emp-type" className="text-sm font-medium text-ink">
          Employment Type {requiredFields.includes('employment_type') && <span className="text-red-500">*</span>}
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
        <p className="text-[11px] text-ink-muted">
          Specify employment status.
        </p>
        {errors.employment_type && (
          <p className="text-xs text-red-500">{errors.employment_type.message}</p>
        )}
      </div>

      {/* Hire Date */}
      <div className="space-y-1.5">
        <label htmlFor="user-hire-date" className="text-sm font-medium text-ink">
          Hire Date {requiredFields.includes('hire_date') && <span className="text-red-500">*</span>}
        </label>
        <input
          id="user-hire-date"
          type="date"
          {...register('hire_date')}
          disabled={isSubmitting}
          className={inputClass(!!errors.hire_date)}
        />
        <p className="text-[11px] text-ink-muted">
          Official joining date.
        </p>
        {errors.hire_date && (
          <p className="text-xs text-red-500">{errors.hire_date.message}</p>
        )}
      </div>

      {/* ── Custom Fields ── */}
      <DynamicCustomFields
        fields={customFields}
        values={customFieldValues}
        onChange={handleCustomFieldChange}
        errors={customFieldErrors}
        disabled={isSubmitting}
      />

      {/* Hidden submit — triggered by modal footer */}
      <button type="submit" className="hidden" aria-hidden="true" />
    </form>
  );
};
