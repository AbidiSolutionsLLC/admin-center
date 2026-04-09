// src/features/security/components/AccessLogTable.tsx
import { useState } from 'react';
import { Shield, AlertTriangle, LogOut, Search } from 'lucide-react';
import { useSecurityEvents } from '../hooks/useSecurityEvents';
import { useForceLogout } from '../hooks/useForceLogout';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { SecurityEvent } from '@/types';

/**
 * Access Log Table Component
 * Shows security events with suspicious rows highlighted in red.
 * Used on: SecurityPage (Access Log tab)
 */
export function AccessLogTable() {
  const [page, setPage] = useState(1);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('');
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [forceLogoutTarget, setForceLogoutTarget] = useState<SecurityEvent | null>(null);

  const {
    data,
    isLoading,
    error,
  } = useSecurityEvents({
    page,
    limit: 50,
    event_type: eventTypeFilter || undefined,
    is_suspicious: suspiciousOnly ? true : undefined,
    email: searchEmail || undefined,
  });

  const forceLogoutMutation = useForceLogout();

  const handleForceLogout = async () => {
    if (forceLogoutTarget?.user_id) {
      await forceLogoutMutation.mutateAsync(forceLogoutTarget.user_id);
      setForceLogoutTarget(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getEventTypeBadge = (eventType: string) => {
    const config: Record<string, { label: string; class: string }> = {
      login_attempt: { label: 'Attempt', class: 'bg-surface-alt text-ink-muted border border-line' },
      login_success: { label: 'Success', class: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
      login_failure: { label: 'Failed', class: 'bg-red-50 text-red-700 border border-red-200' },
      logout: { label: 'Logout', class: 'bg-sky-50 text-sky-700 border border-sky-200' },
      token_revoked: { label: 'Token Revoked', class: 'bg-amber-50 text-amber-700 border border-amber-200' },
    };

    const badge = config[eventType] || { label: eventType, class: 'bg-surface-alt text-ink-muted border border-line' };

    return (
      <span className={`inline-flex items-center text-[11px] font-semibold tracking-wide rounded-full px-2.5 py-0.5 ${badge.class}`}>
        {badge.label}
      </span>
    );
  };

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card p-12 text-center">
        <p className="text-sm text-error">Failed to load access log</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
          <input
            type="text"
            placeholder="Search by email..."
            value={searchEmail}
            onChange={(e) => {
              setSearchEmail(e.target.value);
              setPage(1);
            }}
            className="w-full h-9 pl-8 pr-4 text-sm rounded-md border border-line bg-white text-ink
                       placeholder:text-ink-muted
                       focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                       transition-all duration-150"
          />
        </div>

        <select
          value={eventTypeFilter}
          onChange={(e) => {
            setEventTypeFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                     focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                     transition-all duration-150 min-w-[150px]"
        >
          <option value="">All Events</option>
          <option value="login_attempt">Login Attempt</option>
          <option value="login_success">Login Success</option>
          <option value="login_failure">Login Failure</option>
          <option value="logout">Logout</option>
          <option value="token_revoked">Token Revoked</option>
        </select>

        <button
          onClick={() => {
            setSuspiciousOnly(!suspiciousOnly);
            setPage(1);
          }}
          className={`h-9 px-3 text-sm font-medium rounded-md border transition-colors flex items-center gap-2 ${
            suspiciousOnly
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-white text-ink border-line hover:bg-surface-alt'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Suspicious Only
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
        ) : !data?.events.length ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary-light flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-ink mb-1">No security events</h3>
            <p className="text-sm text-ink-secondary mb-5">
              Security events will appear here once users start logging in.
            </p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="bg-surface-alt border-b border-line">
                  <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                    User
                  </th>
                  <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                    Event Type
                  </th>
                  <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                    IP Address
                  </th>
                  <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                    Status
                  </th>
                  <th className="h-10 px-4 text-center text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((event) => {
                  const isSuspicious = event.is_suspicious;

                  return (
                    <tr
                      key={event._id}
                      className={`border-b border-line last:border-0 transition-colors duration-100 ${
                        isSuspicious
                          ? 'bg-red-50 hover:bg-red-100'
                          : 'hover:bg-surface-alt'
                      }`}
                    >
                      <td className="h-14 px-4 text-sm text-ink">
                        <div className="text-sm text-ink">{formatDate(event.created_at)}</div>
                      </td>
                      <td className="h-14 px-4 text-sm">
                        <div className="text-sm text-ink">
                          {event.user?.full_name || event.email || 'Unknown'}
                        </div>
                        <div className="text-xs text-ink-secondary font-mono">
                          {event.email || event.user?.email || 'N/A'}
                        </div>
                      </td>
                      <td className="h-14 px-4 text-sm">
                        {getEventTypeBadge(event.event_type)}
                      </td>
                      <td className="h-14 px-4 text-sm font-mono text-ink-secondary">
                        {event.ip_address || '—'}
                      </td>
                      <td className="h-14 px-4 text-sm">
                        {isSuspicious ? (
                          <div className="flex items-center gap-1.5 text-error font-medium text-xs">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Suspicious
                          </div>
                        ) : (
                          <div className="text-xs text-ink-muted">Normal</div>
                        )}
                      </td>
                      <td className="h-14 px-4 text-center">
                        {event.user_id && (
                          <button
                            onClick={() => setForceLogoutTarget(event)}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-secondary hover:text-error hover:bg-red-50 transition-colors"
                            title="Force Logout"
                          >
                            <LogOut className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
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
                    className="h-8 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                    disabled={page === data.pagination.totalPages}
                    className="h-8 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Force Logout Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!forceLogoutTarget}
        onClose={() => setForceLogoutTarget(null)}
        onConfirm={handleForceLogout}
        title="Force Logout User"
        description={`This will immediately terminate all active sessions for ${
          forceLogoutTarget?.user?.full_name || forceLogoutTarget?.email || 'this user'
        }. They will need to log in again.`}
        confirmLabel="Force Logout"
        variant="danger"
        isLoading={forceLogoutMutation.isPending}
      />
    </div>
  );
}
