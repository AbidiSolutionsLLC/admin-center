// src/features/people/components/UserHistoryPanel.tsx
import { useUserHistory } from '@/features/people/hooks/useUserHistory';
import type { AuditEvent } from '@/features/people/hooks/useUserHistory';

import { History, User, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

interface UserHistoryPanelProps {
  userId: string;
}

/**
 * UserHistoryPanel Component
 * Displays the audit history for a user, focusing on status changes.
 */
export function UserHistoryPanel({ userId }: UserHistoryPanelProps) {
  const { data: history, isLoading, isError, refetch } = useUserHistory(userId);

  if (isLoading) {
    return <UserHistorySkeleton />;
  }

  if (isError) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card p-6 text-center">
        <AlertCircle className="w-8 h-8 text-error mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-ink mb-1">Failed to load history</h3>
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

  if (!history || history.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card p-8 text-center">
        <History className="w-8 h-8 text-ink-muted mx-auto mb-2" />
        <p className="text-sm text-ink-muted">No history found for this user.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
      <div className="divide-y divide-line">
        {history.map((event) => (
          <HistoryItem key={event._id} event={event} />
        ))}
      </div>
    </div>
  );
}

function HistoryItem({ event }: { event: AuditEvent }) {
  const prevStatus = event.before_state?.lifecycle_state || event.before_state?.status || null;
  const newStatus = event.after_state?.lifecycle_state || event.after_state?.status || null;
  
  // Determine display label for the action
  const getActionLabel = (action: string) => {
    switch (action) {
      case 'user.lifecycle_changed': return 'Status Changed';
      case 'user.invited': return 'User Invited';
      case 'user.created': return 'User Created';
      case 'user.archived': return 'User Archived';
      case 'user.updated': return 'Profile Updated';
      case 'user.bulk_invited': return 'Bulk Invited';
      case 'user.bulk_lifecycle_changed': return 'Bulk Status Changed';
      default: return action.split('.').pop()?.replace(/_/g, ' ') || action;
    }
  };

  return (
    <div className="p-4 hover:bg-surface transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-8 w-8 rounded-full bg-surface-alt flex items-center justify-center flex-shrink-0">
            <Clock className="w-4 h-4 text-ink-secondary" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-ink capitalize">
                {getActionLabel(event.action)}
              </span>
              <span className="text-xs text-ink-muted">·</span>
              <span className="text-xs text-ink-muted">{formatDate(event.created_at)}</span>
            </div>
            
            {/* Status Transition Display */}
            {prevStatus !== newStatus && (
              <div className="flex items-center gap-2 mt-2 mb-2">
                <StatusBadge state={prevStatus} isPrevious />
                <span className="text-ink-muted">→</span>
                <StatusBadge state={newStatus} />
              </div>
            )}

            <div className="flex items-center gap-1.5 mt-1">
              <User className="w-3.5 h-3.5 text-ink-muted" />
              <p className="text-xs text-ink-secondary">
                Changed by <span className="font-medium text-ink">{event.actor_id?.full_name || event.actor_email}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ state, isPrevious }: { state: string | null; isPrevious?: boolean }) {
  if (!state) return <span className="text-xs text-ink-muted italic">None</span>;

  const config: Record<string, { bg: string; text: string; label: string }> = {
    invited: { bg: 'bg-primary-light', text: 'text-primary', label: 'Invited' },
    onboarding: { bg: 'bg-sky-50', text: 'text-sky-600', label: 'Onboarding' },
    active: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Active' },
    probation: { bg: 'bg-violet-50', text: 'text-violet-600', label: 'Probation' },
    on_leave: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'On Leave' },
    terminated: { bg: 'bg-red-50', text: 'text-red-600', label: 'Terminated' },
    archived: { bg: 'bg-surface-alt', text: 'text-ink-muted', label: 'Archived' },
    deactivated: { bg: 'bg-red-50', text: 'text-red-600', label: 'Deactivated' },
  };

  const stateConfig = config[state] || { bg: 'bg-surface-alt', text: 'text-ink-muted', label: state };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border',
        stateConfig.bg,
        stateConfig.text,
        'border-current/20',
        isPrevious && 'opacity-70'
      )}
    >
      {stateConfig.label}
    </span>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function UserHistorySkeleton() {
  return (
    <div className="bg-white rounded-lg border border-line shadow-card divide-y divide-line">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-skeleton animate-pulse" />
            <div className="space-y-1">
              <div className="h-3 bg-skeleton rounded animate-pulse w-32" />
              <div className="h-2 bg-skeleton rounded animate-pulse w-24" />
            </div>
          </div>
          <div className="h-4 bg-skeleton rounded animate-pulse w-48 ml-11" />
        </div>
      ))}
    </div>
  );
}
