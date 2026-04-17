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
}

const inputClass = cn(
  'w-full h-9 px-3 text-sm rounded-md border bg-white text-ink',
  'placeholder:text-ink-muted transition-all duration-150',
  'focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/30',
  'border-line'
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
}) => {
  const { data: departments } = useDepartments();
  const { data: teams } = useTeams();
  const assignMutation = useAssignUserOrg();

  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  // Sync state when user prop changes
  React.useEffect(() => {
    if (isOpen && user) {
      const deptId = typeof user.department_id === 'object'
        ? (user.department_id as any)?._id
        : user.department_id;
      setSelectedDeptId(deptId ?? '');
      setSelectedTeamIds(user.teams?.map((t: any) => t._id) ?? []);
    }
  }, [user, isOpen]);

  // Filter teams by selected department
  const availableTeams = useMemo(() => {
    if (!teams || !selectedDeptId) return [];
    return teams.filter((t) => {
      const deptId = typeof t.department_id === 'object' 
        ? (t.department_id as any)?._id 
        : t.department_id;
      return deptId === selectedDeptId;
    });
  }, [teams, selectedDeptId]);

  const handleSubmit = () => {
    if (!user) return;

    assignMutation.mutate(
      {
        userId: user._id,
        data: {
          department_id: selectedDeptId || null,
          team_ids: selectedTeamIds.length > 0 ? selectedTeamIds : null,
        },
      },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign Organization"
      description={`Update ${user?.full_name}'s department and team memberships.`}
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
            {assignMutation.isPending ? 'Saving...' : 'Save Assignments'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Department */}
        <div className="space-y-1.5">
          <label htmlFor="user-dept" className="text-sm font-medium text-ink">
            Department
          </label>
          <select
            id="user-dept"
            value={selectedDeptId}
            onChange={(e) => {
              setSelectedDeptId(e.target.value);
              setSelectedTeamIds([]); // Reset teams when dept changes
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

        {/* Teams */}
        {selectedDeptId && availableTeams.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink">Teams</label>
            <div className="space-y-1 max-h-48 overflow-y-auto border border-line rounded-md p-2">
              {availableTeams.map((team: Team) => (
                <label
                  key={team._id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-surface-alt cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedTeamIds.includes(team._id)}
                    onChange={() => toggleTeam(team._id)}
                    className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
                  />
                  <span className="text-sm text-ink">{team.name}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-ink-muted">
              Select all teams this user should belong to.
            </p>
          </div>
        )}

        {selectedDeptId && availableTeams.length === 0 && (
          <p className="text-xs text-ink-muted">
            No teams available for the selected department.
          </p>
        )}
      </div>
    </Modal>
  );
};
