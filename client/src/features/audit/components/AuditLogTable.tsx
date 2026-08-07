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
      <div className="glass-card" style={{ borderRadius: 20, overflow: 'hidden' }}>
        <div className="p-12 text-center">
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 bg-white/5 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="glass-card p-16 text-center" style={{ borderRadius: 20 }}>
        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-4">
          <ExternalLink className="w-6 h-6 text-primary" />
        </div>
        <h3 className="text-sm font-semibold text-ink mb-1">No audit events</h3>
        <p className="text-sm text-ink-secondary mb-5">
          Audit events will appear here once users start making changes.
        </p>
      </div>
    );
  }

  const thStyle = {
    padding: '14px 20px',
    fontWeight: 900,
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.18em',
    color: '#94a3b8',
    textAlign: 'left' as const,
  };

  const tdStyle = {
    padding: '18px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  };

  return (
    <div className="glass-card" style={{ borderRadius: 20, overflow: 'hidden' }}>
      <table className="glass-table w-full" style={{ borderCollapse: 'separate', borderSpacing: '0 3px' }}>
        <thead>
          <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
            <th style={{ ...thStyle, width: 40 }}>
              {/* Expand chevron */}
            </th>
            <th style={thStyle}>Timestamp</th>
            <th style={thStyle}>Actor</th>
            <th style={thStyle}>Action</th>
            <th style={thStyle}>Module</th>
            <th style={thStyle}>Object</th>
            <th style={thStyle}>IP Address</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const isExpanded = expandedRows.has(event._id);

            return (
              <>
                <tr
                  key={event._id}
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: isExpanded ? 'rgba(245,176,42,0.08)' : 'transparent',
                  }}
                  onMouseEnter={e => {
                    if (!isExpanded) {
                      (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.03)';
                      (e.currentTarget as HTMLTableRowElement).style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isExpanded) {
                      (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
                      (e.currentTarget as HTMLTableRowElement).style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <td style={tdStyle}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRow(event._id);
                      }}
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
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
                  <td style={tdStyle} onClick={() => onRowClick(event)}>
                    <div className="text-sm text-ink">{formatDate(event.created_at)}</div>
                  </td>
                  <td style={tdStyle} onClick={() => onRowClick(event)}>
                    <div className="text-sm text-ink">{event.actor_name || event.actor_email}</div>
                    <div className="text-xs text-ink-secondary font-mono">{event.actor_email}</div>
                  </td>
                  <td style={tdStyle}>
                    <span className="inline-flex items-center font-mono text-xs bg-white/5 text-primary border border-primary/20 rounded-md px-2 py-0.5">
                      {event.action}
                    </span>
                  </td>
                  <td style={tdStyle} onClick={() => onRowClick(event)}>
                    <div className="text-sm text-ink-secondary capitalize">{event.module.replace('_', ' ')}</div>
                  </td>
                  <td style={tdStyle} onClick={() => onRowClick(event)}>
                    <div className="text-sm text-ink">{event.object_label}</div>
                    <div className="text-xs text-ink-secondary">{event.object_type}</div>
                  </td>
                  <td style={tdStyle} onClick={() => onRowClick(event)}>
                    <div className="text-sm font-mono text-ink-secondary">{event.ip_address || '—'}</div>
                  </td>
                </tr>

                {/* Expanded row with before/after state */}
                {isExpanded && (event.before_state || event.after_state) && (
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <td colSpan={7} className="px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Before State */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
                            Before
                          </h4>
                          <pre className="rounded-xl border border-[rgba(255,255,255,0.08)] p-4 text-xs font-mono text-ink overflow-auto max-h-64" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            {formatState(event.before_state)}
                          </pre>
                        </div>

                        {/* After State */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
                            After
                          </h4>
                          <pre className="rounded-xl border border-[rgba(255,255,255,0.08)] p-4 text-xs font-mono text-ink overflow-auto max-h-64" style={{ background: 'rgba(255,255,255,0.03)' }}>
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
