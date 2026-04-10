// src/features/integrations/components/SyncLogViewer.tsx
import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import type { IntegrationSyncLog } from '@/types';
import { cn } from '@/utils/cn';

interface SyncLogViewerProps {
  logs: IntegrationSyncLog[];
  isLoading: boolean;
  isError: boolean;
}

const STATUS_CONFIG = {
  success: {
    label: 'Success',
    class: 'bg-successLight text-success border-successBorder',
    icon: CheckCircle,
  },
  failed: {
    label: 'Failed',
    class: 'bg-errorLight text-error border-errorBorder',
    icon: XCircle,
  },
  partial: {
    label: 'Partial',
    class: 'bg-warningLight text-warning border-warningBorder',
    icon: AlertCircle,
  },
};

/**
 * SyncLogViewer Component
 * Displays sync history for an integration in a table format.
 * Used on: IntegrationsPage (sync log modal).
 */
export const SyncLogViewer: React.FC<SyncLogViewerProps> = ({
  logs,
  isLoading,
  isError,
}) => {
  if (isLoading) {
    return <TableSkeleton rows={6} columns={6} />;
  }

  if (isError) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card p-8 text-center">
        <p className="text-sm text-error">Failed to load sync logs</p>
      </div>
    );
  }

  if (!logs?.length) {
    return (
      <EmptyState
        title="No sync logs yet"
        description="Sync logs will appear here after you run your first sync."
        icon={Clock}
      />
    );
  }

  return (
    <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-base border-b border-line">
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Status</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Triggered By</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Started</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Duration</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Processed</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Created</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Updated</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const statusConfig = STATUS_CONFIG[log.status];
              const StatusIcon = statusConfig.icon;

              return (
                <tr
                  key={log._id}
                  className="border-b border-line last:border-0 hover:bg-surface-base transition-colors duration-100"
                >
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2.5 py-0.5', statusConfig.class)}>
                      <StatusIcon className="w-3 h-3" />
                      {statusConfig.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm capitalize text-ink">{log.triggered_by}</td>
                  <td className="px-4 py-3 text-sm text-ink-secondary">
                    {formatDate(log.started_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-secondary font-mono">
                    {log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink">{log.records_processed ?? 0}</td>
                  <td className="px-4 py-3 text-sm text-success">{log.records_created ?? 0}</td>
                  <td className="px-4 py-3 text-sm text-accent">{log.records_updated ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Error Message */}
      {logs.some((log) => log.error_message) && (
        <div className="p-4 border-t border-line">
          {logs
            .filter((log) => log.error_message)
            .map((log) => (
              <div key={log._id} className="mb-2 p-2 bg-warningLight border border-warningBorder rounded text-xs text-warning">
                <strong>{formatDate(log.started_at)}:</strong> {log.error_message}
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
