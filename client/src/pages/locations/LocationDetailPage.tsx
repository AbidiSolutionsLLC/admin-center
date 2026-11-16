import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, FileText, Clock, CalendarDays, Crown, AlertTriangle } from 'lucide-react';
import { useLocationDetail } from '@/features/locations/hooks/useLocationDetail';
import { useLocationUsers } from '@/features/locations/hooks/useLocationUsers';
import { useLocationPoliciesView, useAssignPolicyToLocation, useRemovePolicyFromLocation, useLocationEffectiveSettings } from '@/features/locations/hooks/useLocationPoliciesView';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ObjectPage } from '@/components/templates/ObjectPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatTimeInTimezone } from '@/lib/timezone';
import { ROUTES } from '@/constants/routes';
import { useEmployeeIdFormat } from '@/hooks/useEmployeeIdFormat';
import type { LocationType } from '@/types';

const TYPE_BADGE_COLORS: Record<LocationType, string> = {
  region: 'var(--accent-violet)',
  country: 'var(--accent-blue)',
  city: 'var(--accent-green)',
  office: 'var(--accent-amber)',
};

const TYPE_BADGE_BG: Record<LocationType, string> = {
  region: 'rgba(168,85,247,0.12)',
  country: 'rgba(59,130,246,0.12)',
  city: 'rgba(16,185,129,0.12)',
  office: 'rgba(245,158,11,0.12)',
};

function PolicyStatusBadge({ isOverridden }: { isOverridden: boolean }) {
  if (isOverridden) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
        style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--accent-amber)', border: '1px solid rgba(245,158,11,0.3)' }}>
        Overridden
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--accent-green)', border: '1px solid rgba(16,185,129,0.3)' }}>
      Active
    </span>
  );
}

export default function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: location, isLoading, isError, refetch } = useLocationDetail(id || '');
  const { data: companySettings } = useEmployeeIdFormat();
  const isDefaultLocation = companySettings?.settings?.default_location_id === id;
  const { data: users, isLoading: usersLoading } = useLocationUsers(id || '');
  const { data: policiesView, isLoading: policiesLoading } = useLocationPoliciesView(id || '');
  const { data: effectiveSettings } = useLocationEffectiveSettings(id || '');

  const assignPolicy = useAssignPolicyToLocation(id!);
  const removePolicy = useRemovePolicyFromLocation(id!);
  const [selectedPolicyId, setSelectedPolicyId] = useState('');

  const handleAssignPolicy = async () => {
    if (!selectedPolicyId) return;
    await assignPolicy.mutateAsync(selectedPolicyId);
    setSelectedPolicyId('');
  };

  const handleRemovePolicy = async (policyVersionId: string) => {
    await removePolicy.mutateAsync(policyVersionId);
  };

  // Detect category conflicts among location policies
  const categoryConflicts = useMemo(() => {
    if (!policiesView?.location_policies?.length) return [];
    const categoryMap = new Map<string, any[]>();
    policiesView.location_policies.forEach((lp: any) => {
      const existing = categoryMap.get(lp.category) || [];
      existing.push(lp);
      categoryMap.set(lp.category, existing);
    });
    const conflicts: any[] = [];
    for (const [category, policies] of categoryMap) {
      if (policies.length > 1) {
        conflicts.push({ category, policies });
      }
    }
    return conflicts;
  }, [policiesView]);

  const badgeColor = TYPE_BADGE_COLORS[location?.type as LocationType] || 'var(--text-muted)';
  const badgeBg = TYPE_BADGE_BG[location?.type as LocationType] || 'rgba(148,163,184,0.12)';
  const parentName = location && typeof location.parent_id === 'object' && location.parent_id !== null
    ? (location.parent_id as any).name
    : null;

  const overviewTab = location && (
        <div className="grid grid-cols-2 gap-6">
          {/* Details card */}
          <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-main)' }}>Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Type</span>
                <span className="text-xs font-semibold capitalize" style={{ color: 'var(--text-main)' }}>{location.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Parent</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>{parentName || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Timezone</span>
                <span className="text-xs font-semibold font-mono" style={{ color: 'var(--text-main)' }}>{location.timezone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Address</span>
                <span className="text-xs font-semibold text-right max-w-[200px]" style={{ color: 'var(--text-main)' }}>{location.address || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Headquarters</span>
                <span className="text-xs font-semibold" style={{ color: location.is_headquarters ? 'var(--accent-green)' : 'var(--text-muted)' }}>{location.is_headquarters ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Inherited Settings card */}
          <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-main)' }}>Inherited Settings</h3>
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-3 h-3" style={{ color: 'var(--accent-green)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Timezone</span>
                </div>
                <p className="text-sm font-semibold font-mono" style={{ color: 'var(--text-main)' }}>{location.timezone}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(148,163,184,0.5)' }}>
                  Users at this location will inherit this timezone
                </p>
              </div>
              {location.working_hours && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarDays className="w-3 h-3" style={{ color: 'var(--accent-amber)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Working Hours</span>
                  </div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                    {location.working_hours.start} – {location.working_hours.end}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(148,163,184,0.5)' }}>
                    Days: {(location.working_hours.days || []).map((d: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}
                  </p>
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-3 h-3" style={{ color: 'var(--accent-violet)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Policies</span>
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                  {policiesView?.location_policies?.length || 0} location-specific, {policiesView?.global_policies?.length || 0} global
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(148,163,184,0.5)' }}>
                  Location policies override global policies for users at this location
                </p>
              </div>
            </div>
          </div>
        </div>
  );

  const policiesTab = location && (
        <div className="space-y-5">
          {/* Global Policies */}
          <div className="rounded-xl overflow-hidden policy-readonly" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>
                Global Policies ({policiesView?.global_policies?.length || 0})
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>These policies apply to all users unless overridden by a location-level policy</p>
            </div>
            {policiesLoading ? (
              <TableSkeleton rows={3} columns={3} />
            ) : !policiesView?.global_policies?.length ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No global policies assigned yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Policy</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Category</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Version</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policiesView?.global_policies?.map((gp: any) => (
                      <tr key={gp.policy_version_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-5 py-3">
                          <span className="text-sm font-semibold" style={{ color: gp.is_overridden ? 'rgba(148,163,184,0.5)' : 'var(--text-main)' }}>
                            {gp.title}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{gp.category}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>v{gp.version_number}</span>
                        </td>
                        <td className="px-5 py-3">
                          <PolicyStatusBadge isOverridden={gp.is_overridden} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Conflict Warning */}
          {categoryConflicts.length > 0 && (
            <div className="rounded-xl p-4 flex items-start gap-3"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-amber)' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--accent-amber)' }}>Category Conflict Detected</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Multiple location policies share the same category:{' '}
                  {categoryConflicts.map((c: any) => `${c.category} (${c.policies.map((p: any) => p.title).join(', ')})`).join('; ')}.
                  Only one policy per category takes effect per user based on priority rules.
                </p>
              </div>
            </div>
          )}

          {/* Location-Specific Policies */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>
                  Location Policies ({policiesView?.location_policies?.length || 0})
                </h3>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  These policies are specifically assigned to this location. They override global policies.
                </p>
              </div>
              {/* Assign policy dropdown */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedPolicyId}
                  onChange={(e) => setSelectedPolicyId(e.target.value)}
                  className="h-9 text-sm px-3 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-main)', minWidth: '200px' }}
                >
                  <option value="">Select a policy...</option>
                  {(policiesView?.all_available_policies || [])
                    .filter((p: any) => !policiesView?.location_policies?.some((lp: any) => lp.policy_version_id === p.policy_version_id))
                    .map((p: any) => (
                      <option key={p.policy_version_id} value={p.policy_version_id}>{p.title} v{p.version_number}</option>
                    ))}
                </select>
                <button
                  onClick={handleAssignPolicy}
                  disabled={!selectedPolicyId || assignPolicy.isPending}
                  className="h-9 px-4 text-sm font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--primary)', border: '1px solid rgba(245,158,11,0.3)' }}
                >
                  {assignPolicy.isPending ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </div>
            {policiesLoading ? (
              <TableSkeleton rows={3} columns={4} />
            ) : !policiesView?.location_policies?.length ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No location-specific policies yet. Assign a policy above.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Policy</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Category</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Version</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Assigned</th>
                      <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policiesView?.location_policies?.map((lp: any) => (
                      <tr key={lp.policy_version_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-5 py-3">
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{lp.title}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{lp.category}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>v{lp.version_number}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {new Date(lp.assigned_at).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => handleRemovePolicy(lp.policy_version_id)}
                            disabled={removePolicy.isPending}
                            className="h-8 px-3 text-xs font-semibold rounded-lg transition-all"
                            style={{ color: 'var(--accent-red)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
  );

  const usersTab = location && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>
              Users at this location ({users?.length || 0})
            </h3>
          </div>
          {usersLoading ? (
            <TableSkeleton rows={5} columns={4} />
          ) : !users?.length ? (
            <EmptyState
              title="No users at this location"
              description="Assign users to this location from the People page."
              icon={Users}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Name</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Email</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Employee ID</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Department</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u: any) => (
                    <tr
                      key={u._id}
                      className="cursor-pointer"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      onClick={() => navigate(ROUTES.USER_DETAIL(u._id))}
                    >
                      <td className="px-5 py-3">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{u.full_name}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{u.email}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{u.employee_id}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {u.department_id ? (typeof u.department_id === 'object' ? (u.department_id as any).name : '—') : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={u.lifecycle_state === 'active'
                            ? { background: 'rgba(16,185,129,0.12)', color: 'var(--accent-green)', border: '1px solid rgba(16,185,129,0.3)' }
                            : { background: 'rgba(148,163,184,0.1)', color: 'var(--text-muted)', border: '1px solid rgba(148,163,184,0.2)' }}>
                          {u.lifecycle_state}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
  );

  return (
    <ObjectPage
      title={location?.name ?? ''}
      subtitle={parentName ? `Under ${parentName}` : 'Top-level location'}
      breadcrumbs={[{ label: 'Locations', href: ROUTES.LOCATIONS }, { label: location?.name ?? '' }]}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
      notFound={!isLoading && !isError && !location}
      status={
        location ? (
          <span className="flex items-center gap-2">
            {location.is_headquarters && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label normal-case tracking-normal bg-primary/15 text-primary border border-primary/30">
                <Crown className="w-2.5 h-2.5" />
                HQ
              </span>
            )}
            {isDefaultLocation && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label normal-case tracking-normal bg-info/15 text-info border border-info/30">
                Default
              </span>
            )}
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-label normal-case tracking-normal capitalize"
              style={{ background: badgeBg, color: badgeColor, border: `1px solid color-mix(in srgb, ${badgeColor} 25%, transparent)` }}
            >
              {location.type}
            </span>
          </span>
        ) : undefined
      }
      facts={
        location
          ? [
              { label: 'Users', value: effectiveSettings?.user_count ?? 0 },
              { label: 'Timezone', value: <span className="font-mono">{location.timezone}</span> },
              { label: 'Local time', value: <span className="font-mono">{formatTimeInTimezone(new Date(), location.timezone, 'time')}</span> },
              { label: 'Location policies', value: policiesView?.location_policies?.length ?? 0 },
            ]
          : undefined
      }
      tabs={[
        { value: 'overview', label: 'Overview', content: overviewTab },
        { value: 'policies', label: 'Policies', count: policiesView?.location_policies?.length, content: policiesTab },
        { value: 'users', label: 'Users', count: users?.length, content: usersTab },
      ]}
    />
  );
}
