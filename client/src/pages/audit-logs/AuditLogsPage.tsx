// src/pages/audit-logs/AuditLogsPage.tsx
import { useState } from 'react';
import { Download, ShieldCheck } from 'lucide-react';
import { ListPage } from '@/components/templates/ListPage';
import { useAuditEvents } from '@/features/audit/hooks/useAuditEvents';
import { useExportAuditLog } from '@/features/audit/hooks/useExportAuditLog';
import { useVerifyAuditLogs } from '@/features/audit/hooks/useVerifyAuditLogs';
import { useAuditEventDetail } from '@/features/audit/hooks/useAuditEventDetail';
import { AuditFilters } from '@/features/audit/components/AuditFilters';
import { AuditLogTable } from '@/features/audit/components/AuditLogTable';
import { AuditEventDetail } from '@/features/audit/components/AuditEventDetail';
import { PermissionGate } from '@/components/ui/PermissionGate';
import { Switch } from '@/components/ui/switch';
import type { AuditEvent } from '@/types';

/**
 * Audit Logs Page
 * Displays all audit events with filters, pagination, and CSV export.
 * Route: /audit-logs
 */
export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    module: '',
    action: '',
    actor_email: '',
    date_from: '',
    date_to: '',
  });

  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isLive, setIsLive] = useState(false);

  const { data, isLoading, error, refetch } = useAuditEvents({
    page,
    limit: 50,
    isLive,
    ...filters,
  });

  const exportMutation = useExportAuditLog();
  const verifyMutation = useVerifyAuditLogs();
  const { data: detailEvent } = useAuditEventDetail(selectedEvent?._id || null);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page when filters change
  };

  const handleClearAll = () => {
    setFilters({
      search: '',
      module: '',
      action: '',
      actor_email: '',
      date_from: '',
      date_to: '',
    });
    setPage(1);
  };

  const handleRowClick = (event: AuditEvent) => {
    setSelectedEvent(event);
    setIsDetailOpen(true);
  };

  const handleExport = (format: 'csv' | 'json') => {
    exportMutation.mutate({ ...filters, format });
  };

  const actions = (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2 border-r border-line pr-4">
        <div className="flex flex-col items-end">
          <span className="text-body font-medium text-ink">Live updates</span>
          <span className="text-label normal-case tracking-normal text-ink-secondary">Auto-refresh latest events</span>
        </div>
        <Switch checked={isLive} onCheckedChange={setIsLive} aria-label="Live updates" />
      </div>
      <PermissionGate module="audit_logs" action="export">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            disabled={exportMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-surface-alt text-ink hover:bg-surface-hover transition-colors duration-150 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            disabled={exportMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-surface-alt text-ink hover:bg-surface-hover transition-colors duration-150 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            JSON
          </button>
          <button
            onClick={() => verifyMutation.mutate()}
            disabled={verifyMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-surface-alt text-ink hover:bg-surface-hover transition-colors duration-150 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShieldCheck className="w-4 h-4" />
            {verifyMutation.isPending ? 'Verifying...' : 'Verify Integrity'}
          </button>
        </div>
      </PermissionGate>
    </div>
  );

  return (
    <ListPage
      title="Audit log"
      subtitle="Track all actions and changes across your organization"
      primaryAction={actions}
      isError={!!error}
      onRetry={() => refetch()}
    >
      <div className="space-y-5">
      {/* Filters */}
      <AuditFilters
        search={filters.search}
        onSearchChange={(value) => handleFilterChange('search', value)}
        module={filters.module}
        onModuleChange={(value) => handleFilterChange('module', value)}
        action={filters.action}
        onActionChange={(value) => handleFilterChange('action', value)}
        actorEmail={filters.actor_email}
        onActorEmailChange={(value) => handleFilterChange('actor_email', value)}
        dateFrom={filters.date_from}
        onDateFromChange={(value) => handleFilterChange('date_from', value)}
        dateTo={filters.date_to}
        onDateToChange={(value) => handleFilterChange('date_to', value)}
        onClearAll={handleClearAll}
      />

      {/* Main Content Card with Table and Pagination */}
      <div className="bg-surface backdrop-blur-glass rounded-2xl border border-line shadow-card overflow-hidden">
        <AuditLogTable
          events={data?.events || []}
          isLoading={isLoading}
          onRowClick={handleRowClick}
        />

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="border-t border-line px-4 py-3 flex items-center justify-between bg-surface-alt">
            <span className="text-xs text-ink-secondary">
              Showing {(data.pagination.page - 1) * data.pagination.limit + 1}–
              {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{' '}
              {data.pagination.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 px-3 text-sm font-medium rounded-md border border-line bg-surface-alt text-ink hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                disabled={page === data.pagination.totalPages}
                className="h-8 px-3 text-sm font-medium rounded-md border border-line bg-surface-alt text-ink hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Event Detail Modal */}
      <AuditEventDetail
        event={detailEvent || selectedEvent}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
      />
      </div>
    </ListPage>
  );
}
