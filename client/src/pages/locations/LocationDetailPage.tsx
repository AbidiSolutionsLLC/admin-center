import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Globe2, Building2, Users, FileText, Clock, CalendarDays, Crown, AlertTriangle } from 'lucide-react';
import { useLocationDetail } from '@/features/locations/hooks/useLocationDetail';
import { useLocationUsers } from '@/features/locations/hooks/useLocationUsers';
import { useLocationPoliciesView, useAssignPolicyToLocation, useRemovePolicyFromLocation, useLocationEffectiveSettings } from '@/features/locations/hooks/useLocationPoliciesView';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/utils/cn';
import { formatTimeInTimezone } from '@/lib/timezone';
import { ROUTES } from '@/constants/routes';
import { useEmployeeIdFormat } from '@/hooks/useEmployeeIdFormat';
import type { LocationType } from '@/types';

const TYPE_ICONS: Record<LocationType, typeof MapPin> = {
  region: Globe2,
  country: Building2,
  city: MapPin,
  office: MapPin,
};

const TYPE_BADGE_COLORS: Record<LocationType, string> = {
  region: '#c084fc',
  country: '#60a5fa',
  city: '#34d399',
  office: '#fbbf24',
};

const TYPE_BADGE_BG: Record<LocationType, string> = {
  region: 'rgba(168,85,247,0.12)',
  country: 'rgba(59,130,246,0.12)',
  city: 'rgba(16,185,129,0.12)',
  office: 'rgba(245,176,42,0.12)',
};

type TabType = 'overview' | 'policies' | 'users';

function PolicyStatusBadge({ isOverridden }: { isOverridden: boolean }) {
  if (isOverridden) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
        style={{ background: 'rgba(245,176,42,0.12)', color: '#fbbf24', border: '1px solid rgba(245,176,42,0.3)' }}>
        Overridden
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>
      Active
    </span>
  );
}

function PolicySourceBadge({ source }: { source: string }) {
  const config: Record<string, { bg: string; color: string; border: string; label: string }> = {
    global: { bg: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: 'rgba(96,165,250,0.3)', label: 'Global' },
    location: { bg: 'rgba(245,176,42,0.12)', color: '#fbbf24', border: 'rgba(245,176,42,0.3)', label: 'Location' },
    direct: { bg: 'rgba(168,85,247,0.12)', color: '#c084fc', border: 'rgba(168,85,247,0.3)', label: 'Direct' },
  };
  const c = config[source] || config.direct;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {c.label}
    </span>
  );
}

export default function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const { data: location, isLoading, isError, refetch } = useLocationDetail(id);
  const { data: companySettings } = useEmployeeIdFormat();
  const isDefaultLocation = companySettings?.settings?.default_location_id === id;
  const { data: users, isLoading: usersLoading } = useLocationUsers(id);
  const { data: policiesView, isLoading: policiesLoading } = useLocationPoliciesView(id);
  const { data: effectiveSettings, isLoading: settingsLoading } = useLocationEffectiveSettings(id);

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

  if (isLoading) {
    return (
      <div className="space-y-6 page-enter">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-7 w-40 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div className="h-4 w-64 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
          </div>
        </div>
        <TableSkeleton rows={8} columns={4} />
      </div>
    );
  }

  if (isError || !location) {
    return (
      <div className="space-y-6 page-enter">
        <ErrorState
          title="Failed to load location"
          description="Something went wrong fetching location details."
          onRetry={refetch}
        />
      </div>
    );
  }

  const TypeIcon = TYPE_ICONS[location.type as LocationType] || MapPin;
  const badgeColor = TYPE_BADGE_COLORS[location.type as LocationType] || '#94a3b8';
  const badgeBg = TYPE_BADGE_BG[location.type as LocationType] || 'rgba(148,163,184,0.12)';
  const parentName = typeof location.parent_id === 'object' && location.parent_id !== null
    ? (location.parent_id as any).name
    : null;

  const tabs: { key: TabType; label: string; icon: any; count?: number }[] = [
    { key: 'overview', label: 'Overview', icon: MapPin },
    { key: 'policies', label: 'Policies', icon: FileText, count: policiesView?.location_policies?.length },
    { key: 'users', label: 'Users', icon: Users, count: users?.length },
  ];

  return (
    <div className="space-y-6 page-enter">

      {/* Back button + header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <button
            onClick={() => navigate(ROUTES.LOCATIONS)}
            className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
            style={{ color: '#94a3b8' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#f5b02a')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Locations
          </button>
          <div className="flex items-center gap-3 mt-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: badgeBg }}>
              <TypeIcon className="w-5 h-5" style={{ color: badgeColor }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>{location.name}</h1>
                {location.is_headquarters && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: 'rgba(245,176,42,0.15)', color: '#fbbf24', border: '1px solid rgba(245,176,42,0.3)' }}>
                    <Crown className="w-2.5 h-2.5" />
                    HQ
                  </span>
                )}
                {isDefaultLocation && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                    Default
                  </span>
                )}
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
                  style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeColor}40` }}>
                  {location.type}
                </span>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {parentName ? `Under ${parentName}` : 'Top-level location'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-3.5 h-3.5" style={{ color: '#60a5fa' }} />
            <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>Users</span>
          </div>
          <span className="text-xl font-bold" style={{ color: 'var(--text-main)' }}>{effectiveSettings?.user_count ?? 0}</span>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-3.5 h-3.5" style={{ color: '#34d399' }} />
            <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>Timezone</span>
          </div>
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--text-main)' }}>{location.timezone}</span>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2 mb-2">
            <CalendarDays className="w-3.5 h-3.5" style={{ color: '#fbbf24' }} />
            <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>Local Time</span>
          </div>
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--text-main)' }}>{formatTimeInTimezone(new Date(), location.timezone, 'time')}</span>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-3.5 h-3.5" style={{ color: '#c084fc' }} />
            <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>Location Policies</span>
          </div>
          <span className="text-xl font-bold" style={{ color: 'var(--text-main)' }}>{policiesView?.location_policies?.length ?? 0}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-all'
            )}
            style={activeTab === tab.key
              ? { background: 'rgba(245,176,42,0.12)', color: '#f5b02a' }
              : { color: '#94a3b8' }}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ml-1"
                style={activeTab === tab.key
                  ? { background: 'rgba(245,176,42,0.2)', color: '#f5b02a' }
                  : { background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Details card */}
          <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-main)' }}>Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: '#94a3b8' }}>Type</span>
                <span className="text-xs font-semibold capitalize" style={{ color: 'var(--text-main)' }}>{location.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: '#94a3b8' }}>Parent</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>{parentName || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: '#94a3b8' }}>Timezone</span>
                <span className="text-xs font-semibold font-mono" style={{ color: 'var(--text-main)' }}>{location.timezone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: '#94a3b8' }}>Address</span>
                <span className="text-xs font-semibold text-right max-w-[200px]" style={{ color: 'var(--text-main)' }}>{location.address || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: '#94a3b8' }}>Headquarters</span>
                <span className="text-xs font-semibold" style={{ color: location.is_headquarters ? '#34d399' : '#94a3b8' }}>{location.is_headquarters ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Inherited Settings card */}
          <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-main)' }}>Inherited Settings</h3>
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-3 h-3" style={{ color: '#34d399' }} />
                  <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>Timezone</span>
                </div>
                <p className="text-sm font-semibold font-mono" style={{ color: 'var(--text-main)' }}>{location.timezone}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(148,163,184,0.5)' }}>
                  Users at this location will inherit this timezone
                </p>
              </div>
              {location.working_hours && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarDays className="w-3 h-3" style={{ color: '#fbbf24' }} />
                    <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>Working Hours</span>
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
                  <FileText className="w-3 h-3" style={{ color: '#c084fc' }} />
                  <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>Policies</span>
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
      )}

      {activeTab === 'policies' && (
        <div className="space-y-5">
          {/* Global Policies */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>
                Global Policies ({policiesView?.global_policies?.length || 0})
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>These policies apply to all users unless overridden by a location-level policy</p>
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
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Policy</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Category</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Version</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Status</th>
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
                          <span className="text-xs capitalize" style={{ color: '#94a3b8' }}>{gp.category}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs font-mono" style={{ color: '#94a3b8' }}>v{gp.version_number}</span>
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
              style={{ background: 'rgba(245,176,42,0.08)', border: '1px solid rgba(245,176,42,0.2)' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: '#fbbf24' }}>Category Conflict Detected</p>
                <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
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
                <p className="text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>
                  These policies are specifically assigned to this location. They override global policies.
                </p>
              </div>
              {/* Assign policy dropdown */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedPolicyId}
                  onChange={(e) => setSelectedPolicyId(e.target.value)}
                  className="h-9 text-sm px-3 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#f8fafc', minWidth: '200px' }}
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
                  style={{ background: 'rgba(245,176,42,0.15)', color: '#f5b02a', border: '1px solid rgba(245,176,42,0.3)' }}
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
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Policy</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Category</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Version</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Assigned</th>
                      <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policiesView?.location_policies?.map((lp: any) => (
                      <tr key={lp.policy_version_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-5 py-3">
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{lp.title}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs capitalize" style={{ color: '#94a3b8' }}>{lp.category}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs font-mono" style={{ color: '#94a3b8' }}>v{lp.version_number}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs" style={{ color: '#94a3b8' }}>
                            {new Date(lp.assigned_at).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => handleRemovePolicy(lp.policy_version_id)}
                            disabled={removePolicy.isPending}
                            className="h-8 px-3 text-xs font-semibold rounded-lg transition-all"
                            style={{ color: '#f87171' }}
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
      )}

      {activeTab === 'users' && (
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
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Name</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Email</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Employee ID</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Department</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Status</th>
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
                        <span className="text-xs" style={{ color: '#94a3b8' }}>{u.email}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs font-mono" style={{ color: '#94a3b8' }}>{u.employee_id}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs" style={{ color: '#94a3b8' }}>
                          {u.department_id ? (typeof u.department_id === 'object' ? (u.department_id as any).name : '—') : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={u.lifecycle_state === 'active'
                            ? { background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }
                            : { background: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' }}>
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
      )}

    </div>
  );
}
