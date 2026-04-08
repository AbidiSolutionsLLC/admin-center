// src/features/audit/components/AuditLogTable.tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { AuditEvent } from '@/types';

interface AuditLogTableProps {
  events: (AuditEvent & { actor_name?: string })[];
  isLoading: boolean;
  onRowClick: (event: AuditEvent) => void;
}

/**
 * Audit Log Table Component
 * Shows audit events with expandable rows for before/after diff.
 * Used on: AuditLogsPage
 */
export function AuditLogTable({ events, isLoading, onRowClick }: AuditLogTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatState = (state: unknown) => {
    if (!state) return '—';
    return JSON.stringify(state, null, 2);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
        <div className="p-12 text-center">
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 bg-skeleton rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card p-16 text-center">
        <div className="w-12 h-12 rounded-xl bg-primary-light flex items-center justify-center mx-auto mb-4">
          <ExternalLink className="w-6 h-6 text-primary" />
        </div>
        <h3 className="text-sm font-semibold text-ink mb-1">No audit events</h3>
        <p className="text-sm text-ink-secondary mb-5">
          Audit events will appear here once users start making changes.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-surface-alt border-b border-line">
            <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider w-10">
              {/* Expand chevron */}
            </th>
            <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
              Timestamp
            </th>
            <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
              Actor
            </th>
            <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
              Action
            </th>
            <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
              Module
            </th>
            <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
              Object
            </th>
            <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
              IP Address
            </th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const isExpanded = expandedRows.has(event._id);

            return (
              <>
                <tr
                  key={event._id}
                  className={cn(
                    'border-b border-line last:border-0 transition-colors duration-100 cursor-pointer',
                    isExpanded ? 'bg-primary-light' : 'hover:bg-surface-alt'
                  )}
                >
                  <td className="h-14 px-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRow(event._id);
                      }}
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-surface-alt transition-colors"
                    >
                      {event.before_state || event.after_state ? (
                        isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-ink" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-ink-secondary" />
                        )
                      ) : null}
                    </button>
                  </td>
                  <td
                    className="h-14 px-4 text-sm text-ink"
                    onClick={() => onRowClick(event)}
                  >
                    <div className="text-sm text-ink">{formatDate(event.created_at)}</div>
                  </td>
                  <td
                    className="h-14 px-4 text-sm"
                    onClick={() => onRowClick(event)}
                  >
                    <div className="text-sm text-ink">{event.actor_name || event.actor_email}</div>
                    <div className="text-xs text-ink-secondary font-mono">{event.actor_email}</div>
                  </td>
                  <td className="h-14 px-4 text-sm">
                    <span className="inline-flex items-center font-mono text-xs bg-primary-light text-primary border border-primary/20 rounded-md px-2 py-0.5">
                      {event.action}
                    </span>
                  </td>
                  <td
                    className="h-14 px-4 text-sm text-ink-secondary capitalize"
                    onClick={() => onRowClick(event)}
                  >
                    {event.module.replace('_', ' ')}
                  </td>
                  <td
                    className="h-14 px-4 text-sm"
                    onClick={() => onRowClick(event)}
                  >
                    <div className="text-sm text-ink">{event.object_label}</div>
                    <div className="text-xs text-ink-secondary">{event.object_type}</div>
                  </td>
                  <td
                    className="h-14 px-4 text-sm font-mono text-ink-secondary"
                    onClick={() => onRowClick(event)}
                  >
                    {event.ip_address || '—'}
                  </td>
                </tr>

                {/* Expanded row with before/after state */}
                {isExpanded && (event.before_state || event.after_state) && (
                  <tr className="bg-surface-alt border-b border-line">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Before State */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
                            Before
                          </h4>
                          <pre className="bg-white rounded-md border border-line p-3 text-xs font-mono text-ink overflow-auto max-h-64">
                            {formatState(event.before_state)}
                          </pre>
                        </div>

                        {/* After State */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
                            After
                          </h4>
                          <pre className="bg-white rounded-md border border-line p-3 text-xs font-mono text-ink overflow-auto max-h-64">
                            {formatState(event.after_state)}
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
