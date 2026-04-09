// src/features/teams/components/TeamMembersPanel.tsx
import { useState, useMemo } from 'react';
import { Search, UserPlus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useTeamMembers } from '../hooks/useTeamMembers';
import { useAddTeamMember } from '../hooks/useAddTeamMember';
import { useRemoveTeamMember } from '../hooks/useRemoveTeamMember';
import { useUsers } from '@/features/people/hooks/useUsers';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { cn } from '@/utils/cn';
import type { Team, TeamMember } from '@/types';

interface TeamMembersPanelProps {
  team: Team;
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
 * TeamMembersPanel Component
 * Slide-in style panel (implemented as modal) showing team members.
 * Features:
 * - Lists all members with their roles
 * - Add member with search that filters out existing members
 * - Remove member with ConfirmDialog
 * - All 4 states: loading, error, empty, data
 * Used on: TeamsPage (view/edit team members).
 */
export const TeamMembersPanel: React.FC<TeamMembersPanelProps> = ({
  team,
  isOpen,
  onClose,
}) => {
  const { data: members, isLoading: isLoadingMembers, isError: isErrorMembers, refetch } = useTeamMembers(team._id, isOpen);
  const { data: users } = useUsers();

  const addMemberMutation = useAddTeamMember();
  const removeMemberMutation = useRemoveTeamMember();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);

  // Filter out users who are already members of this team
  const availableUsers = useMemo(() => {
    if (!users || !members) return [];
    const memberUserIds = new Set(members.map((m) => m.user_id));
    return users.filter((u) => !memberUserIds.has(u._id));
  }, [users, members]);

  // Filter available users by search query
  const filteredAvailableUsers = useMemo(() => {
    if (!searchQuery) return availableUsers;
    const query = searchQuery.toLowerCase();
    return availableUsers.filter(
      (u) =>
        u.full_name.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        u.employee_id.toLowerCase().includes(query)
    );
  }, [availableUsers, searchQuery]);

  const handleAddMember = () => {
    if (!selectedUserId) return;
    addMemberMutation.mutate(
      { teamId: team._id, data: { user_id: selectedUserId, role: 'member' } },
      {
        onSuccess: () => {
          setSelectedUserId('');
          setSearchQuery('');
        },
      }
    );
  };

  const handleRemoveMember = (member: TeamMember) => {
    setMemberToRemove(member);
  };

  const handleConfirmRemove = () => {
    if (!memberToRemove) return;
    removeMemberMutation.mutate(
      { teamId: team._id, memberId: memberToRemove._id },
      {
        onSuccess: () => setMemberToRemove(null),
        onError: () => setMemberToRemove(null),
      }
    );
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`${team.name} — Members`}
        description="Manage team members and their roles."
        size="lg"
        footer={
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
          >
            Close
          </button>
        }
      >
        <div className="space-y-6">
          {/* Add Member Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Add Member</h3>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users by name, email, or employee ID..."
                  className={inputClass}
                />
              </div>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              >
                <option value="">Select user...</option>
                {filteredAvailableUsers.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.full_name} ({user.email})
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddMember}
                disabled={!selectedUserId || addMemberMutation.isPending}
                className="h-9 px-3 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 flex-shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                Add
              </button>
            </div>
            {filteredAvailableUsers.length === 0 && searchQuery && (
              <p className="text-xs text-ink-muted">
                No users found matching "{searchQuery}".
              </p>
            )}
            {availableUsers.length === 0 && !searchQuery && (
              <p className="text-xs text-ink-muted">
                All users are already members of this team.
              </p>
            )}
          </div>

          {/* Members List */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">
              Team Members ({members?.length ?? 0})
            </h3>

            {isLoadingMembers ? (
              <TableSkeleton rows={4} columns={4} />
            ) : isErrorMembers ? (
              <ErrorState
                title="Failed to load members"
                description="Something went wrong. Please try again."
                onRetry={() => refetch()}
              />
            ) : !members || members.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title="No members yet"
                description="Add users to this team using the form above."
              />
            ) : (
              <div className="space-y-2">
                {members.map((member) => {
                  const user = member.user;
                  if (!user) return null;

                  return (
                    <div
                      key={member._id}
                      className="flex items-center justify-between p-3 bg-white border border-line rounded-lg hover:bg-surface-alt transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              className="w-full h-full rounded-full object-cover"
                              alt=""
                              width={36}
                              height={36}
                            />
                          ) : (
                            <span className="text-xs font-bold text-primary">
                              {user.full_name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-ink truncate">
                            {user.full_name}
                          </span>
                          <span className="text-xs text-ink-muted truncate">
                            {user.email} · {user.employee_id}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary-light text-primary">
                          {member.role}
                        </span>
                        <button
                          onClick={() => handleRemoveMember(member)}
                          className="h-7 w-7 flex items-center justify-center rounded-md text-ink-secondary hover:text-red-600 hover:bg-red-50 transition-colors"
                          aria-label={`Remove ${user.full_name}`}
                          title="Remove Member"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Remove Member Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!memberToRemove}
        onClose={() => setMemberToRemove(null)}
        onConfirm={handleConfirmRemove}
        title={`Remove "${memberToRemove?.user?.full_name}" from team?`}
        description="This user will no longer be part of this team. This action can be reversed by adding them back."
        confirmLabel="Remove Member"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={removeMemberMutation.isPending}
      />
    </>
  );
};
