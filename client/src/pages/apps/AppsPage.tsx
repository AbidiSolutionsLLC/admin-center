// client/src/pages/apps/AppsPage.tsx
import { useState } from 'react';
import { Package, Users, Clock, AlertTriangle, Search, Filter, Shield } from 'lucide-react';
import { useApps, useApp, useAssignApp, useRevokeApp, useAppTimeline, useUpdateApp } from '@/features/apps/useApps';
import { useRoles } from '@/features/roles/useRoles';
import { useDepartments } from '@/features/organization/hooks/useDepartments';
import { useUsers } from '@/features/people/hooks/useUsers';
import { useGroups } from '@/features/groups/useGroups';
import { AppCatalog } from '@/features/apps/AppCatalog';
import { AccessTimeline } from '@/features/apps/AccessTimeline';
import { AssignmentRuleBuilder } from '@/features/apps/AssignmentRuleBuilder';
import { Modal } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthStore } from '@/store/useAuthStore';
import { PERMISSION_GROUPS } from '@/constants/roles';
import type { App } from '@/types';

/**
 * AppsPage Component
 * Main page for managing app assignments.
 */
export default function AppsPage() {
  // ── States ────────────────────────────────────────────────────────────
  const { userRole } = useAuthStore();
  const isItAdmin = userRole && PERMISSION_GROUPS.IT_ADMINS.includes(userRole as any);
  const isOpsAdmin = userRole && PERMISSION_GROUPS.OPS_ADMINS.includes(userRole as any);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);

  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isTimelineModalOpen, setIsTimelineModalOpen] = useState(false);
  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);

  // Assignment form state
  const [assignTargetType, setAssignTargetType] = useState<'role' | 'department' | 'group' | 'user' | 'attribute'>('role');
  const [assignTargetId, setAssignTargetId] = useState('');
  const [assignAttributeName, setAssignAttributeName] = useState('department_id');
  const [assignAttributeValue, setAssignAttributeValue] = useState('');
  const [assignReason, setAssignReason] = useState('');

  // Revoke state
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [assignmentToRevoke, setAssignmentToRevoke] = useState<string | null>(null);

  // ── Server data ──────────────────────────────────────────────────────
  const { data: apps, isLoading: isLoadingApps, isError, refetch } = useApps({
    search,
    status: statusFilter,
    category: categoryFilter,
    page,
    limit: 12,
  });

  const { data: detailedApp, refetch: refetchDetailedApp } = useApp(selectedApp?._id ?? '');
  const currentApp = apps?.find((a) => a._id === selectedApp?._id) || selectedApp;
  const { data: roles } = useRoles();
  const { data: departments } = useDepartments();
  const { data: groups } = useGroups();
  const { data: users } = useUsers();

  // Mutations
  const assignAppMutation = useAssignApp();
  const revokeAppMutation = useRevokeApp();
  const updateAppMutation = useUpdateApp();

  // ── Timeline data (loaded when modal opens) ─────────────────────────
  const { data: timelineData, isLoading: isLoadingTimeline } = useAppTimeline(
    selectedApp?._id ?? '',
    1,
    50
  );

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleSelectApp = (app: App) => {
    setSelectedApp(app);
  };

  const handleOpenAssignModal = () => {
    setAssignTargetType('role');
    setAssignTargetId('');
    setAssignAttributeName('department_id');
    setAssignAttributeValue('');
    setAssignReason('');
    setIsAssignModalOpen(true);
  };

  const handleOpenTimelineModal = () => {
    setIsTimelineModalOpen(true);
  };

  const handleAssignApp = async () => {
    if (!selectedApp) return;
    if (assignTargetType !== 'attribute' && !assignTargetId) return;
    if (assignTargetType === 'attribute' && (!assignAttributeName || !assignAttributeValue)) return;

    await assignAppMutation.mutateAsync({
      appId: selectedApp._id,
      data: {
        target_type: assignTargetType,
        ...(assignTargetType === 'attribute' ? {
          attribute_name: assignAttributeName,
          attribute_value: assignAttributeValue
        } : {
          target_id: assignTargetId
        }),
        reason: assignReason.trim() || undefined,
      },
    });

    setIsAssignModalOpen(false);
    refetchDetailedApp();
  };

  const handleOpenRevokeModal = (assignmentId: string) => {
    setAssignmentToRevoke(assignmentId);
    setIsRevokeModalOpen(true);
  };

  const handleConfirmRevoke = async () => {
    if (!selectedApp || !assignmentToRevoke) return;
    await revokeAppMutation.mutateAsync({
      appId: selectedApp._id,
      assignmentId: assignmentToRevoke,
    });
    setIsRevokeModalOpen(false);
    setAssignmentToRevoke(null);
    refetchDetailedApp();
  };

  const handleToggleAppStatus = async () => {
    if (!currentApp) return;

    const currentlyActive = currentApp.is_active !== false && currentApp.status !== 'inactive';

    if (currentlyActive) {
      // Check if it's widely used
      const activeAssignmentsCount = detailedApp?.assignments?.length ?? currentApp.assignment_count ?? 0;
      if (activeAssignmentsCount > 0) {
        setIsWarningModalOpen(true);
      } else {
        await handleDisableApp();
      }
    } else {
      await updateAppMutation.mutateAsync({
        appId: currentApp._id,
        data: { is_active: true, status: 'active' },
      });
      refetch();
      refetchDetailedApp();
    }
  };

  const handleDisableApp = async () => {
    if (!currentApp) return;
    setIsWarningModalOpen(false);
    await updateAppMutation.mutateAsync({
      appId: currentApp._id,
      data: { is_active: false, status: 'inactive' },
    });
    refetch();
    refetchDetailedApp();
  };

  // ── Loading State ────────────────────────────────────────────────────
  if (isLoadingApps && !search && !statusFilter && !categoryFilter) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-surface-alt animate-pulse rounded" />
        </div>
        <TableSkeleton rows={3} columns={3} />
      </div>
    );
  }

  // ── Error State ──────────────────────────────────────────────────────
  if (isError) {
    return (
      <ErrorState
        title="Failed to load apps"
        description="Please try again."
        onRetry={refetch}
      />
    );
  }

  // Check if there are truly no apps in the database (vs empty search results)
  const isFiltering = !!(search || statusFilter || categoryFilter);
  if (!isFiltering && (!apps || apps.length === 0)) {
    return (
      <EmptyState
        icon={Package}
        title="No apps yet"
        description="Add apps to start managing access assignments."
      />
    );
  }

  const pagination = (apps as any)?.pagination;

  // ── Main Content ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">App Assignment</h1>
          <p className="text-sm text-ink-muted mt-1">
            Manage app access across roles, departments, groups, and users
          </p>
        </div>
        {selectedApp && (
          <div className="flex items-center gap-2">
            {isOpsAdmin && (
              <>
                <button
                  onClick={handleOpenTimelineModal}
                  className="inline-flex items-center gap-2 h-9 px-4 text-sm font-medium text-ink-secondary border border-line rounded-md hover:bg-surface-alt transition-colors"
                >
                  <Clock className="h-4 w-4" />
                  Timeline
                </button>
                <button
                  onClick={handleOpenAssignModal}
                  className="inline-flex items-center gap-2 h-9 px-4 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-hover transition-colors"
                >
                  <Users className="h-4 w-4" />
                  Assign App
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col md:flex-row gap-3 bg-surface border border-line p-4 rounded-lg shadow-sm">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Search apps by name, category, or description..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full h-9 pl-9 pr-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600 transition-all"
          />
        </div>
        <div className="flex flex-wrap gap-2 md:gap-3">
          <div className="relative min-w-[140px]">
            <Filter className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full h-9 pl-8 pr-3 text-sm bg-surface border border-line rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-primary-600 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
          <div className="relative min-w-[140px]">
            <Filter className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="w-full h-9 pl-8 pr-3 text-sm bg-surface border border-line rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-primary-600 cursor-pointer"
            >
              <option value="">All Categories</option>
              <option value="hr">HR</option>
              <option value="finance">Finance</option>
              <option value="engineering">Engineering</option>
              <option value="security">Security</option>
              <option value="utilities">Utilities</option>
            </select>
          </div>
        </div>
      </div>

      {apps && apps.length > 0 ? (
        <>
          {/* App Catalog */}
          <AppCatalog
            apps={apps}
            isLoading={isLoadingApps}
            onSelect={handleSelectApp}
            selectedApp={selectedApp}
          />

          {/* Pagination Footer */}
          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between border-t border-line pt-4 mt-2">
              <span className="text-xs text-ink-muted">
                Showing page {pagination.page} of {pagination.pages} ({pagination.total} total apps)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 h-8 text-xs font-medium border border-line rounded hover:bg-surface-alt disabled:opacity-50 transition-all"
                >
                  Previous
                </button>
                <button
                  disabled={page === pagination.pages}
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                  className="px-3 h-8 text-xs font-medium border border-line rounded hover:bg-surface-alt disabled:opacity-50 transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 bg-surface border border-dashed border-line rounded-lg">
          <Package className="h-8 w-8 text-ink-muted mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-ink">No matching apps found</h3>
          <p className="text-xs text-ink-muted mt-1">Try adjusting your filters or search query.</p>
        </div>
      )}

      {/* Selected App Details & Active Assignments */}
      {currentApp && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-surface border border-line rounded-lg shadow-card p-6 h-fit">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-ink">{currentApp.name}</h2>
                <p className="text-xs text-ink-muted mt-1">
                  {currentApp.description || 'No description'}
                </p>
              </div>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  currentApp.status === 'active'
                    ? 'bg-success/10 text-success'
                    : currentApp.status === 'maintenance'
                    ? 'bg-warning/10 text-warning'
                    : 'bg-ink-muted/10 text-ink-secondary'
                }`}
              >
                {currentApp.status.toUpperCase()}
              </span>
            </div>

            {currentApp.dependencies && currentApp.dependencies.length > 0 && (
              <div className="p-3 bg-warning/5 rounded-md border border-warning/10 mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  <span className="text-[11px] font-medium text-warning-hover">
                    Requires: {currentApp.dependencies.join(', ')}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2 text-xs text-ink-secondary pt-2 border-t border-line">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Category:</span>
                <span className="font-medium text-ink">{currentApp.category}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Owner:</span>
                <span className="font-medium text-ink">
                  {currentApp.owner_info?.full_name || 'System Owned'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Active Assignments:</span>
                <span className="font-medium text-ink">{detailedApp?.assignments?.length ?? currentApp.assignment_count ?? 0}</span>
              </div>
            </div>

            {isItAdmin && (
              <div className="mt-5 pt-4 border-t border-line flex flex-col gap-2">
                <button
                  onClick={handleToggleAppStatus}
                  disabled={updateAppMutation.isPending}
                  className={`w-full h-9 text-xs font-semibold rounded-md transition-all border ${
                    currentApp.is_active !== false && currentApp.status !== 'inactive'
                      ? 'bg-error/5 hover:bg-error/10 text-error border-error/20'
                      : 'bg-success/5 hover:bg-success/10 text-success border-success/20'
                  }`}
                >
                  {updateAppMutation.isPending
                    ? 'Updating...'
                    : currentApp.is_active !== false && currentApp.status !== 'inactive'
                    ? 'Disable System-Wide App'
                    : 'Enable System-Wide App'}
                </button>
              </div>
            )}
          </div>

          {isOpsAdmin && (
            <div className="lg:col-span-2 bg-surface border border-line rounded-lg shadow-card p-6">
              <h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Active Assignments Control
              </h3>
              {detailedApp?.assignments && detailedApp.assignments.length > 0 ? (
                <div className="divide-y divide-line border border-line rounded-lg overflow-hidden bg-surface">
                  {detailedApp.assignments.map((assignment: any) => (
                    <div
                      key={assignment._id}
                      className="flex items-center justify-between p-3.5 hover:bg-surface-alt/40 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full ${
                            assignment.target_type === 'role'
                              ? 'bg-primary/10 text-primary'
                              : assignment.target_type === 'department'
                              ? 'bg-success/10 text-success'
                              : assignment.target_type === 'group'
                              ? 'bg-warning/10 text-warning'
                              : 'bg-indigo/10 text-indigo'
                          }`}
                        >
                          {assignment.target_type.toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-ink">
                            {assignment.target_type === 'attribute' 
                              ? `${assignment.attribute_name} = ${assignment.attribute_value}`
                              : assignment.target_name || assignment.target_id}
                          </span>
                          {assignment.reason && (
                            <span className="text-[11px] text-ink-muted block mt-0.5 italic">
                              "{assignment.reason}"
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpenRevokeModal(assignment._id)}
                        disabled={revokeAppMutation.isPending}
                        className="text-xs font-semibold text-error hover:text-error-hover bg-error/5 hover:bg-error/10 px-3 h-8 rounded-md transition-all border border-error/10"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-line rounded-lg">
                  <p className="text-xs text-ink-muted italic">No active assignments for this app.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Assign App Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={`Assign: ${selectedApp?.name ?? ''}`}
        size="lg"
      >
        {selectedApp && (
          <div className="space-y-4">
            {/* Target Type Selector */}
            <div>
              <label className="block text-xs font-bold text-ink-secondary uppercase tracking-wider mb-2">
                Assign To Target Type
              </label>
              <div className="grid grid-cols-5 gap-2">
                {(['role', 'department', 'group', 'user', 'attribute'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setAssignTargetType(type);
                      setAssignTargetId('');
                      setAssignAttributeName('department_id');
                      setAssignAttributeValue('');
                    }}
                    type="button"
                    className={`h-9 text-xs font-semibold rounded-md transition-all ${
                      assignTargetType === type
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-surface-alt text-ink-secondary hover:bg-surface-alt/80 border border-line'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Selector */}
            {assignTargetType !== 'attribute' ? (
              <div>
                <label className="block text-xs font-bold text-ink-secondary uppercase tracking-wider mb-1.5">
                  Select {assignTargetType.charAt(0).toUpperCase() + assignTargetType.slice(1)}{' '}
                  <span className="text-error">*</span>
                </label>
                <select
                  value={assignTargetId}
                  onChange={(e) => setAssignTargetId(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600 cursor-pointer"
                >
                  <option value="">Select...</option>
                  {assignTargetType === 'role' &&
                    roles?.filter(r => r.is_active !== false).map((role) => (
                      <option key={role._id} value={role._id}>
                        {role.name}
                      </option>
                    ))}
                  {assignTargetType === 'department' &&
                    departments?.filter(d => d.is_active !== false).map((dept) => (
                      <option key={dept._id} value={dept._id}>
                        {dept.name}
                      </option>
                    ))}
                  {assignTargetType === 'group' &&
                    groups?.filter(g => g.is_active !== false).map((group) => (
                      <option key={group._id} value={group._id}>
                        {group.name}
                      </option>
                    ))}
                  {assignTargetType === 'user' &&
                    users?.filter(u => u.is_active !== false && u.lifecycle_state === 'active').map((user) => (
                      <option key={user._id} value={user._id}>
                        {user.full_name} ({user.email})
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-wider mb-1.5">
                    Attribute Name <span className="text-error">*</span>
                  </label>
                  <select
                    value={assignAttributeName}
                    onChange={(e) => setAssignAttributeName(e.target.value)}
                    className="w-full h-9 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600 cursor-pointer"
                  >
                    <option value="department_id">Department ID</option>
                    <option value="team_id">Team ID</option>
                    <option value="location_id">Location ID</option>
                    <option value="domain">Email Domain</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-wider mb-1.5">
                    Attribute Value <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={assignAttributeValue}
                    onChange={(e) => setAssignAttributeValue(e.target.value)}
                    className="w-full h-9 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600"
                    placeholder="Value..."
                  />
                </div>
              </div>
            )}

            {/* Reason (Optional) */}
            <div>
              <label className="block text-xs font-bold text-ink-secondary uppercase tracking-wider mb-1.5">
                Reason (Optional)
              </label>
              <input
                type="text"
                value={assignReason}
                onChange={(e) => setAssignReason(e.target.value)}
                className="w-full h-9 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600"
                placeholder="Why are you assigning this app?"
              />
            </div>

            {/* Dependency Warning & Confirm */}
            {(assignTargetId || (assignTargetType === 'attribute' && assignAttributeName && assignAttributeValue)) && (
              <AssignmentRuleBuilder
                appId={selectedApp._id}
                appName={selectedApp.name}
                targetType={assignTargetType}
                targetId={assignTargetType === 'attribute' ? 'attribute' : assignTargetId}
                attributeName={assignTargetType === 'attribute' ? assignAttributeName : undefined}
                attributeValue={assignTargetType === 'attribute' ? assignAttributeValue : undefined}
                targetName={
                  assignTargetType === 'attribute'
                    ? `${assignAttributeName}=${assignAttributeValue}`
                    : assignTargetType === 'role'
                    ? roles?.find((r) => r._id === assignTargetId)?.name ?? ''
                    : assignTargetType === 'department'
                    ? departments?.find((d) => d._id === assignTargetId)?.name ?? ''
                    : assignTargetType === 'group'
                    ? groups?.find((g) => g._id === assignTargetId)?.name ?? ''
                    : assignTargetType === 'user'
                    ? users?.find((u) => u._id === assignTargetId)?.full_name ?? ''
                    : assignTargetId
                }
                onConfirm={handleAssignApp}
                onCancel={() => setIsAssignModalOpen(false)}
                isSubmitting={assignAppMutation.isPending}
              />
            )}
          </div>
        )}
      </Modal>

      {/* Timeline Modal */}
      <Modal
        isOpen={isTimelineModalOpen}
        onClose={() => setIsTimelineModalOpen(false)}
        title={`Access Timeline: ${selectedApp?.name ?? ''}`}
        size="lg"
      >
        <AccessTimeline
          assignments={timelineData?.assignments ?? []}
          isLoading={isLoadingTimeline}
        />
      </Modal>

      {/* Deactivation Warning Modal */}
      <Modal
        isOpen={isWarningModalOpen}
        onClose={() => setIsWarningModalOpen(false)}
        title="Warning: Widely Used App"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-error flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-ink">
                Disable "{currentApp?.name}" System-Wide?
              </p>
              <p className="text-xs text-ink-secondary mt-1">
                Warning: This app has active assignments. Disabling it will immediately revoke access for all assigned users and hide it from their dashboards.
              </p>
              <p className="text-xs text-ink-muted mt-2">
                Are you sure you want to proceed?
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-line">
            <button
              onClick={() => setIsWarningModalOpen(false)}
              className="h-9 px-4 text-sm font-medium text-ink-secondary border border-line rounded-md hover:bg-surface-alt transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDisableApp}
              disabled={updateAppMutation.isPending}
              className="h-9 px-4 text-sm font-medium text-white bg-error rounded-md hover:bg-error-hover transition-colors flex items-center justify-center gap-2"
            >
              {updateAppMutation.isPending ? 'Disabling...' : 'Yes, Disable App'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Revoke Confirmation Modal */}
      <Modal
        isOpen={isRevokeModalOpen}
        onClose={() => setIsRevokeModalOpen(false)}
        title="Confirm Revocation"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-error flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-ink">
                Revoke Assignment?
              </p>
              <p className="text-xs text-ink-secondary mt-1">
                Are you sure you want to revoke this app assignment? This action cannot be undone.
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-line">
            <button
              onClick={() => setIsRevokeModalOpen(false)}
              className="h-9 px-4 text-sm font-medium text-ink-secondary border border-line rounded-md hover:bg-surface-alt transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmRevoke}
              disabled={revokeAppMutation.isPending}
              className="h-9 px-4 text-sm font-medium text-white bg-error rounded-md hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
              {revokeAppMutation.isPending ? 'Revoking...' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

