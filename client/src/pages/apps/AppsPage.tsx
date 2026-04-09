// client/src/pages/apps/AppsPage.tsx
import { useState } from 'react';
import { Package, Users, Clock, AlertTriangle } from 'lucide-react';
import { useApps, useAssignApp, useAppTimeline } from '@/features/apps/useApps';
import { useRoles } from '@/features/roles/useRoles';
import { AppCatalog } from '@/features/apps/AppCatalog';
import { AccessTimeline } from '@/features/apps/AccessTimeline';
import { AssignmentRuleBuilder } from '@/features/apps/AssignmentRuleBuilder';
import { Modal } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import type { App } from '@/types';

/**
 * AppsPage Component
 * Main page for managing app assignments.
 *
 * Features:
 * - App catalog with assignment counts
 * - Assign apps to roles/departments/users
 * - Dependency warning shown in UI when dependency is unmet
 * - Access timeline shows full grant/revoke history
 * - All assignments produce audit events (server-side)
 * - Assignment propagates to all users with target role/dept
 */
export default function AppsPage() {
  // ── Server data ──────────────────────────────────────────────────────
  const { data: apps, isLoading: isLoadingApps, isError, refetch } = useApps();
  const { data: roles } = useRoles();

  // Mutations
  const assignAppMutation = useAssignApp();

  // ── State ────────────────────────────────────────────────────────────
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isTimelineModalOpen, setIsTimelineModalOpen] = useState(false);

  // Assignment form state
  const [assignTargetType, setAssignTargetType] = useState<'role' | 'department' | 'user'>('role');
  const [assignTargetId, setAssignTargetId] = useState('');
  const [assignReason, setAssignReason] = useState('');

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
    setAssignReason('');
    setIsAssignModalOpen(true);
  };

  const handleOpenTimelineModal = () => {
    setIsTimelineModalOpen(true);
  };

  const handleAssignApp = async () => {
    if (!selectedApp || !assignTargetId) return;

    await assignAppMutation.mutateAsync({
      appId: selectedApp._id,
      data: {
        target_type: assignTargetType,
        target_id: assignTargetId,
        reason: assignReason || undefined,
      },
    });

    setIsAssignModalOpen(false);
  };

  // ── Loading State ────────────────────────────────────────────────────
  if (isLoadingApps) {
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

  // ── Empty State ──────────────────────────────────────────────────────
  if (!apps || apps.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No apps yet"
        description="Add apps to start managing access assignments."
      />
    );
  }

  // ── Main Content ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">App Assignment</h1>
          <p className="text-sm text-ink-muted mt-1">
            Manage app access across roles, departments, and users
          </p>
        </div>
        {selectedApp && (
          <div className="flex items-center gap-2">
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
          </div>
        )}
      </div>

      {/* App Catalog */}
      <AppCatalog
        apps={apps}
        isLoading={isLoadingApps}
        onSelect={handleSelectApp}
        selectedApp={selectedApp}
      />

      {/* Selected App Details */}
      {selectedApp && (
        <div className="bg-surface border border-line rounded-lg shadow-card p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">{selectedApp.name}</h2>
              <p className="text-sm text-ink-muted mt-1">
                {selectedApp.description || 'No description'}
              </p>
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                selectedApp.status === 'active'
                  ? 'bg-success/10 text-success'
                  : selectedApp.status === 'maintenance'
                  ? 'bg-warning/10 text-warning'
                  : 'bg-ink-muted/10 text-ink-secondary'
              }`}
            >
              {selectedApp.status}
            </span>
          </div>

          {selectedApp.dependencies && selectedApp.dependencies.length > 0 && (
            <div className="p-3 bg-surface-alt rounded-md border border-line mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span className="text-xs font-medium text-ink-secondary">
                  Requires: {selectedApp.dependencies.join(', ')}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 text-sm text-ink-muted">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>{selectedApp.assignment_count ?? 0} active assignments</span>
            </div>
            <div className="flex items-center gap-1">
              <Package className="h-4 w-4" />
              <span>{selectedApp.category}</span>
            </div>
          </div>
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
              <label className="block text-sm font-medium text-ink mb-2">
                Assign To
              </label>
              <div className="flex gap-2">
                {(['role', 'department', 'user'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setAssignTargetType(type);
                      setAssignTargetId('');
                    }}
                    className={`flex-1 h-9 text-sm font-medium rounded-md transition-colors ${
                      assignTargetType === type
                        ? 'bg-primary text-white'
                        : 'bg-surface-alt text-ink-secondary hover:bg-surface-alt/80'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Selector */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Select {assignTargetType.charAt(0).toUpperCase() + assignTargetType.slice(1)}{' '}
                <span className="text-error">*</span>
              </label>
              <select
                value={assignTargetId}
                onChange={(e) => setAssignTargetId(e.target.value)}
                className="w-full h-9 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600"
              >
                <option value="">Select...</option>
                {assignTargetType === 'role' &&
                  roles?.map((role) => (
                    <option key={role._id} value={role._id}>
                      {role.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Reason (Optional) */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
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
            {assignTargetId && (
              <AssignmentRuleBuilder
                appId={selectedApp._id}
                appName={selectedApp.name}
                targetType={assignTargetType}
                targetId={assignTargetId}
                targetName={
                  assignTargetType === 'role'
                    ? roles?.find((r) => r._id === assignTargetId)?.name ?? ''
                    : assignTargetId
                }
                onConfirm={handleAssignApp}
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
    </div>
  );
}
