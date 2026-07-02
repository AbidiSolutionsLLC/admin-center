import { AlertTriangle, AlertCircle, Info, ExternalLink, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
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
  const navigate = useNavigate();

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

  const handleViewIssue = () => {
    if (insight.remediation_url) {
      navigate(insight.remediation_url);
      return;
    }

    if (!insight.affected_object_type || !insight.affected_object_id) return;

    // Fallback navigation based on object type
    switch (insight.affected_object_type.toLowerCase()) {
      case 'department':
        navigate(`${ROUTES.ORGANIZATION}?id=${insight.affected_object_id}`);
        break;
      case 'team':
        navigate(`${ROUTES.TEAMS}?id=${insight.affected_object_id}`);
        break;
      case 'user':
      case 'employee':
        navigate(ROUTES.USER_DETAIL(insight.affected_object_id));
        break;
      case 'location':
        navigate(ROUTES.LOCATIONS);
        break;
      default:
        // Default to relevant module page if possible
        break;
    }
  };

  return (
    <div className={`relative overflow-hidden p-5 rounded-2xl border ${config.bg} ${config.border} backdrop-blur-glass transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5 hover:border-primary/20`}>
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
              <button 
                onClick={handleViewIssue}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                {insight.remediation_action} →
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
