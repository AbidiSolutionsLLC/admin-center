// src/features/people/components/ReportingLinesPanel.tsx
import { useState } from 'react';
import { UserPlus, X, Users, ArrowRight, AlertCircle, Plus } from 'lucide-react';
import { useReportingLine, useAddSecondaryManager, useRemoveSecondaryManager, useChangePrimaryManager } from '@/features/people/hooks/useReportingLines';
import { useUsers } from '@/features/people/hooks/useUsers';
import { cn } from '@/utils/cn';

interface ReportingLinesPanelProps {
  userId: string;
}

/**
 * ReportingLinesPanel Component
 * Displays and manages the reporting structure for a user.
 * Shows primary manager, secondary managers, and direct reports.
 * Allows adding/removing secondary managers and changing primary manager.
 * 
 * Used on: UserDetailPage
 */
export function ReportingLinesPanel({ userId }: ReportingLinesPanelProps) {
  const { data: reportingLine, isLoading, isError, refetch } = useReportingLine(userId);
  const { data: allUsers } = useUsers();
  const addSecondaryManager = useAddSecondaryManager(userId);
  const removeSecondaryManager = useRemoveSecondaryManager(userId);
  const changePrimaryManager = useChangePrimaryManager(userId);

  const [isAddingSecondary, setIsAddingSecondary] = useState(false);
  const [isChangingPrimary, setIsChangingPrimary] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');

  const handleAddSecondary = () => {
    if (!selectedManagerId) return;
    
    addSecondaryManager.mutate(
      { manager_id: selectedManagerId },
      {
        onSuccess: () => {
          setSelectedManagerId('');
          setIsAddingSecondary(false);
        },
      }
    );
  };

  const handleRemoveSecondary = (managerId: string) => {
    removeSecondaryManager.mutate({ managerId });
  };

  const handleChangePrimary = (managerId: string | null) => {
    changePrimaryManager.mutate(
      { manager_id: managerId },
      {
        onSuccess: () => {
          setIsChangingPrimary(false);
          setSelectedManagerId('');
        },
      }
    );
  };

  // Filter out the current user from potential managers
  const availableManagers = allUsers?.filter(u => u._id !== userId) || [];

  if (isLoading) {
    return <ReportingLinesSkeleton />;
  }

  if (isError || !reportingLine) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card p-6 text-center">
        <AlertCircle className="w-8 h-8 text-error mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-ink mb-1">Failed to load reporting structure</h3>
        <p className="text-sm text-ink-secondary mb-3">Something went wrong. Please try again.</p>
        <button
          onClick={() => refetch()}
          className="h-8 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const { primary_manager, secondary_managers, direct_reports } = reportingLine;

  return (
    <div className="space-y-4">
      {/* ── Primary Manager ── */}
      <div className="bg-white rounded-lg border border-line shadow-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">Primary Manager</h3>
            <span className="text-[11px] font-medium text-ink-muted bg-surface-alt px-2 py-0.5 rounded-full">
              Direct Report
            </span>
          </div>
          <button
            onClick={() => {
              setIsChangingPrimary(!isChangingPrimary);
              setSelectedManagerId(primary_manager?._id || '');
            }}
            className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
          >
            {primary_manager ? 'Change' : 'Assign'}
          </button>
        </div>

        {isChangingPrimary ? (
          <div className="space-y-2">
            <select
              value={selectedManagerId}
              onChange={(e) => setSelectedManagerId(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
            >
              <option value="">No primary manager</option>
              {availableManagers.map((user) => (
                <option key={user._id} value={user._id}>
                  {user.full_name} ({user.email})
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleChangePrimary(selectedManagerId || null)}
                disabled={!selectedManagerId && !primary_manager}
                className="h-8 px-3 text-xs font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Confirm
              </button>
              <button
                onClick={() => {
                  setIsChangingPrimary(false);
                  setSelectedManagerId('');
                }}
                className="h-8 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : primary_manager ? (
          <ManagerCard user={primary_manager} />
        ) : (
          <EmptyManagerState message="No primary manager assigned" />
        )}
      </div>

      {/* ── Secondary Managers ── */}
      <div className="bg-white rounded-lg border border-line shadow-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">Secondary Managers</h3>
            <span className="text-[11px] font-medium text-ink-muted bg-surface-alt px-2 py-0.5 rounded-full">
              {secondary_managers.length} {secondary_managers.length === 1 ? 'manager' : 'managers'}
            </span>
          </div>
          {!isAddingSecondary && (
            <button
              onClick={() => setIsAddingSecondary(true)}
              className="text-xs font-medium text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Manager
            </button>
          )}
        </div>

        {isAddingSecondary && (
          <div className="space-y-2 mb-3">
            <select
              value={selectedManagerId}
              onChange={(e) => setSelectedManagerId(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              disabled={addSecondaryManager.isPending}
            >
              <option value="">Select a manager...</option>
              {availableManagers
                .filter(
                  (u) =>
                    !secondary_managers.some((sm) => sm._id === u._id)
                )
                .map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.full_name} ({user.email})
                  </option>
                ))}
            </select>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddSecondary}
                disabled={!selectedManagerId || addSecondaryManager.isPending}
                className="h-8 px-3 text-xs font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {addSecondaryManager.isPending ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => {
                  setIsAddingSecondary(false);
                  setSelectedManagerId('');
                }}
                disabled={addSecondaryManager.isPending}
                className="h-8 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {secondary_managers.length === 0 && !isAddingSecondary ? (
          <EmptyManagerState message="No secondary managers assigned" />
        ) : (
          <div className="space-y-2">
            {secondary_managers.map((manager) => (
              <ManagerCard
                key={manager._id}
                user={manager}
                onRemove={() => handleRemoveSecondary(manager._id)}
                isRemoving={removeSecondaryManager.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Direct Reports ── */}
      <div className="bg-white rounded-lg border border-line shadow-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-ink-secondary" />
          <h3 className="text-sm font-semibold text-ink">Direct Reports</h3>
          <span className="text-[11px] font-medium text-ink-muted bg-surface-alt px-2 py-0.5 rounded-full">
            {direct_reports.length} {direct_reports.length === 1 ? 'person' : 'people'}
          </span>
        </div>

        {direct_reports.length === 0 ? (
          <EmptyManagerState message="No direct reports" />
        ) : (
          <div className="space-y-2">
            {direct_reports.map((report) => (
              <div
                key={report._id}
                className="flex items-center justify-between p-3 rounded-md border border-line bg-surface hover:bg-surface-alt transition-colors"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar name={report.full_name} avatarUrl={report.avatar_url} />
                  <div>
                    <p className="text-sm font-medium text-ink">{report.full_name}</p>
                    <p className="text-xs text-ink-secondary">{report.email}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                    report.reports_as === 'primary'
                      ? 'bg-primary-light text-primary'
                      : 'bg-surface-alt text-ink-secondary'
                  )}
                >
                  {report.reports_as === 'primary' ? 'Primary' : 'Secondary'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface ManagerCardProps {
  user: {
    _id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
  };
  onRemove?: () => void;
  isRemoving?: boolean;
}

function ManagerCard({ user, onRemove, isRemoving }: ManagerCardProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-md border border-line bg-surface hover:bg-surface-alt transition-colors group">
      <div className="flex items-center gap-3">
        <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} />
        <div>
          <p className="text-sm font-medium text-ink">{user.full_name}</p>
          <p className="text-xs text-ink-secondary">{user.email}</p>
        </div>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          disabled={isRemoving}
          className="opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded-md hover:bg-error-light hover:text-error transition-all disabled:opacity-50"
          aria-label={`Remove ${user.full_name} as secondary manager`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function EmptyManagerState({ message }: { message: string }) {
  return (
    <div className="text-center py-6">
      <Users className="w-8 h-8 text-ink-muted mx-auto mb-2" />
      <p className="text-sm text-ink-muted">{message}</p>
    </div>
  );
}

function ReportingLinesSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-lg border border-line shadow-card p-5">
          <div className="h-4 bg-skeleton rounded animate-pulse w-32 mb-3" />
          <div className="space-y-2">
            {[1, 2].map((j) => (
              <div key={j} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-skeleton rounded-full animate-pulse" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 bg-skeleton rounded animate-pulse w-24" />
                  <div className="h-2 bg-skeleton rounded animate-pulse w-32" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function UserAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        width={32}
        height={32}
        className="w-8 h-8 rounded-full object-cover"
      />
    );
  }

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center text-xs font-semibold text-primary">
      {initials}
    </div>
  );
}
