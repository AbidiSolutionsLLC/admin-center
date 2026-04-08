// src/pages/people/PeoplePage.tsx
import { useState, useMemo, useCallback } from 'react';
import { Users, UserPlus, Search, ChevronDown, X, Edit2, RefreshCw } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { useUsers } from '@/features/people/hooks/useUsers';
import { useUserDetail } from '@/features/people/hooks/useUserDetail';
import { useUpdateUser } from '@/features/people/hooks/useUpdateUser';
import { useUpdateLifecycle } from '@/features/people/hooks/useUpdateLifecycle';
import { useUserStats } from '@/features/people/hooks/useUserStats';
import { useDepartments } from '@/features/organization/hooks/useDepartments';
import { UserTable } from '@/features/people/components/UserTable';
import { InviteModal } from '@/features/people/components/InviteModal';
import { UserForm, type UserFormData } from '@/features/people/components/UserForm';
import { LifecycleStateSelector } from '@/features/people/components/LifecycleStateSelector';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import type { User, LifecycleState, EmploymentType, Department, DepartmentFilters } from '@/types';
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
  // ── Server data ──────────────────────────────────────────────────────
  const { data: users, isLoading, isError, refetch } = useUsers();
  const { data: departments = [] } = useDepartments();
  const { data: stats, isLoading: statsLoading } = useUserStats();

  // ── Modal state ──────────────────────────────────────────────────────
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [changingLifecycleUser, setChangingLifecycleUser] = useState<User | null>(null);

  // ── Filters ──────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<UserFilters>({
    search: '',
    lifecycle_state: '',
    department_id: '',
    employment_type: '',
  });

  // ── Derived: apply client-side filtering ─────────────────────────────
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

      return (
        matchesSearch &&
        matchesLifecycleState &&
        matchesDepartment &&
        matchesEmploymentType
      );
    });
  }, [users, filters]);

  const activeFilterCount = [
    filters.search,
    filters.lifecycle_state,
    filters.department_id,
    filters.employment_type,
  ].filter(Boolean).length;

  // ── Handlers ─────────────────────────────────────────────────────────
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
            <UserTable
              users={filteredUsers}
              onEdit={handleOpenEdit}
              onChangeState={handleOpenLifecycleChange}
            />
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
            <div className="h-3 bg-[#EDF0F5] rounded animate-pulse w-16" />
            <div className="w-4 h-4 bg-[#EDF0F5] rounded animate-pulse" />
          </div>
          <div className="h-8 bg-[#EDF0F5] rounded animate-pulse w-12" />
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
}

function FilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  activeFilterCount,
  departments,
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
}

function EditUserModal({ user, isOpen, onClose, departments }: EditUserModalProps) {
  const updateUser = useUpdateUser(user._id);

  const handleSubmit = useCallback(
    (formData: UserFormData) => {
      const normalized = {
        ...formData,
        department_id: formData.department_id || null,
        team_id: formData.team_id || null,
        manager_id: formData.manager_id || null,
        location_id: formData.location_id || null,
        hire_date: formData.hire_date || null,
        phone: formData.phone || null,
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
