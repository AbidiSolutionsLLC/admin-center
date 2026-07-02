// src/features/people/components/UserOrgAssignmentModal.tsx
import React, { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { useAssignUserOrg } from '../hooks/useAssignUserOrg';
import { useDepartments } from '@/features/organization/hooks/useDepartments';
import { useTeams } from '@/features/teams/hooks/useTeams';
import { cn } from '@/utils/cn';
import type { User, Department, Team } from '@/types';

interface UserOrgAssignmentModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  requiredFields?: string[];
}

const inputClass = cn(
  'w-full h-10 px-3 text-sm rounded-md border bg-white/5 text-slate-200 border-white/10',
  'placeholder:text-slate-500 transition-all duration-150',
  'focus:outline-none focus:ring-1 focus:border-primary/50 focus:ring-primary/50',
  'disabled:bg-black/20 disabled:text-slate-500 disabled:cursor-not-allowed hover:border-white/20'
);

/**
 * UserOrgAssignmentModal Component
 * Modal for assigning a user to a department and teams in one request.
 * After assignment, React Query invalidates user and users queries immediately.
 * Used on: PeoplePage, UserDetailPage.
 */
export const UserOrgAssignmentModal: React.FC<UserOrgAssignmentModalProps> = ({
  user,
  isOpen,
  onClose,
  requiredFields = [],
}) => {
  const { data: departments } = useDepartments();
  const { data: teams } = useTeams();
  const assignMutation = useAssignUserOrg();

  const [selectedDeptId, setSelectedDeptId] = useState<string>('');

  // Sync state when user prop changes
  React.useEffect(() => {
    if (isOpen && user) {
      const deptId = typeof user.department_id === 'object'
        ? (user.department_id as any)?._id
        : user.department_id;
      setSelectedDeptId(deptId ?? '');
    }
  }, [user, isOpen]);

  const handleSubmit = () => {
    if (!user) return;

    assignMutation.mutate(
      {
        userId: user._id,
        data: {
          department_id: selectedDeptId || null,
        },
      },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign Organization"
      description={`Update ${user?.full_name}'s department assignment.`}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={assignMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <Button
            onClick={handleSubmit}
            disabled={assignMutation.isPending || !selectedDeptId}
            className={cn(
              'h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {assignMutation.isPending ? 'Saving...' : 'Save Assignment'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Department */}
        <div className="space-y-1.5">
          <label htmlFor="user-dept" className="text-sm font-medium text-ink">
            Department {requiredFields.includes('department_id') && <span className="text-red-500">*</span>}
          </label>
          <select
            id="user-dept"
            value={selectedDeptId}
            onChange={(e) => {
              setSelectedDeptId(e.target.value);
            }}
            className={inputClass}
          >
            <option value="" disabled>Select a department</option>
            {(departments ?? []).map((dept: Department) => (
              <option key={dept._id} value={dept._id}>
                {dept.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-ink-muted">
            Primary department for this user.
          </p>
        </div>
      </div>
    </Modal>
  );
};
