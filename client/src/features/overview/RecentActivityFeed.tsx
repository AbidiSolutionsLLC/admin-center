// client/src/features/overview/RecentActivityFeed.tsx
import { Clock, User, Building2, Shield, Package, Settings } from 'lucide-react';
import type { AuditEvent } from '@/types';

interface RecentActivityFeedProps {
  events: AuditEvent[];
  isLoading?: boolean;
}

/**
 * RecentActivityFeed Component
 * Shows last 10 audit events with actor, action, and time
 */
export const RecentActivityFeed: React.FC<RecentActivityFeedProps> = ({
  events,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="bg-surface border border-line rounded-lg shadow-card p-5">
        <h3 className="text-sm font-semibold text-ink-primary mb-3">Recent Activity</h3>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3 p-3 bg-surface-secondary animate-pulse rounded-md">
              <div className="h-8 w-8 bg-surface rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-surface rounded w-3/4" />
                <div className="h-3 bg-surface rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-lg shadow-card p-5">
        <h3 className="text-sm font-semibold text-ink-primary mb-3">Recent Activity</h3>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Clock className="h-12 w-12 text-ink-muted mb-2" />
          <p className="text-sm text-ink-muted">No activity yet</p>
        </div>
      </div>
    );
  }

  const getModuleIcon = (module: string) => {
    switch (module) {
      case 'people':
      case 'users':
        return User;
      case 'organization':
      case 'departments':
        return Building2;
      case 'roles':
      case 'permissions':
        return Shield;
      case 'apps':
        return Package;
      default:
        return Settings;
    }
  };

  const formatAction = (action: string): string => {
    return action
      .split('.')
      .pop()
      ?.replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase()) ?? action;
  };

  const getModuleColor = (module: string) => {
    switch (module) {
      case 'people':
      case 'users':
        return 'bg-primary-50 text-primary-600';
      case 'organization':
      case 'departments':
        return 'bg-info/10 text-info';
      case 'roles':
      case 'permissions':
        return 'bg-warning/10 text-warning';
      case 'apps':
        return 'bg-success/10 text-success';
      default:
        return 'bg-surface-secondary text-ink-secondary';
    }
  };

  return (
    <div className="bg-surface border border-line rounded-lg shadow-card p-5">
      <h3 className="text-sm font-semibold text-ink-primary mb-3">Recent Activity</h3>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {events.map((event) => {
          const Icon = getModuleIcon(event.module);
          const colorClass = getModuleColor(event.module);

          return (
            <div
              key={event._id}
              className="flex items-start gap-3 p-3 rounded-md hover:bg-surface-secondary/50 transition-colors"
            >
              {/* Icon */}
              <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                <Icon className="h-4 w-4" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-ink-secondary capitalize">
                    {event.module}
                  </span>
                  <span className="text-xs text-ink-muted">•</span>
                  <span className="text-xs text-ink-secondary">
                    {formatAction(event.action)}
                  </span>
                </div>

                {event.object_label && (
                  <p className="text-xs text-ink-muted mt-0.5 truncate">
                    {event.object_label}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-ink-muted">{event.actor_email}</span>
                  <span className="text-xs text-ink-muted">•</span>
                  <span className="text-xs text-ink-muted">{event.time_ago}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
