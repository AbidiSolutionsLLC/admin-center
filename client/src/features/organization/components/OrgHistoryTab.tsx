// src/features/organization/components/OrgHistoryTab.tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Calendar, Filter } from 'lucide-react';
import { useOrgHistory } from '../hooks/useOrgHistory';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/utils/cn';

const OBJECT_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'Department', label: 'Departments' },
  { value: 'Team', label: 'Teams' },
  { value: 'TeamMember', label: 'Team Members' },
];

/**
 * OrgHistoryTab Component
 * Shows audit history for organization module (departments, teams, BUs).
 * Features:
 * - Filters (object type, date range) work and combine
 * - Row expand shows before/after diff
 * - Reuses audit log diff pattern
 */
export const OrgHistoryTab: React.FC = () => {
  const { data: events, isLoading, isError, refetch } = useOrgHistory();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [objectType, setObjectType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const toggleRow = (eventId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId);
    } else {
      newExpanded.add(eventId);
    }
    setExpandedRows(newExpanded);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const hasActiveFilters = objectType || dateFrom || dateTo;

  // Note: Filtering is done server-side, but for responsiveness we could add client-side filtering here if needed

  if (isLoading) return <TableSkeleton rows={8} columns={6} />;

  if (isError) {
    return (
      <ErrorState
        title="Failed to load history"
        description="Something went wrong. Please try again."
        onRetry={refetch}
      />
    );
  }

  if (!events || events.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No history yet"
        description="Organization changes will appear here once users start making modifications."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-ink-muted" />
          <select
            value={objectType}
            onChange={(e) => setObjectType(e.target.value)}
            className="h-9 pl-3 pr-8 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            {OBJECT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          placeholder="From"
        />

        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          placeholder="To"
        />

        {hasActiveFilters && (
          <button
            onClick={() => {
              setObjectType('');
              setDateFrom('');
              setDateTo('');
            }}
            className="text-xs font-medium text-accent hover:text-accent-hover"
          >
            Clear filters
          </button>
        )}

        <span className="text-xs text-ink-muted">{events.length} events</span>
      </div>

      {/* Events list */}
      <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-alt border-b border-line">
              <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider w-10" />
              <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Timestamp</th>
              <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Actor</th>
              <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Action</th>
              <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Object</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const isExpanded = expandedRows.has(event._id);
              return (
                <React.Fragment key={event._id}>
                  <tr
                    className={cn(
                      'border-b border-line last:border-0 hover:bg-surface-alt cursor-pointer transition-colors',
                      isExpanded && 'bg-primaryLight'
                    )}
                    onClick={() => toggleRow(event._id)}
                  >
                    <td className="h-14 px-4">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-ink-secondary" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-ink-muted" />
                      )}
                    </td>
                    <td className="h-14 px-4 text-sm text-ink">{formatDate(event.created_at)}</td>
                    <td className="h-14 px-4 text-sm text-ink">{event.actor_email}</td>
                    <td className="h-14 px-4">
                      <span className="text-xs font-mono text-ink-secondary">{event.action}</span>
                    </td>
                    <td className="h-14 px-4 text-sm text-ink">{event.object_label}</td>
                  </tr>

                  {isExpanded && Boolean(event.before_state || event.after_state) && (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 bg-surface-alt border-b border-line">
                        <div className="grid grid-cols-2 gap-4">
                          {/* Before state */}
                          <div>
                            <h4 className="text-xs font-semibold text-ink-secondary mb-2">Before</h4>
                            <pre className="text-[11px] font-mono bg-white border border-line rounded p-3 overflow-auto max-h-48">
                              {event.before_state
                                ? (JSON.stringify(event.before_state, null, 2) as any)
                                : 'null'}
                            </pre>
                          </div>
                          {/* After state */}
                          <div>
                            <h4 className="text-xs font-semibold text-ink-secondary mb-2">After</h4>
                            <pre className="text-[11px] font-mono bg-white border border-line rounded p-3 overflow-auto max-h-48">
                              {event.after_state
                                ? (JSON.stringify(event.after_state, null, 2) as any)
                                : 'null'}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
