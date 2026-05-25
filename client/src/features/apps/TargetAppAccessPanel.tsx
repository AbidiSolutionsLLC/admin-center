import { AlertCircle, Monitor, ArrowDownLeft } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useTargetApps } from '@/features/apps/useApps';

interface TargetAppAccessPanelProps {
  targetType: 'role' | 'department' | 'group' | 'user';
  targetId: string;
}

export function TargetAppAccessPanel({ targetType, targetId }: TargetAppAccessPanelProps) {
  const { data: assignments, isLoading, isError, refetch } = useTargetApps(targetType, targetId);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-line p-6 space-y-3">
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
      <div className="bg-white rounded-lg border border-line p-6 text-center">
        <AlertCircle className="w-8 h-8 text-error mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-ink mb-1">Failed to load apps</h3>
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

  if (!assignments || assignments.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-line p-8 text-center">
        <Monitor className="w-8 h-8 text-ink-muted mx-auto mb-2" />
        <p className="text-sm text-ink-muted">No apps are assigned directly to this {targetType}.</p>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  return (
    <div className="bg-white rounded-lg border border-line overflow-hidden">
      <div className="max-h-96 overflow-y-auto divide-y divide-line">
        {assignments.map((assignment) => (
          <div key={assignment._id} className="p-4 bg-white hover:bg-surface-alt transition-colors">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-50 text-emerald-600">
                <ArrowDownLeft className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-ink">
                    {assignment.app_info?.name || 'Unknown App'}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-600 border-emerald-200">
                    Active
                  </span>
                </div>
                <div className="text-xs text-ink-secondary mb-1">
                  Category: <span className="font-medium text-ink">{assignment.app_info?.category || 'Uncategorized'}</span>
                </div>
                <p className="text-xs text-ink-muted">
                  Assigned by {assignment.granted_by_info?.full_name || 'Unknown'} on {formatDate(assignment.granted_at)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
