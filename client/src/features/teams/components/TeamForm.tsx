// src/features/teams/components/TeamForm.tsx
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserSelect } from '@/components/ui/UserSelect';
import type { Team, Department } from '@/types';
import { cn } from '@/utils/cn';

const schema = z.object({
  name: z.string().min(1, 'Team name is required').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  department_id: z.string().min(1, 'Department is required').nullable(),
  team_lead_id: z
    .string()
    .optional()
    .nullable()
    .refine(
      (val) => !val || /^[a-fA-F0-9]{24}$/.test(val),
      { message: 'Must be a valid 24-character MongoDB ObjectId' }
    ),
});

export type TeamFormData = z.infer<typeof schema>;

interface TeamFormProps {
  initialData?: Team;
  onSubmit: (data: TeamFormData) => void;
  departments: Department[];
  isSubmitting?: boolean;
}

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
    formState: { errors },
  } = useForm<TeamFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialData?.name ?? '',
      description: initialData?.description ?? '',
      department_id: initialData?.department_id ?? null,
      team_lead_id: initialData?.team_lead_id ?? '',
    },
  });

  return (
    <form id="team-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
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
          Team Lead
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

      {/* Hidden submit — triggered by modal footer */}
      <button type="submit" className="hidden" aria-hidden="true" />
    </form>
  );
};
