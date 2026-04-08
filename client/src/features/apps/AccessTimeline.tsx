// client/src/features/apps/AccessTimeline.tsx
import { Clock, User, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { AppAssignment } from '@/types';

interface AccessTimelineProps {
  assignments: (AppAssignment & {
    granted_by_info?: { full_name: string; email: string };
    revoked_by_info?: { full_name: string; email: string };
  })[];
  isLoading?: boolean;
}

/**
 * AccessTimeline Component
 * Shows the full grant/revoke history for an app assignment
 */
export const AccessTimeline: React.FC<AccessTimelineProps> = ({
  assignments,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 p-3 bg-surface-secondary animate-pulse rounded-md">
            <div className="h-8 w-8 bg-surface rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-surface rounded w-3/4" />
              <div className="h-3 bg-surface rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!assignments || assignments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Clock className="h-12 w-12 text-ink-muted mb-2" />
        <p className="text-sm text-ink-muted">No assignment history yet</p>
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
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {assignments.map((assignment) => (
        <div
          key={assignment._id}
          className={`p-3 rounded-md border ${
            assignment.is_active
              ? 'bg-surface border-line'
              : 'bg-surface-secondary/50 border-line/50'
          }`}
        >
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center ${
                assignment.is_active
                  ? 'bg-success/10 text-success'
                  : 'bg-ink-red/10 text-ink-red'
              }`}
            >
              {assignment.is_active ? (
                <ArrowDownLeft className="h-4 w-4" />
              ) : (
                <ArrowUpRight className="h-4 w-4" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink-primary">
                  {assignment.is_active ? 'Granted' : 'Revoked'}
                </span>
                <span className="text-xs text-ink-muted">•</span>
                <span className="text-xs text-ink-secondary">
                  {formatTargetType(assignment.target_type)}
                </span>
              </div>

              <p className="text-xs text-ink-muted mt-1">
                by {assignment.granted_by_info?.full_name || 'Unknown'} on{' '}
                {formatDate(assignment.granted_at)}
              </p>

              {!assignment.is_active && assignment.revoked_at && (
                <p className="text-xs text-ink-muted mt-1">
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
  );
};
