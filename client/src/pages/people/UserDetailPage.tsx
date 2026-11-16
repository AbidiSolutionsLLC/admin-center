// src/pages/people/UserDetailPage.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { UserHistoryPanel } from '@/features/people/components/UserHistoryPanel';
import { History, Users, Edit2, RefreshCw, PlaneTakeoff, Clock, CalendarDays, FileText, Briefcase, MapPin, ShieldAlert, Lock, ArrowRight, WifiOff } from 'lucide-react';
import { useUserDetail } from '@/features/people/hooks/useUserDetail';
import { useUnlockUser } from '@/features/people/hooks/useUnlockUser';
import { useResendInvite } from '@/features/people/hooks/useResendInvite';
import { useCallback, useState } from 'react';
import { ReportingLinesPanel } from '@/features/people/components/ReportingLinesPanel';
import { EffectivePermissionsPanel } from '@/features/people/components/EffectivePermissionsPanel';
import { UserDelegatesPanel } from '@/features/people/components/UserDelegatesPanel';
import { UserProductAccessTab } from '@/features/people/components/UserProductAccessTab';
import { InvitationPanel } from '@/features/people/components/InvitationPanel';
import { UserSecurityPanel } from '@/features/people/components/UserSecurityPanel';
import { OffboardingModal } from '@/features/people/components/OffboardingModal';
import { formatTimeInTimezone, getTimezoneOffset } from '@/lib/timezone';
import { useUserEffectiveSettings } from '@/features/locations/hooks/useUserEffectiveSettings';

import { useUpdateUser } from '@/features/people/hooks/useUpdateUser';
import { useDepartments } from '@/features/organization/hooks/useDepartments';
import { useLocations } from '@/features/locations/hooks/useLocations';
import { useFormMetadata } from '@/features/people/hooks/useFormMetadata';
import { UserForm, type UserFormData } from '@/features/people/components/UserForm';
import { UserLocationAssignmentModal } from '@/features/people/components/UserLocationAssignmentModal';
import { Modal } from '@/components/ui/Modal';
import type { UserRole } from '@/types';

import { ErrorState } from '@/components/ui/ErrorState';
import { ObjectPage } from '@/components/templates/ObjectPage';
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
  const { data: effectiveSettings } = useUserEffectiveSettings(id!);
  const resendInvite = useResendInvite();
  const unlockUser = useUnlockUser(id!);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isOffboardingModalOpen, setIsOffboardingModalOpen] = useState(false);
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
        role: formData.role as UserRole | undefined,
        department_id: formData.department_id || null,
        team_id: (formData as any).team_id || null,
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

  const profileTab = user && (
        <div className="space-y-5">
          {user.lifecycle_state === 'invited' && <InvitationPanel userId={user._id} />}

          {/* Timezone Info */}
          {user.location?.timezone && (
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-alt border border-line rounded-lg">
              <Clock className="w-4 h-4 text-ink-secondary" />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-ink-secondary">Local time at location:</span>
                <span className="font-mono font-medium text-ink">
                  {formatTimeInTimezone(new Date(), user.location.timezone, 'datetime')}
                </span>
              </div>
            </div>
          )}

          {/* Effective Settings (Location Inheritance) */}
          <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Briefcase className="w-4 h-4" style={{ color: '#f59e0b' }} />
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>Effective Settings (Location Inheritance)</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="w-3 h-3" style={{ color: '#60a5fa' }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Timezone</span>
                  {effectiveSettings?.timezone && <ArrowRight className="w-2.5 h-2.5" style={{ color: '#60a5fa' }} />}
                </div>
                <p className="text-sm font-semibold font-mono" style={{ color: 'var(--text-main)' }}>{effectiveSettings?.timezone || 'Company default'}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <CalendarDays className="w-3 h-3" style={{ color: '#34d399' }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Holiday Calendar</span>
                  {effectiveSettings?.holiday_calendar && <ArrowRight className="w-2.5 h-2.5" style={{ color: '#34d399' }} />}
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{effectiveSettings?.holiday_calendar?.name || 'None assigned'}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="w-3 h-3" style={{ color: '#fbbf24' }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Work Schedule</span>
                  {effectiveSettings?.work_schedule && <ArrowRight className="w-2.5 h-2.5" style={{ color: '#fbbf24' }} />}
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{effectiveSettings?.work_schedule?.name || 'None assigned'}</p>
                {effectiveSettings?.work_schedule?.working_hours ? (
                  <p className="text-[10px]" style={{ color: '#94a3b8' }}>{effectiveSettings.work_schedule.working_hours.start} – {effectiveSettings.work_schedule.working_hours.end}</p>
                ) : (
                  <p className="text-[10px]" style={{ color: '#94a3b8' }}>No hours configured</p>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <FileText className="w-3 h-3" style={{ color: '#c084fc' }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Resolved Policies</span>
                  {effectiveSettings?.policies && effectiveSettings.policies.length > 0 && <ArrowRight className="w-2.5 h-2.5" style={{ color: '#c084fc' }} />}
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{effectiveSettings?.policies?.length ?? 0} polic{(effectiveSettings?.policies?.length ?? 0) !== 1 ? 'ies' : 'y'}</p>
                {effectiveSettings?.policies && effectiveSettings.policies.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {effectiveSettings.policies.slice(0, 3).map((p: any) => (
                      <p key={p.policy_version_id} className="text-[10px]" style={{ color: '#94a3b8' }}>
                        {p.title}
                        <span className="ml-1 opacity-60">({p.source})</span>
                      </p>
                    ))}
                    {effectiveSettings.policies.length > 3 && (
                      <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.5)' }}>+{effectiveSettings.policies.length - 3} more</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            {typeof navigator !== 'undefined' && !navigator.onLine && (
              <div className="mt-3 flex items-center gap-1.5 text-[10px]" style={{ color: '#f59e0b' }}>
                <WifiOff className="w-3 h-3" />
                <span>Some settings may be stale — you are offline.</span>
              </div>
            )}
          </div>

          {/* Delegates Panel */}
          <div className="pt-2">
            <div className="flex items-center gap-2 mb-2">
              <PlaneTakeoff className="w-5 h-5 text-ink-secondary" />
              <h2 className="text-base font-semibold text-ink">Approval Delegates</h2>
            </div>
            <UserDelegatesPanel userId={user._id} />
          </div>
        </div>
  );

  const orgTab = user && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-ink-secondary" />
            <h2 className="text-base font-semibold text-ink">Reporting Structure</h2>
          </div>
          <ReportingLinesPanel userId={user._id} />
        </div>
  );

  const productTab = user && (
        <UserProductAccessTab userId={user._id} userName={user.full_name} />
  );

  const rolesTab = user && (
        <div className="space-y-4">
          <EffectivePermissionsPanel userId={user._id} />
        </div>
  );

  const securityTab = user && (
        <UserSecurityPanel user={user} />
  );

  const activityTab = user && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <History className="w-5 h-5 text-ink-secondary" />
            <h2 className="text-base font-semibold text-ink">User History & Audit Trail</h2>
          </div>
          <UserHistoryPanel userId={user._id} />
        </div>
  );

  const lockedNow = !!user?.locked_until && new Date(user.locked_until) > new Date();
  const overflow = user
    ? [
        ...(lockedNow ? [{ label: 'Unlock', onSelect: () => unlockUser.mutate(), disabled: unlockUser.isPending }] : []),
        ...(user.lifecycle_state === 'invited' ? [{ label: 'Resend invite', onSelect: handleResendInvite, disabled: resendInvite.isPending }] : []),
        ...(user.lifecycle_state !== 'terminated' && user.lifecycle_state !== 'archived'
          ? [{ label: 'Offboard', onSelect: () => setIsOffboardingModalOpen(true), danger: true }]
          : []),
      ]
    : [];

  return (
    <>
      <ObjectPage
        title={user?.full_name ?? ''}
        subtitle={user ? [user.email, user.employee_id].filter(Boolean).join(' · ') : undefined}
        breadcrumbs={[{ label: 'People', href: ROUTES.PEOPLE }, { label: user?.full_name ?? '' }]}
        isLoading={isLoading}
        isError={isError && !user}
        onRetry={refetch}
        notFound={!isLoading && !isError && !user}
        status={
          user ? (
            <span className="flex items-center gap-2">
              <LifecycleStateBadge state={user.lifecycle_state} />
              <RiskLevelBadge level={user.risk_level || 'none'} score={user.risk_score} />
              {lockedNow && (
                <span className="inline-flex items-center gap-1 text-table text-error">
                  <Lock className="w-3 h-3" aria-hidden />
                  Locked
                </span>
              )}
            </span>
          ) : undefined
        }
        primaryAction={
          user ? (
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-surface text-ink hover:bg-surface-hover transition-colors flex items-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit User
            </button>
          ) : undefined
        }
        overflow={overflow}
        facts={
          user
            ? [
                { label: 'Department', value: user.department?.name || 'Not assigned' },
                { label: 'Employment type', value: formatEmploymentType(user.employment_type) },
                {
                  label: 'Location',
                  value: (
                    <span className="flex items-center gap-2">
                      <span>
                        {user.location ? user.location.name : 'Not assigned'}
                        {user.location?.timezone && (
                          <span className="block font-mono text-table text-ink-muted">
                            {user.location.timezone} ({getTimezoneOffset(user.location.timezone)})
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => setIsLocationModalOpen(true)}
                        className="h-7 w-7 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors"
                        title="Change Location"
                        aria-label="Change location"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ),
                },
                { label: 'Hire date', value: user.hire_date ? formatDate(user.hire_date) : 'Not set' },
              ]
            : undefined
        }
        tabs={[
          { value: 'profile', label: 'Profile', content: profileTab },
          { value: 'org_placement', label: 'Org placement', content: orgTab },
          { value: 'product_access', label: 'Product access', content: productTab },
          { value: 'roles', label: 'Roles', content: rolesTab },
          { value: 'security', label: 'Security', content: securityTab },
          { value: 'activity', label: 'Activity', content: activityTab },
        ]}
      />

      {user && (
        <>
        {/* ── Location Assignment Modal ── */}
        <UserLocationAssignmentModal
          user={user}
          isOpen={isLocationModalOpen}
          onClose={() => setIsLocationModalOpen(false)}
          requiredFields={formMetadata?.required_fields || ['email', 'full_name']}
        />

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

        {/* ── Offboarding Modal (08 §3.3, A2-5) ── */}
        {isOffboardingModalOpen && (
          <OffboardingModal
            user={user}
            isOpen={isOffboardingModalOpen}
            onClose={() => setIsOffboardingModalOpen(false)}
            onSuccess={() => {
              refetch();
            }}
          />
        )}
        </>
      )}
    </>
  );
}


// ── Sub-components ─────────────────────────────────────────────────────────

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

function RiskLevelBadge({ level, score }: { level: string; score?: number }) {
  if (level === 'none' || level === 'low') return null;
  const isHigh = level === 'high';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2.5 py-0.5 tracking-wide border-current cursor-help',
        isHigh ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
      )}
      title={`Risk Score: ${score}`}
    >
      <ShieldAlert className="w-3 h-3" />
      {isHigh ? 'High Risk' : 'Medium Risk'}
    </span>
  );
}
