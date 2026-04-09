// src/pages/teams/TeamsPage.tsx
import { useState, useMemo } from 'react';
import { Users, Plus, Search, ChevronDown, X, AlertTriangle } from 'lucide-react';
import { useTeams } from '@/features/teams/hooks/useTeams';
import { useCreateTeam } from '@/features/teams/hooks/useCreateTeam';
import { useUpdateTeam } from '@/features/teams/hooks/useUpdateTeam';
import { useDeleteTeam } from '@/features/teams/hooks/useDeleteTeam';
import { TeamTable } from '@/features/teams/components/TeamTable';
import { TeamForm } from '@/features/teams/components/TeamForm';
import type { TeamFormData } from '@/features/teams/components/TeamForm';
import { TeamMembersPanel } from '@/features/teams/components/TeamMembersPanel';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import type { Team } from '@/types';
import { useDepartments } from '@/features/organization/hooks/useDepartments';
import { toast } from 'sonner';
import { apiClient } from '@/lib/apiClient';

interface TeamsFilters {
  search: string;
  department_id: string;
  status: 'active' | 'inactive' | '';
  without_lead: boolean;
}

const DEPARTMENT_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Departments' },
];

/**
 * TeamsPage Component
 * Main page for managing teams within the organization.
 *
 * Features:
 * - Full CRUD works end-to-end (create, edit, archive)
 * - TeamForm validates: name required, department required, manager must be valid user
 * - TeamMembersPanel opens as slide-in sheet showing correct members
 * - Add member searches and filters out existing members
 * - Remove member shows ConfirmDialog before proceeding
 * - Archive blocked in UI if team has members (show error toast with member count)
 * - "Teams Without Manager" warning chip navigates to filtered view
 * - All 4 states handled: loading (TableSkeleton), error (ErrorState), empty (EmptyState), data
 */
export default function TeamsPage() {
  // -- Server data --
  const { data: teams, isLoading, isError, refetch } = useTeams();
  const { data: departments } = useDepartments();

  const createMutation = useCreateTeam();
  const updateMutation = useUpdateTeam();
  const deleteMutation = useDeleteTeam();

  // -- Modal state --
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  // -- Confirm-archive dialog state --
  const [teamToArchive, setTeamToArchive] = useState<Team | null>(null);

  // -- Members panel state --
  const [teamWithMembersOpen, setTeamWithMembersOpen] = useState<Team | null>(null);

  // -- Filters --
  const [filters, setFilters] = useState<TeamsFilters>({
    search: '',
    department_id: '',
    status: 'active',
    without_lead: false,
  });

  // -- Derived: update department filter options --
  const departmentOptions = useMemo(() => {
    if (!departments) return DEPARTMENT_FILTER_OPTIONS;
    return [
      { value: '', label: 'All Departments' },
      ...departments.map((d) => ({ value: d._id, label: d.name })),
    ];
  }, [departments]);

  // -- Derived: apply client-side filtering --
  const filteredTeams = useMemo(() => {
    if (!teams) return [];
    return teams.filter((team) => {
      const matchesSearch =
        !filters.search ||
        team.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        team.slug.toLowerCase().includes(filters.search.toLowerCase()) ||
        (team.description && team.description.toLowerCase().includes(filters.search.toLowerCase()));

      const matchesDepartment =
        !filters.department_id || team.department_id === filters.department_id;

      const matchesStatus =
        !filters.status ||
        (filters.status === 'active' ? team.is_active : !team.is_active);

      const matchesWithoutLead =
        !filters.without_lead || !team.team_lead_id;

      return matchesSearch && matchesDepartment && matchesStatus && matchesWithoutLead;
    });
  }, [teams, filters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.department_id) count++;
    if (filters.status && filters.status !== 'active') count++;
    if (filters.without_lead) count++;
    return count;
  }, [filters]);

  // -- Derived: teams without a team lead --
  const teamsWithoutLeadCount = useMemo(() => {
    if (!teams) return 0;
    return teams.filter((t) => !t.team_lead_id).length;
  }, [teams]);

  // -- Handlers --
  const handleOpenCreate = () => {
    setEditingTeam(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (team: Team) => {
    setEditingTeam(team);
    setIsFormModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsFormModalOpen(false);
    setEditingTeam(null);
  };

  const handleSubmit = (formData: TeamFormData) => {
    const normalized = {
      ...formData,
      department_id: formData.department_id, // Should never be undefined as it's required
      team_lead_id: formData.team_lead_id || null,
    };

    if (editingTeam) {
      updateMutation.mutate(
        { id: editingTeam._id, data: normalized },
        { onSuccess: handleCloseModal }
      );
    } else {
      createMutation.mutate(normalized, {
        onSuccess: handleCloseModal,
      });
    }
  };

  const handleRequestDelete = (id: string) => {
    const team = teams?.find((t) => t._id === id) ?? null;
    setTeamToArchive(team);
  };

  const handleConfirmArchive = async () => {
    if (!teamToArchive) return;

    // Check if team has members before archiving
    try {
      const { data } = await apiClient.get(`/teams/${teamToArchive._id}/members`);
      const memberCount = data?.data?.length ?? 0;

      if (memberCount > 0) {
        toast.error(`Cannot archive team "${teamToArchive.name}" — it has ${memberCount} active member${memberCount > 1 ? 's' : ''}. Remove all members first.`);
        setTeamToArchive(null);
        return;
      }
    } catch {
      // If we can't fetch members, proceed with archive (server will block if needed)
    }

    deleteMutation.mutate(teamToArchive._id, {
      onSuccess: () => setTeamToArchive(null),
      onError: () => setTeamToArchive(null),
    });
  };

  const handleViewMembers = (team: Team) => {
    setTeamWithMembersOpen(team);
  };

  const handleCloseMembersPanel = () => {
    setTeamWithMembersOpen(null);
  };

  // -- Render: Loading --
  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader onCreateClick={handleOpenCreate} onShowWithoutLead={() => {}} />
        <TableSkeleton rows={8} columns={5} />
      </div>
    );
  }

  // -- Render: Error --
  if (isError) {
    return (
      <div className="space-y-5">
        <PageHeader onCreateClick={handleOpenCreate} onShowWithoutLead={() => {}} />
        <ErrorState
          title="Failed to load teams"
          description="Something went wrong fetching your teams data. Please try again."
          onRetry={refetch}
        />
      </div>
    );
  }

  const hasData = teams && teams.length > 0;

  return (
    <div className="space-y-5">
      {/* -- Page Header -- */}
      <PageHeader
        onCreateClick={handleOpenCreate}
        teamCount={teams?.length}
        teamsWithoutLeadCount={teamsWithoutLeadCount}
        onShowWithoutLead={() => setFilters({ search: '', department_id: '', status: 'active', without_lead: true })}
      />

      {/* -- Empty State -- */}
      {!hasData ? (
        <EmptyState
          icon={Users}
          title="No teams yet"
          description="Create your first team to start organizing members into groups."
          action={{ label: 'Create First Team', onClick: handleOpenCreate }}
        />
      ) : (
        <div className="space-y-4">
          {/* -- Filter Bar -- */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder="Search teams..."
                className="w-full h-9 pl-9 pr-8 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              />
              {filters.search && (
                <button
                  onClick={() => setFilters((f) => ({ ...f, search: '' }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Department filter */}
            <div className="relative">
              <select
                value={filters.department_id}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    department_id: e.target.value,
                  }))
                }
                className="h-9 pl-3 pr-8 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 appearance-none cursor-pointer"
              >
                {departmentOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
            </div>

            {/* Status filter */}
            <div className="relative">
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    status: e.target.value as TeamsFilters['status'],
                  }))
                }
                className="h-9 pl-3 pr-8 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 appearance-none cursor-pointer"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Archived</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
            </div>

            {/* Clear filters */}
            {activeFilterCount > 0 && (
              <button
                onClick={() =>
                  setFilters({ search: '', department_id: '', status: 'active', without_lead: false })
                }
                className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
              >
                Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
              </button>
            )}

            {/* Result count */}
            {filters.search || filters.department_id ? (
              <span className="text-xs text-ink-muted">
                {filteredTeams.length} of {teams.length} results
              </span>
            ) : null}
          </div>

          {/* -- Table View -- */}
          {filteredTeams.length === 0 ? (
            <div className="bg-white rounded-lg border border-line shadow-card p-16 text-center">
              <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center mx-auto mb-3">
                <Search className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-ink mb-1">No results found</h3>
              <p className="text-sm text-ink-secondary">
                Try adjusting your search or filter criteria.
              </p>
            </div>
          ) : (
            <TeamTable
              teams={filteredTeams}
              onEdit={handleOpenEdit}
              onDelete={handleRequestDelete}
              onViewMembers={handleViewMembers}
            />
          )}
        </div>
      )}

      {/* -- Create / Edit Modal -- */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={handleCloseModal}
        title={editingTeam ? 'Edit Team' : 'Create Team'}
        description={
          editingTeam
            ? 'Modify team settings and assignments.'
            : 'Add a new team to your organization.'
        }
        footer={
          <>
            <button
              type="button"
              onClick={handleCloseModal}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <Button
              form="team-form"
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className={cn(
                'h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : editingTeam
                ? 'Save Changes'
                : 'Create Team'}
            </Button>
          </>
        }
      >
        <TeamForm
          key={editingTeam?._id ?? 'create'}
          initialData={editingTeam ?? undefined}
          onSubmit={handleSubmit}
          departments={departments ?? []}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />
      </Modal>

      {/* -- Archive (Delete) Confirm Dialog -- */}
      <ConfirmDialog
        isOpen={!!teamToArchive}
        onClose={() => setTeamToArchive(null)}
        onConfirm={handleConfirmArchive}
        title={`Archive "${teamToArchive?.name}"?`}
        description="This team will be soft-deleted (archived). It will no longer appear in the teams list. This action can be reversed by your system administrator."
        confirmLabel="Archive Team"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />

      {/* -- Team Members Panel -- */}
      {teamWithMembersOpen && (
        <TeamMembersPanel
          team={teamWithMembersOpen}
          isOpen={!!teamWithMembersOpen}
          onClose={handleCloseMembersPanel}
        />
      )}
    </div>
  );
}

// -- Sub-components --

interface PageHeaderProps {
  onCreateClick: () => void;
  teamCount?: number;
  teamsWithoutLeadCount?: number;
  onShowWithoutLead: () => void;
}

function PageHeader({ onCreateClick, teamCount, teamsWithoutLeadCount, onShowWithoutLead }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">
          Teams
        </h1>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-sm text-ink-secondary">
            Manage teams and their members across your organization.
          </p>
          {teamCount !== undefined && (
            <span className="text-xs text-ink-muted">
              {teamCount} {teamCount === 1 ? 'team' : 'teams'}
            </span>
          )}
          {teamsWithoutLeadCount !== undefined && teamsWithoutLeadCount > 0 && (
            <button
              onClick={onShowWithoutLead}
              className={cn(
                'inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5',
                'hover:bg-amber-100 transition-colors cursor-pointer'
              )}
              title="Click to filter teams without a lead"
            >
              <AlertTriangle className="w-3 h-3" />
              {teamsWithoutLeadCount} without lead
            </button>
          )}
        </div>
      </div>
      <Button
        onClick={onCreateClick}
        className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-2 flex-shrink-0"
      >
        <Plus className="w-4 h-4" />
        Create Team
      </Button>
    </div>
  );
}
