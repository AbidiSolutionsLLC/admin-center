// src/features/teams/components/TeamForm.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserSelect } from '@/components/ui/UserSelect';
import { DynamicCustomFields, isFieldRequired } from '@/features/data-fields/components/DynamicCustomFields';
import { useEffectiveCustomFields } from '@/features/data-fields/hooks/useEffectiveCustomFields';
import type { Team, Department } from '@/types';
import { cn } from '@/utils/cn';

const schema = z.object({
  name: z.string().min(1, 'Team name is required').max(100, 'Name too long').regex(/^[a-zA-Z0-9\s]+$/, 'Team name can only contain alphanumeric characters and spaces'),
  description: z.string().max(500, 'Description too long').optional(),
  department_id: z.string().min(1, 'Department is required'),
  team_lead_id: z.string().min(1, 'Team manager is required'),
});

export type TeamFormData = z.infer<typeof schema>;

interface TeamFormProps {
  initialData?: Team;
  onSubmit: (data: TeamFormData & { custom_fields?: Record<string, unknown> }) => void;
  departments: Department[];
  isSubmitting?: boolean;
}

const inputClass = (hasError?: boolean) =>
  cn(
    'w-full h-10 px-3 text-sm rounded-md border bg-white/5 text-slate-200 border-white/10',
    'placeholder:text-slate-500 transition-all duration-150',
    'focus:outline-none focus:ring-1 focus:border-primary/50 focus:ring-primary/50',
    'disabled:bg-black/20 disabled:text-slate-500 disabled:cursor-not-allowed',
    hasError
      ? 'border-error focus:border-error focus:ring-error/50'
      : 'hover:border-white/20'
  );

/**
 * TeamForm Component
 * Create/edit form for teams with full Zod validation.
 * Validates: name required, department required, team lead must be valid user.
 * Submits via a hidden button triggered from the modal footer.
 * Used on: TeamsPage (create + edit modal).
 */
export const TeamForm: React.FC<TeamFormProps> = ({
  initialData,
  onSubmit,
  departments,
  isSubmitting = false,
}) => {
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<TeamFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialData?.name ?? '',
      description: initialData?.description ?? '',
      department_id: typeof initialData?.department_id === 'object' ? (initialData.department_id as any)?._id : initialData?.department_id ?? '',
      team_lead_id: typeof initialData?.team_lead_id === 'object' ? (initialData.team_lead_id as any)?._id : initialData?.team_lead_id ?? '',
    },
  });

  // Sync internal form state when initialData changes
  React.useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name ?? '',
        description: initialData.description ?? '',
        department_id: typeof initialData.department_id === 'object' ? (initialData.department_id as any)?._id : initialData.department_id ?? '',
        team_lead_id: typeof initialData.team_lead_id === 'object' ? (initialData.team_lead_id as any)?._id : initialData.team_lead_id ?? '',
      });
      setCustomFieldValues(initialData.custom_fields ?? {});
    }
  }, [initialData, reset]);

  // ── Custom fields ──
  const { data: effectiveFields } = useEffectiveCustomFields('team', []);
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

  return (
    <form id="team-form" onSubmit={(e) => { e.preventDefault(); handleSubmitWithCustomFields(); }} className="space-y-5" noValidate>
      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="team-name" className="text-sm font-medium text-ink">
          Team Name <span className="text-red-500">*</span>
        </label>
        <input
          id="team-name"
          {...register('name')}
          placeholder="e.g. Frontend Engineering"
          disabled={isSubmitting}
          className={inputClass(!!errors.name)}
        />
        {errors.name && (
          <p className="text-xs text-red-500">{errors.name.message}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label htmlFor="team-desc" className="text-sm font-medium text-ink">
          Description
        </label>
        <textarea
          id="team-desc"
          {...register('description')}
          placeholder="Brief description of the team..."
          disabled={isSubmitting}
          rows={3}
          className={cn(inputClass(false), 'resize-none')}
        />
        <p className="text-[11px] text-ink-muted">
          Optional description of the team's purpose and responsibilities.
        </p>
        {errors.description && (
          <p className="text-xs text-red-500">{errors.description.message}</p>
        )}
      </div>

      {/* Department */}
      <div className="space-y-1.5">
        <label htmlFor="team-dept" className="text-sm font-medium text-ink">
          Department <span className="text-red-500">*</span>
        </label>
        <select
          id="team-dept"
          {...register('department_id')}
          disabled={isSubmitting}
          className={inputClass(!!errors.department_id)}
        >
          <option value="">Select a department...</option>
          {departments.map((dept) => (
            <option key={dept._id} value={dept._id}>
              {dept.name}
            </option>
          ))}
        </select>
        {errors.department_id && (
          <p className="text-xs text-red-500">{errors.department_id.message}</p>
        )}
        <p className="text-[11px] text-ink-muted">
          Teams must belong to a parent department.
        </p>
      </div>

      {/* Team Lead */}
      <div className="space-y-1.5">
        <label htmlFor="team-lead" className="text-sm font-medium text-ink">
          Team Lead <span className="text-red-500">*</span>
        </label>
        <Controller
          name="team_lead_id"
          control={control}
          render={({ field }) => (
            <UserSelect
              value={field.value}
              onChange={field.onChange}
              disabled={isSubmitting}
              hasError={!!errors.team_lead_id}
              placeholder="Select team lead..."
              onlyActive={true}
            />
          )}
        />
        <p className="text-[11px] text-ink-muted">
          Enter the 24-character hex ID of the user who will lead this team.
        </p>
        {errors.team_lead_id && (
          <p className="text-xs text-red-500">{errors.team_lead_id.message}</p>
        )}
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

      {/* Hidden submit — triggered by modal footer */}
      <button type="submit" className="hidden" aria-hidden="true" />
    </form>
  );
};
