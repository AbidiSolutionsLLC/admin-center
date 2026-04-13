// src/pages/people/PeoplePage.tsx
import { useState, useMemo, useCallback } from 'react';
import {
  Users, UserPlus, Search, ChevronDown, X, RefreshCw,
  Download, UserCheck, ArrowRightCircle,
} from 'lucide-react';
import { useUsers, useBulkLifecycleChange, useBulkAssignRole, useExportUsers } from '@/features/people/hooks/useUsers';
import { useUpdateUser } from '@/features/people/hooks/useUpdateUser';
import { useUpdateLifecycle } from '@/features/people/hooks/useUpdateLifecycle';
import { useUserStats } from '@/features/people/hooks/useUserStats';
import { useDepartments } from '@/features/organization/hooks/useDepartments';
import { useLocations } from '@/features/locations/hooks/useLocations';
import { useRoles } from '@/features/roles/useRoles';
import { UserTable } from '@/features/people/components/UserTable';
import { InviteModal } from '@/features/people/components/InviteModal';
import { UserOrgAssignmentModal } from '@/features/people/components/UserOrgAssignmentModal';
import { UserForm, type UserFormData } from '@/features/people/components/UserForm';
import { LifecycleStateSelector } from '@/features/people/components/LifecycleStateSelector';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import type { User, LifecycleState, EmploymentType, Department, Location } from '@/types';
import { cn } from '@/utils/cn';
import { toast } from 'sonner';

const LIFECYCLE_STATE_OPTIONS: { value: LifecycleState | ''; label: string }[] = [
  { value: '', label: 'All States' },
  { value: 'invited', label: 'Invited' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'active', label: 'Active' },
  { value: 'probation', label: 'Probation' },
  { value: 'on_leave', label: 'On Leave' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'archived', label: 'Archived' },
];

const EMPLOYMENT_TYPE_OPTIONS: { value: EmploymentType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'intern', label: 'Intern' },
];

interface UserFilters {
  search: string;
  lifecycle_state: LifecycleState | '';
  department_id: string;
  employment_type: EmploymentType | '';
  location_id: string;
}

/**
 * PeoplePage Component
 * Main page for managing users in the organization.
 *
 * Features:
 * - Full CRUD (invite, view profile, edit, change lifecycle)
 * - Filter by search, lifecycle state, department, employment type
 * - Stats row with live counts (Total, Active, Invited, On Leave, Terminated)
 * - Bulk invite supports 500-row CSV
 * - Lifecycle change fires correct automation
 * - All 4 states: loading, error, empty, data
 */
export default function PeoplePage() {
  // ── Filters ──────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<UserFilters>({
    search: '',
    lifecycle_state: '',
    department_id: '',
    employment_type: '',
    location_id: '',
  });

  // ── Server data ──────────────────────────────────────────────────────
  const { data: users, isLoading, isError, refetch } = useUsers();
  const { data: departments = [] } = useDepartments();
  const { data: locations = [] } = useLocations();
  const { data: roles = [] } = useRoles();
  const { data: stats, isLoading: statsLoading } = useUserStats();

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter((user) => {
      const matchesSearch =
        !filters.search ||
        user.full_name.toLowerCase().includes(filters.search.toLowerCase()) ||
        user.email.toLowerCase().includes(filters.search.toLowerCase()) ||
        user.employee_id.toLowerCase().includes(filters.search.toLowerCase());

      const matchesLifecycleState =
        !filters.lifecycle_state || user.lifecycle_state === filters.lifecycle_state;

      const matchesDepartment =
        !filters.department_id || user.department_id === filters.department_id;

      const matchesEmploymentType =
        !filters.employment_type || user.employment_type === filters.employment_type;

      const matchesLocation =
        !filters.location_id || user.location_id === filters.location_id;

      return (
        matchesSearch &&
        matchesLifecycleState &&
        matchesDepartment &&
        matchesEmploymentType &&
        matchesLocation
      );
    });
  }, [users, filters]);

  const activeFilterCount = [
    filters.search,
    filters.lifecycle_state,
    filters.department_id,
    filters.employment_type,
    filters.location_id,
  ].filter(Boolean).length;

  const exportMutation = useExportUsers({
    lifecycle_state: filters.lifecycle_state || undefined,
    department_id: filters.department_id || undefined,
    employment_type: filters.employment_type || undefined,
  });

  // ── Selection & Bulk mutations ──────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bulkLifecycle = useBulkLifecycleChange();
  const bulkRole = useBulkAssignRole();

  const isAllSelected = useMemo(() => {
    if (!users || users.length === 0) return false;
    return filteredUsers.length > 0 && filteredUsers.every((u) => selectedIds.has(u._id));
  }, [users, filteredUsers, selectedIds]);

  // ── Modal state ──────────────────────────────────────────────────────
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [assigningOrgUser, setAssigningOrgUser] = useState<User | null>(null);
  const [changingLifecycleUser, setChangingLifecycleUser] = useState<User | null>(null);

  // ── Bulk action modal targets ──────────────────────────────────────
  const [bulkAction, setBulkAction] = useState<'lifecycle' | 'role' | null>(null);
  const [bulkLifecycleTarget, setBulkLifecycleTarget] = useState<LifecycleState | ''>('');
  const [bulkRoleTarget, setBulkRoleTarget] = useState('');

  // ── Handlers ─────────────────────────────────────────────────────────
  const toggleRow = useCallback((userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredUsers.map((u) => u._id)));
    }
  }, [isAllSelected, filteredUsers]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBulkLifecycle = useCallback(() => {
    if (!bulkLifecycleTarget || selectedIds.size === 0) return;
    bulkLifecycle.mutate(
      { user_ids: Array.from(selectedIds), lifecycle_state: bulkLifecycleTarget },
      {
        onSuccess: () => {
          setBulkAction(null);
          setBulkLifecycleTarget('');
          clearSelection();
        },
      }
    );
  }, [bulkLifecycleTarget, selectedIds, bulkLifecycle, clearSelection]);

  const handleBulkRole = useCallback(() => {
    if (!bulkRoleTarget || selectedIds.size === 0) return;
    bulkRole.mutate(
      { user_ids: Array.from(selectedIds), role_id: bulkRoleTarget },
      {
        onSuccess: () => {
          setBulkAction(null);
          setBulkRoleTarget('');
          clearSelection();
        },
      }
    );
  }, [bulkRoleTarget, selectedIds, bulkRole, clearSelection]);

  const handleExport = useCallback(() => {
    exportMutation.mutate();
  }, [exportMutation]);

  const handleOpenInvite = useCallback(() => {
    setIsInviteModalOpen(true);
  }, []);

  const handleCloseInvite = useCallback(() => {
    setIsInviteModalOpen(false);
  }, []);

  const handleOpenEdit = useCallback((user: User) => {
    setEditingUser(user);
  }, []);

  const handleCloseEdit = useCallback(() => {
    setEditingUser(null);
  }, []);

  const handleOpenAssignOrg = useCallback((user: User) => {
    setAssigningOrgUser(user);
  }, []);

  const handleCloseAssignOrg = useCallback(() => {
    setAssigningOrgUser(null);
  }, []);

  const handleOpenLifecycleChange = useCallback((user: User) => {
    setChangingLifecycleUser(user);
  }, []);

  const handleCloseLifecycleChange = useCallback(() => {
    setChangingLifecycleUser(null);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters({
      search: '',
      lifecycle_state: '',
      department_id: '',
      employment_type: '',
      location_id: '',
    });
  }, []);


  // ── Render: Loading ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader onInviteClick={handleOpenInvite} />
        <StatsSkeleton />
        <TableSkeleton rows={8} columns={7} />
      </div>
    );
  }

  // ── Render: Error ────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-5">
        <PageHeader onInviteClick={handleOpenInvite} />
        <ErrorState
          title="Failed to load users"
          description="Something went wrong fetching user data. Please try again."
          onRetry={refetch}
        />
      </div>
    );
  }

  const hasData = users && users.length > 0;

  return (
    <div className="space-y-5">
      {/* ── Page Header ── */}
      <PageHeader
        onInviteClick={handleOpenInvite}
        userCount={users?.length}
      />

      {/* ── Empty State ── */}
      {!hasData ? (
        <EmptyState
          icon={Users}
          title="No users yet"
          description="Invite your first team member to get started."
          action={{ label: 'Invite User', onClick: handleOpenInvite }}
        />
      ) : (
        <>
          {/* ── Stats Row ── */}
          <StatsRow stats={stats} isLoading={statsLoading} />

          {/* ── Filter Bar ── */}
          <FilterBar
            filters={filters}
            onFilterChange={setFilters}
            onClearFilters={handleClearFilters}
            activeFilterCount={activeFilterCount}
            departments={departments}
            locations={locations}
          />

          {/* ── User Table ── */}
          {filteredUsers.length === 0 ? (
            <div className="bg-white rounded-lg border border-line shadow-card p-16 text-center">
              <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center mx-auto mb-3">
                <Search className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-ink mb-1">No results found</h3>
              <p className="text-sm text-ink-secondary">
                Try adjusting your search or filter criteria.
              </p>
              <button
                onClick={handleClearFilters}
                className="mt-4 h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <>
              {/* ── Bulk Action Bar ── */}
              {selectedIds.size > 0 && (
                <BulkActionBar
                  selectedCount={selectedIds.size}
                  onClearSelection={clearSelection}
                  onChangeLifecycle={() => setBulkAction('lifecycle')}
                  onAssignRole={() => setBulkAction('role')}
                  onExport={handleExport}
                />
              )}

              <UserTable
                users={filteredUsers}
                onEdit={handleOpenEdit}
                onAssignOrg={handleOpenAssignOrg}
                onChangeState={handleOpenLifecycleChange}
                selectedIds={selectedIds}
                onToggleRow={toggleRow}
                onToggleAll={toggleAll}
                isAllSelected={isAllSelected}
              />
            </>
          )}
        </>
      )}

      {/* ── Invite Modal ── */}
      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={handleCloseInvite}
        departments={departments}
      />

      {/* ── Edit User Modal ── */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          isOpen={!!editingUser}
          onClose={handleCloseEdit}
          departments={departments}
          locations={locations}
        />
      )}

      {/* ── Organization Assignment Modal ── */}
      {assigningOrgUser && (
        <UserOrgAssignmentModal
          user={assigningOrgUser}
          isOpen={!!assigningOrgUser}
          onClose={handleCloseAssignOrg}
        />
      )}


      {/* ── Lifecycle Change Modal ── */}
      {changingLifecycleUser && (
        <LifecycleChangeModal
          user={changingLifecycleUser}
          isOpen={!!changingLifecycleUser}
          onClose={handleCloseLifecycleChange}
        />
      )}

      {/* ── Bulk Lifecycle Modal ── */}
      {bulkAction === 'lifecycle' && (
        <BulkLifecycleModal
          isOpen={bulkAction === 'lifecycle'}
          onClose={() => { setBulkAction(null); setBulkLifecycleTarget(''); }}
          selectedCount={selectedIds.size}
          onSubmit={handleBulkLifecycle}
          targetState={bulkLifecycleTarget}
          onTargetChange={setBulkLifecycleTarget}
          isPending={bulkLifecycle.isPending}
        />
      )}

      {/* ── Bulk Role Modal ── */}
      {bulkAction === 'role' && (
        <BulkRoleModal
          isOpen={bulkAction === 'role'}
          onClose={() => { setBulkAction(null); setBulkRoleTarget(''); }}
          selectedCount={selectedIds.size}
          onSubmit={handleBulkRole}
          targetRole={bulkRoleTarget}
          onTargetChange={setBulkRoleTarget}
          isPending={bulkRole.isPending}
          roles={roles}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface PageHeaderProps {
  onInviteClick: () => void;
  userCount?: number;
}

function PageHeader({ onInviteClick, userCount }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">
          People
        </h1>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-sm text-ink-secondary">
            Manage your team members, roles, and access.
          </p>
          {userCount !== undefined && (
            <span className="text-xs text-ink-muted">
              {userCount} {userCount === 1 ? 'user' : 'users'}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onInviteClick}
        className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-2 flex-shrink-0"
      >
        <UserPlus className="w-4 h-4" />
        Invite User
      </button>
    </div>
  );
}

interface StatsRowProps {
  stats: { total: number; active: number; invited: number; on_leave: number; terminated: number } | undefined;
  isLoading: boolean;
}

function StatsRow({ stats, isLoading }: StatsRowProps) {
  if (isLoading || !stats) {
    return <StatsSkeleton />;
  }

  const statItems = [
    { label: 'Total', value: stats.total, icon: Users, color: 'text-ink' },
    { label: 'Active', value: stats.active, icon: Users, color: 'text-emerald-600' },
    { label: 'Invited', value: stats.invited, icon: Users, color: 'text-sky-600' },
    { label: 'On Leave', value: stats.on_leave, icon: Users, color: 'text-amber-600' },
    { label: 'Terminated', value: stats.terminated, icon: Users, color: 'text-red-600' },
  ];

  return (
    <div className="grid grid-cols-5 gap-4">
      {statItems.map((item) => (
        <div
          key={item.label}
          className="bg-white rounded-lg border border-line shadow-card p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-ink-secondary">{item.label}</span>
            <item.icon className={cn('w-4 h-4', item.color)} />
          </div>
          <div className={cn('text-[28px] font-bold tracking-tight leading-none', item.color)}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-lg border border-line shadow-card p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="h-3 bg-skeleton rounded animate-pulse w-16" />
            <div className="w-4 h-4 bg-skeleton rounded animate-pulse" />
          </div>
          <div className="h-8 bg-skeleton rounded animate-pulse w-12" />
        </div>
      ))}
    </div>
  );
}

interface FilterBarProps {
  filters: UserFilters;
  onFilterChange: (filters: UserFilters) => void;
  onClearFilters: () => void;
  activeFilterCount: number;
  departments: Department[];
  locations: Location[];
}

function FilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  activeFilterCount,
  departments,
  locations,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
          placeholder="Search users..."
          className="w-full h-9 pl-9 pr-8 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
        />
        {filters.search && (
          <button
            onClick={() => onFilterChange({ ...filters, search: '' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Lifecycle state filter */}
      <div className="relative">
        <select
          value={filters.lifecycle_state}
          onChange={(e) =>
            onFilterChange({
              ...filters,
              lifecycle_state: e.target.value as UserFilters['lifecycle_state'],
            })
          }
          className="h-9 pl-3 pr-8 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 appearance-none cursor-pointer"
        >
          {LIFECYCLE_STATE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
      </div>

      {/* Department filter */}
      <div className="relative">
        <select
          value={filters.department_id}
          onChange={(e) =>
            onFilterChange({ ...filters, department_id: e.target.value })
          }
          className="h-9 pl-3 pr-8 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 appearance-none cursor-pointer"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d._id} value={d._id}>
              {d.name}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
      </div>

      {/* Location filter */}
      <div className="relative">
        <select
          value={filters.location_id}
          onChange={(e) =>
            onFilterChange({ ...filters, location_id: e.target.value })
          }
          className="h-9 pl-3 pr-8 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 appearance-none cursor-pointer"
        >
          <option value="">All Locations</option>
          {locations.map((loc) => (
            <option key={loc._id} value={loc._id}>
              {loc.name}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
      </div>

      {/* Employment type filter */}
      <div className="relative">
        <select
          value={filters.employment_type}
          onChange={(e) =>
            onFilterChange({
              ...filters,
              employment_type: e.target.value as UserFilters['employment_type'],
            })
          }
          className="h-9 pl-3 pr-8 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 appearance-none cursor-pointer"
        >
          {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
      </div>

      {/* Clear filters */}
      {activeFilterCount > 0 && (
        <button
          onClick={onClearFilters}
          className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
        >
          Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}

interface EditUserModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  locations: Location[];
}

function EditUserModal({ user, isOpen, onClose, departments, locations }: EditUserModalProps) {
  const updateUser = useUpdateUser(user._id);

  const handleSubmit = useCallback(
    (formData: UserFormData & { custom_fields?: Record<string, unknown> }) => {
      const normalized = {
        ...formData,
        department_id: formData.department_id || null,
        team_id: formData.team_id || null,
        manager_id: formData.manager_id || null,
        location_id: formData.location_id || null,
        hire_date: formData.hire_date || null,
        phone: formData.phone || null,
        custom_fields: formData.custom_fields || {},
      };

      updateUser.mutate(normalized, {
        onSuccess: () => {
          toast.success('User updated successfully');
          onClose();
        },
        onError: () => {
          toast.error('Failed to update user. Please try again.');
        },
      });
    },
    [updateUser, onClose]
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit User"
      description={`Update profile for ${user.full_name}`}
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={updateUser.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            form="user-form"
            type="submit"
            disabled={updateUser.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {updateUser.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </>
      }
    >
      <UserForm
        key={user._id}
        initialData={user}
        onSubmit={handleSubmit}
        departments={departments}
        locations={locations}
        isSubmitting={updateUser.isPending}
      />
    </Modal>
  );
}

interface LifecycleChangeModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
}

function LifecycleChangeModal({ user, isOpen, onClose }: LifecycleChangeModalProps) {
  const updateLifecycle = useUpdateLifecycle(user._id);

  const handleTransition = useCallback(
    (nextState: LifecycleState) => {
      updateLifecycle.mutate(
        { lifecycle_state: nextState },
        {
          onSuccess: () => {
            toast.success(`User transitioned to ${nextState}`);
            onClose();
          },
          onError: () => {
            toast.error('Failed to change lifecycle state. Please try again.');
          },
        }
      );
    },
    [updateLifecycle, onClose]
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Change Lifecycle State"
      description={`Current state: ${user.lifecycle_state} for ${user.full_name}`}
      size="md"
      footer={
        <button
          onClick={onClose}
          className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
        >
          Close
        </button>
      }
    >
      <LifecycleStateSelector
        user={user}
        onTransition={handleTransition}
        isPending={updateLifecycle.isPending}
      />
    </Modal>
  );
}

// ── Bulk Action Bar ───────────────────────────────────────────────────────

interface BulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onChangeLifecycle: () => void;
  onAssignRole: () => void;
  onExport: () => void;
}

function BulkActionBar({ selectedCount, onClearSelection, onChangeLifecycle, onAssignRole, onExport }: BulkActionBarProps) {
  return (
    <div className="bg-white rounded-lg border border-line shadow-card px-4 py-3 flex items-center gap-3">
      <span className="text-sm font-medium text-ink">
        {selectedCount} selected
      </span>
      <div className="h-5 w-px bg-line" />
      <button
        onClick={onChangeLifecycle}
        className="h-8 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors inline-flex items-center gap-1.5"
      >
        <ArrowRightCircle className="w-3.5 h-3.5" />
        Change State
      </button>
      <button
        onClick={onAssignRole}
        className="h-8 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors inline-flex items-center gap-1.5"
      >
        <UserCheck className="w-3.5 h-3.5" />
        Assign Role
      </button>
      <button
        onClick={onExport}
        className="h-8 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors inline-flex items-center gap-1.5 ml-auto"
      >
        <Download className="w-3.5 h-3.5" />
        Export CSV
      </button>
      <button
        onClick={onClearSelection}
        className="h-8 px-3 text-xs font-medium rounded-md text-ink-secondary hover:text-ink transition-colors"
      >
        Clear
      </button>
    </div>
  );
}

// ── Bulk Lifecycle Modal ──────────────────────────────────────────────────

interface BulkLifecycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  onSubmit: () => void;
  targetState: LifecycleState | '';
  onTargetChange: (state: LifecycleState | '') => void;
  isPending: boolean;
}

function BulkLifecycleModal({ isOpen, onClose, selectedCount, onSubmit, targetState, onTargetChange, isPending }: BulkLifecycleModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Change Lifecycle State"
      description={`Apply a state transition to ${selectedCount} selected users. Invalid transitions will be skipped.`}
      size="md"
      footer={
        <>
          <button onClick={onClose} disabled={isPending} className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isPending || !targetState}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <ArrowRightCircle className="w-4 h-4" />
            {isPending ? 'Processing...' : `Apply to ${selectedCount} Users`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">
            Target State <span className="text-error">*</span>
          </label>
          <select
            value={targetState}
            onChange={(e) => onTargetChange(e.target.value as LifecycleState | '')}
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          >
            <option value="">Select target state...</option>
            {LIFECYCLE_STATE_OPTIONS.filter((o) => o.value !== '').map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="p-3 bg-warning-light border border-warning-border rounded-md">
          <p className="text-xs text-warning">
            <strong>Note:</strong> Each user is validated individually. Invalid transitions (e.g., archived → active) will be skipped with an error count shown in the result toast.
          </p>
        </div>
      </div>
    </Modal>
  );
}

// ── Bulk Role Assign Modal ────────────────────────────────────────────────

interface BulkRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  onSubmit: () => void;
  targetRole: string;
  onTargetChange: (roleId: string) => void;
  isPending: boolean;
  roles: Array<{ _id: string; name: string }>;
}

function BulkRoleModal({ isOpen, onClose, selectedCount, onSubmit, targetRole, onTargetChange, isPending, roles }: BulkRoleModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Assign Role"
      description={`Assign a role to ${selectedCount} selected users. Users who already have this role will be skipped.`}
      size="md"
      footer={
        <>
          <button onClick={onClose} disabled={isPending} className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isPending || !targetRole}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <UserCheck className="w-4 h-4" />
            {isPending ? 'Processing...' : `Assign to ${selectedCount} Users`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">
            Role <span className="text-error">*</span>
          </label>
          <select
            value={targetRole}
            onChange={(e) => onTargetChange(e.target.value)}
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          >
            <option value="">Select role...</option>
            {roles.map((role) => (
              <option key={role._id} value={role._id}>
                {role.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}
