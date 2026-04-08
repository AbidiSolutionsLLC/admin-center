// client/src/features/overview/InsightCard.tsx
import { AlertTriangle, AlertCircle, Info, ExternalLink, Check } from 'lucide-react';
import type { Insight } from '@/types';

interface InsightCardProps {
  insight: Insight;
  onDismiss: () => void;
  isDismissing?: boolean;
}

/**
 * InsightCard Component
 * Displays an intelligence insight with severity config and dismiss action
 */
export const InsightCard: React.FC<InsightCardProps> = ({
  insight,
  onDismiss,
  isDismissing = false,
}) => {
  const getSeverityConfig = () => {
    switch (insight.severity) {
      case 'critical':
        return {
          icon: AlertTriangle,
          bg: 'bg-error/10',
          border: 'border-error/30',
          iconColor: 'text-error',
          badgeBg: 'bg-error',
          badgeText: 'text-white',
        };
      case 'warning':
        return {
          icon: AlertCircle,
          bg: 'bg-warning/10',
          border: 'border-warning/30',
          iconColor: 'text-warning',
          badgeBg: 'bg-warning',
          badgeText: 'text-white',
        };
      case 'info':
        return {
          icon: Info,
          bg: 'bg-info/10',
          border: 'border-info/30',
          iconColor: 'text-info',
          badgeBg: 'bg-info',
          badgeText: 'text-white',
        };
      default:
        return {
          icon: Info,
          bg: 'bg-surface-alt',
          border: 'border-line',
          iconColor: 'text-ink-muted',
          badgeBg: 'bg-ink-muted',
          badgeText: 'text-white',
        };
    }
  };

  const config = getSeverityConfig();
  const Icon = config.icon;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`p-4 rounded-lg border ${config.bg} ${config.border}`}>
      <div className="flex items-start gap-3">
        {/* Severity Icon */}
        <div className={`h-8 w-8 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`h-5 w-5 ${config.iconColor}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${config.badgeBg} ${config.badgeText}`}>
              {insight.severity.toUpperCase()}
            </span>
            <span className="text-xs text-ink-muted">•</span>
            <span className="text-xs text-ink-muted">{formatDate(insight.detected_at)}</span>
          </div>

          <h4 className="text-sm font-semibold text-ink mt-2">{insight.title}</h4>
          <p className="text-xs text-ink-secondary mt-1">{insight.description}</p>

          {insight.reasoning && (
            <p className="text-xs text-ink-muted mt-2 italic">{insight.reasoning}</p>
          )}

          {/* Affected Object */}
          {insight.affected_object_label && (
            <div className="flex items-center gap-1 mt-2">
              <span className="text-xs text-ink-muted">Affected:</span>
              <span className="text-xs font-medium text-ink-secondary">
                {insight.affected_object_label}
              </span>
              {insight.affected_object_type && (
                <span className="text-xs text-ink-muted">
                  ({insight.affected_object_type})
                </span>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            {insight.remediation_action && (
              <button className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors">
                <ExternalLink className="h-3 w-3" />
                View issue →
              </button>
            )}
            <button
              onClick={onDismiss}
              disabled={isDismissing}
              className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary hover:text-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="h-3 w-3" />
              {isDismissing ? 'Dismissing...' : 'Dismiss'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
