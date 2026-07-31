// src/features/security/components/ActiveSessionsTable.tsx
import { useState } from 'react';
import { Activity, LogOut, Clock, Smartphone, Globe } from 'lucide-react';
import { useActiveSessions } from '../hooks/useActiveSessions';
import { useTerminateSession } from '../hooks/useTerminateSession';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { ActiveSession } from '@/types';

/**
 * Active Sessions Table Component
 * Shows currently active sessions and allows termination.
 * Used on: SecurityPage (Active Sessions tab)
 */
export function ActiveSessionsTable() {
  const [terminateTarget, setTerminateTarget] = useState<ActiveSession | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin'>('all');

  const { data: sessions, isLoading, error } = useActiveSessions(roleFilter === 'admin' ? 'admin' : undefined);
  const terminateMutation = useTerminateSession();

  const handleTerminate = async () => {
    if (terminateTarget) {
      await terminateMutation.mutateAsync(terminateTarget._id);
      setTerminateTarget(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card p-12 text-center">
        <p className="text-sm text-error">Failed to load active sessions</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setRoleFilter('all')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            roleFilter === 'all'
              ? 'bg-surface-alt text-ink border border-line shadow-sm'
              : 'text-ink-secondary hover:text-ink hover:bg-surface-alt/50'
          }`}
        >
          All Sessions
        </button>
        <button
          onClick={() => setRoleFilter('admin')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            roleFilter === 'admin'
              ? 'bg-surface-alt text-ink border border-line shadow-sm'
              : 'text-ink-secondary hover:text-ink hover:bg-surface-alt/50'
          }`}
        >
          Admin Sessions Only
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="animate-pulse space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-skeleton rounded" />
              ))}
            </div>
          </div>
        ) : !sessions?.length ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary-light flex items-center justify-center mb-4">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-ink mb-1">No active sessions</h3>
            <p className="text-sm text-ink-secondary mb-5">
              There are currently no active sessions.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-surface-alt border-b border-line">
                <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                  User
                </th>
                <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                  IP & Location
                </th>
                <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                  Device / Browser
                </th>
                <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                  Last Active
                </th>
                <th className="h-10 px-4 text-center text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr
                  key={session._id}
                  className="border-b border-line last:border-0 hover:bg-surface-alt transition-colors duration-100"
                >
                  <td className="h-14 px-4 text-sm">
                    <div className="text-sm text-ink">
                      {session.user?.full_name || 'Unknown'}
                    </div>
                    <div className="text-xs text-ink-secondary font-mono">
                      {session.user?.email || 'N/A'}
                    </div>
                  </td>
                  <td className="h-14 px-4 text-sm font-mono text-ink-secondary">
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-ink-muted" />
                      {session.ip_address || '—'}
                    </div>
                  </td>
                  <td className="h-14 px-4 text-sm text-ink-secondary">
                    <div className="flex items-center gap-1.5 truncate max-w-[200px]" title={session.user_agent}>
                      <Smartphone className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                      <span className="truncate">{session.user_agent || '—'}</span>
                    </div>
                  </td>
                  <td className="h-14 px-4 text-sm">
                    <div className="flex items-center gap-1.5 text-ink">
                      <Clock className="w-3.5 h-3.5 text-ink-muted" />
                      {formatDate(session.last_activity_at)}
                    </div>
                  </td>
                  <td className="h-14 px-4 text-center">
                    <button
                      onClick={() => setTerminateTarget(session)}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-secondary hover:text-error hover:bg-red-50 transition-colors"
                      title="Terminate Session"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Terminate Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!terminateTarget}
        onClose={() => setTerminateTarget(null)}
        onConfirm={handleTerminate}
        title="Terminate Session"
        description={`This will immediately terminate the selected session for ${
          terminateTarget?.user?.full_name || 'this user'
        }. They will need to log in again on that device.`}
        confirmLabel="Terminate"
        variant="danger"
        isLoading={terminateMutation.isPending}
      />
    </div>
  );
}
