// src/pages/people/UserDetailPage.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { UserHistoryPanel } from '@/features/people/components/UserHistoryPanel';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { History, ArrowLeft, Users, Edit2, Mail, RefreshCw, Monitor, PlaneTakeoff } from 'lucide-react';
import { useUserDetail } from '@/features/people/hooks/useUserDetail';
import { useResendInvite } from '@/features/people/hooks/useResendInvite';
import { useCallback, useState } from 'react';
import { ReportingLinesPanel } from '@/features/people/components/ReportingLinesPanel';
import { EffectivePermissionsPanel } from '@/features/people/components/EffectivePermissionsPanel';
import { UserAppAccessPanel } from '@/features/people/components/UserAppAccessPanel';
import { UserDelegatesPanel } from '@/features/people/components/UserDelegatesPanel';

import { useUpdateUser } from '@/features/people/hooks/useUpdateUser';
import { useDepartments } from '@/features/organization/hooks/useDepartments';
import { useLocations } from '@/features/locations/hooks/useLocations';
import { useFormMetadata } from '@/features/people/hooks/useFormMetadata';
import { UserForm, type UserFormData } from '@/features/people/components/UserForm';
import { Modal } from '@/components/ui/Modal';

import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/utils/cn';

/**
 * UserDetailPage Component
 * Displays detailed information about a user including their reporting structure.
 * Shows user profile, primary manager, secondary managers, and direct reports.
 * 
 * Route: /people/:id
 */
export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: user, isLoading, isError, refetch } = useUserDetail(id!);
  const resendInvite = useResendInvite();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const updateUser = useUpdateUser(id!);
  const { data: departments = [] } = useDepartments();
  const { data: locations = [] } = useLocations();
  const { data: formMetadata } = useFormMetadata();

  const handleResendInvite = useCallback(() => {
    if (user) {
      resendInvite.mutate(user._id);
    }
  }, [resendInvite, user]);

  const handleEditSubmit = useCallback(
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
          setIsEditModalOpen(false);
        },
      });
    },
    [updateUser]
  );

  if (!id) {
    return (
      <ErrorState
        title="Invalid User ID"
        description="The user ID is missing or invalid."
        onRetry={() => navigate(ROUTES.PEOPLE)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(ROUTES.PEOPLE)}
            className="h-9 w-9 flex items-center justify-center rounded-md hover:bg-surface-alt transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-ink-secondary" />
          </button>
          <div>
            <div className="h-6 bg-surface-alt rounded animate-pulse w-48 mb-2" />
            <div className="h-3 bg-surface-alt rounded animate-pulse w-32" />
          </div>
        </div>
        <TableSkeleton rows={3} columns={1} />
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(ROUTES.PEOPLE)}
            className="h-9 w-9 flex items-center justify-center rounded-md hover:bg-surface-alt transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-ink-secondary" />
          </button>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">User Details</h1>
        </div>
        {!user ? (
          <EmptyState
            icon={Users}
            title="User not found"
            description="This user may have been archived or does not exist."
            action={{ label: 'Back to People', onClick: () => navigate(ROUTES.PEOPLE) }}
          />
        ) : (
          <ErrorState
            title="Failed to load user details"
            description="Something went wrong fetching user data. Please try again."
            onRetry={refetch}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Page Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate(ROUTES.PEOPLE)}
            className="h-9 w-9 flex items-center justify-center rounded-md hover:bg-surface-alt transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-ink-secondary" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[22px] font-semibold tracking-tight text-ink">
                {user.full_name}
              </h1>
              <LifecycleStateBadge state={user.lifecycle_state} />
            </div>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-sm text-ink-secondary">{user.email}</p>
              {user.employee_id && (
                <>
                  <span className="text-ink-muted">·</span>
                  <span className="text-sm text-ink-muted">{user.employee_id}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user.lifecycle_state === 'invited' && (
            <button
              onClick={handleResendInvite}
              disabled={resendInvite.isPending}
              className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Mail className="w-4 h-4" />
              Resend Invite
            </button>
          )}
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors flex items-center gap-2"
          >
            <Edit2 className="w-4 h-4" />
            Edit User
          </button>
        </div>
      </div>

      {/* ── User Info Cards ── */}
      <div className="grid grid-cols-4 gap-4">
        <InfoCard label="Department" value={user.department?.name || 'Not assigned'} />
        <InfoCard label="Employment Type" value={formatEmploymentType(user.employment_type)} />
        <InfoCard label="Location" value={user.location ? `${user.location.name} (${user.location.timezone})` : 'Not assigned'} />
        <InfoCard
          label="Hire Date"
          value={user.hire_date ? formatDate(user.hire_date) : 'Not set'}
        />
      </div>

      {/* ── Reporting Lines Panel ── */}
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-5 h-5 text-ink-secondary" />
        <h2 className="text-base font-semibold text-ink">Reporting Structure</h2>
      </div>
      <ReportingLinesPanel userId={user._id} />

      {/* ── Effective Permissions Panel ── */}
      <div className="pt-4">
        <EffectivePermissionsPanel userId={user._id} />
      </div>

      {/* ── App Access Panel ── */}
      <div className="flex items-center gap-2 mb-2 pt-4">
        <Monitor className="w-5 h-5 text-ink-secondary" />
        <h2 className="text-base font-semibold text-ink">App Access History</h2>
      </div>
      <UserAppAccessPanel userId={user._id} />

      {/* ── Delegates Panel ── */}
      <div className="flex items-center gap-2 mb-2 pt-4">
        <PlaneTakeoff className="w-5 h-5 text-ink-secondary" />
        <h2 className="text-base font-semibold text-ink">Approval Delegates</h2>
      </div>
      <UserDelegatesPanel userId={user._id} />

      {/* ── History Panel ── */}
      <div className="flex items-center gap-2 mb-2 pt-4">
        <History className="w-5 h-5 text-ink-secondary" />
        <h2 className="text-base font-semibold text-ink">User History</h2>
      </div>
      <UserHistoryPanel userId={user._id} />

      {/* ── Edit Modal ── */}
      {isEditModalOpen && (
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Edit User"
          description={`Update profile for ${user.full_name}`}
          size="md"
          footer={
            <>
              <button
                onClick={() => setIsEditModalOpen(false)}
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
            initialData={user}
            onSubmit={handleEditSubmit}
            departments={departments}
            locations={locations}
            requiredFields={formMetadata?.required_fields || ['email', 'full_name']}
          />
        </Modal>
      )}
    </div>
  );
}


// ── Sub-components ─────────────────────────────────────────────────────────

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-line shadow-card p-4">
      <p className="text-xs font-medium text-ink-secondary mb-1">{label}</p>
      <p className="text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function LifecycleStateBadge({ state }: { state: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    invited: { bg: 'bg-primary-light', text: 'text-primary', label: 'Invited' },
    onboarding: { bg: 'bg-sky-50', text: 'text-sky-600', label: 'Onboarding' },
    active: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Active' },
    probation: { bg: 'bg-violet-50', text: 'text-violet-600', label: 'Probation' },
    on_leave: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'On Leave' },
    terminated: { bg: 'bg-red-50', text: 'text-red-600', label: 'Terminated' },
    archived: { bg: 'bg-surface-alt', text: 'text-ink-muted', label: 'Archived' },
  };

  const stateConfig = config[state] || config.archived;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2.5 py-0.5 tracking-wide',
        stateConfig.bg,
        stateConfig.text,
        'border-current'
      )}
    >
      {stateConfig.label}
    </span>
  );
}

function formatEmploymentType(type: string): string {
  const map: Record<string, string> = {
    full_time: 'Full Time',
    part_time: 'Part Time',
    contractor: 'Contractor',
    intern: 'Intern',
  };
  return map[type] || type;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
