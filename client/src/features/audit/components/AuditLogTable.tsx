// src/features/audit/components/AuditLogTable.tsx
import React, { useState } from 'react';
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

  const getModuleTagColor = (module: string) => {
    switch (module) {
      case 'people':
      case 'users':
        return 'bg-primary-light text-primary border-primary/20';
      case 'organization':
      case 'departments':
      case 'group':
      case 'groups':
        return 'bg-info/10 text-info border-info/20';
      case 'roles':
      case 'permissions':
      case 'custom_field':
      case 'custom_fields':
      case 'data_fields':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'apps':
      case 'workflow':
      case 'workflows':
        return 'bg-success/10 text-success border-success/20';
      case 'policy':
      case 'policies':
        return 'bg-error/10 text-error border-error/20';
      default:
        return 'bg-surface-alt text-ink-secondary border-line';
    }
  };

  if (isLoading) {
    return (
      <div className="w-full">
        <div className="h-10 px-4 border-b border-line bg-surface-alt flex items-center gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-3 bg-surface rounded animate-pulse" style={{ width: `${60 + i * 20}px` }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 px-4 border-b border-line last:border-0 flex items-center gap-6">
            <div className="w-8 h-8 rounded-full bg-surface animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-surface rounded animate-pulse w-1/3" />
              <div className="h-2.5 bg-surface rounded animate-pulse w-1/4" />
            </div>
            <div className="h-3 bg-surface rounded animate-pulse w-20" />
            <div className="h-5 bg-surface rounded-full animate-pulse w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-12 h-12 rounded-xl bg-primary-light flex items-center justify-center mb-4">
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
    <div className="w-full">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-surface-alt border-b border-line">
            <th className="h-10 px-4 w-10"></th>
            <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Timestamp</th>
            <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Actor</th>
            <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Action</th>
            <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Category / Module</th>
            <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Object</th>
            <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">IP Address</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const isExpanded = expandedRows.has(event._id);

            return (
              <React.Fragment key={event._id}>
                <tr
                  className={cn(
                    "border-b border-line cursor-pointer transition-colors duration-100",
                    isExpanded ? "bg-primary-light" : "hover:bg-surface-alt"
                  )}
                  onClick={() => onRowClick(event)}
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
                  <td className="h-14 px-4">
                    <div className="text-sm text-ink">{formatDate(event.created_at)}</div>
                  </td>
                  <td className="h-14 px-4">
                    <div className="text-sm text-ink">{event.actor_name || event.actor_email}</div>
                    <div className="text-xs text-ink-secondary font-mono">{event.actor_email}</div>
                  </td>
                  <td className="h-14 px-4">
                    <span className={`inline-flex items-center font-mono text-xs border rounded-md px-2 py-0.5 ${getModuleTagColor(event.module)}`}>
                      {event.action}
                    </span>
                  </td>
                  <td className="h-14 px-4">
                    <div className="text-sm text-ink-secondary capitalize">{event.module.replace('_', ' ')}</div>
                  </td>
                  <td className="h-14 px-4">
                    <div className="text-sm text-ink">{event.object_label}</div>
                    <div className="text-xs text-ink-secondary">{event.object_type}</div>
                  </td>
                  <td className="h-14 px-4">
                    <div className="text-sm font-mono text-ink-secondary">{event.ip_address || '—'}</div>
                  </td>
                </tr>

                {/* Expanded row with before/after state */}
                {isExpanded && Boolean(event.before_state || event.after_state) && (
                  <tr className="bg-surface-alt border-b border-line">
                    <td colSpan={7} className="px-6 py-5">
                      <div className="grid grid-cols-2 gap-6">
                        {/* Before State */}
                        <div className="space-y-2">
                          <h4 className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                            Before
                          </h4>
                          <pre className="rounded-lg border border-line p-4 text-xs font-mono text-ink overflow-auto max-h-64 bg-surface-alt shadow-sm">
                            {formatState(event.before_state)}
                          </pre>
                        </div>

                        {/* After State */}
                        <div className="space-y-2">
                          <h4 className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                            After
                          </h4>
                          <pre className="rounded-lg border border-line p-4 text-xs font-mono text-ink overflow-auto max-h-64 bg-surface-alt shadow-sm">
                            {formatState(event.after_state)}
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
  );
}
