// src/pages/audit-logs/AuditLogsPage.tsx
import { useState } from 'react';
import { Download } from 'lucide-react';
import { useAuditEvents } from '@/features/audit/hooks/useAuditEvents';
import { useExportAuditLog } from '@/features/audit/hooks/useExportAuditLog';
import { useAuditEventDetail } from '@/features/audit/hooks/useAuditEventDetail';
import { AuditFilters } from '@/features/audit/components/AuditFilters';
import { AuditLogTable } from '@/features/audit/components/AuditLogTable';
import { AuditEventDetail } from '@/features/audit/components/AuditEventDetail';
import { PermissionGate } from '@/components/ui/PermissionGate';
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

  const { data, isLoading, error } = useAuditEvents({
    page,
    limit: 50,
    ...filters,
  });

  const exportMutation = useExportAuditLog();
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

  const handleExport = () => {
    exportMutation.mutate(filters);
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            Audit Logs
          </h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            Track all actions and changes across your organization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PermissionGate module="audit" action="export">
            <button
              onClick={handleExport}
              disabled={exportMutation.isPending}
              style={{
                height: 38,
                padding: '0 18px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 12,
                color: '#f8fafc',
                fontWeight: 600,
                fontSize: 13,
                cursor: exportMutation.isPending ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                opacity: exportMutation.isPending ? 0.5 : 1,
              }}
            >
              <Download className="w-4 h-4" />
              {exportMutation.isPending ? 'Exporting...' : 'Export CSV'}
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="glass-card p-12 text-center" style={{ borderRadius: 20 }}>
          <p className="text-sm text-error mb-3">Failed to load audit logs</p>
          <p className="text-sm text-ink-secondary mb-4">
            Something went wrong. Check your connection and try again.
          </p>
        </div>
      )}

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

      {/* Table */}
      <AuditLogTable
        events={data?.events || []}
        isLoading={isLoading}
        onRowClick={handleRowClick}
      />

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="glass-card px-4 py-3 flex items-center justify-between mt-4" style={{ borderRadius: 20 }}>
          <span className="text-xs text-ink-secondary">
            Showing {(data.pagination.page - 1) * data.pagination.limit + 1}–
            {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{' '}
            {data.pagination.total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: '6px 12px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 8,
                color: '#f8fafc',
                fontWeight: 600,
                fontSize: 12,
                cursor: page === 1 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                opacity: page === 1 ? 0.5 : 1,
              }}
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
              disabled={page === data.pagination.totalPages}
              style={{
                padding: '6px 12px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 8,
                color: '#f8fafc',
                fontWeight: 600,
                fontSize: 12,
                cursor: page === data.pagination.totalPages ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                opacity: page === data.pagination.totalPages ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      <AuditEventDetail
        event={detailEvent || selectedEvent}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
      />
    </div>
  );
}
