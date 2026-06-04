import { useUserAppHistory } from '@/features/people/hooks/useUserAppHistory';
import { ArrowDownLeft, ArrowUpRight, AlertCircle, Monitor } from 'lucide-react';
import { cn } from '@/utils/cn';

interface UserAppAccessPanelProps {
  userId: string;
}

export function UserAppAccessPanel({ userId }: UserAppAccessPanelProps) {
  const { data: history, isLoading, isError, refetch } = useUserAppHistory(userId);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card p-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="h-8 w-8 bg-surface-alt rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-surface-alt rounded w-3/4" />
              <div className="h-3 bg-surface-alt rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card p-6 text-center">
        <AlertCircle className="w-8 h-8 text-error mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-ink mb-1">Failed to load app history</h3>
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
        <Monitor className="w-8 h-8 text-ink-muted mx-auto mb-2" />
        <p className="text-sm text-ink-muted">No app access history found for this user.</p>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTargetType = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
      <div className="max-h-96 overflow-y-auto divide-y divide-line">
        {history.map((assignment) => (
          <div
            key={assignment._id}
            className={cn(
              "p-4 transition-colors",
              assignment.is_active ? "bg-white hover:bg-surface-alt" : "bg-surface-alt/50"
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
                  assignment.is_active ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                )}
              >
                {assignment.is_active ? (
                  <ArrowDownLeft className="h-4 w-4" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-ink">
                    {assignment.app_info?.name || 'Unknown App'}
                  </span>
                  <span className="text-xs text-ink-muted">•</span>
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                    assignment.is_active ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"
                  )}>
                    {assignment.is_active ? 'Granted' : 'Revoked'}
                  </span>
                </div>

                <div className="text-xs text-ink-secondary mb-1">
                  Source: <span className="font-medium text-ink">{formatTargetType(assignment.target_type)}</span> ({assignment.target_name})
                </div>

                <p className="text-xs text-ink-muted">
                  by {assignment.granted_by_info?.full_name || 'Unknown'} on{' '}
                  {formatDate(assignment.granted_at)}
                </p>

                {!assignment.is_active && assignment.revoked_at && (
                  <p className="text-xs text-ink-muted mt-0.5">
                    Revoked by {assignment.revoked_by_info?.full_name || 'Unknown'} on{' '}
                    {formatDate(assignment.revoked_at)}
                  </p>
                )}

                {assignment.reason && (
                  <p className="text-xs text-ink-secondary mt-1 italic">
                    "{assignment.reason}"
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
