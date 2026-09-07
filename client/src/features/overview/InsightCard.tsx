import React from 'react';
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  ExternalLink, 
  Check, 
  Eye, 
  ArrowRight,
  Shield,
  Layers,
  Workflow as WorkflowIcon,
  UserCheck,
  Building2,
  Settings,
  ChevronDown,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/utils/cn';
import type { Insight, InsightSeverity } from '@/types';

interface InsightCardProps {
  insight: Insight;
  onDismiss: () => void;
  onResolve: () => void;
  onAutoFix?: () => void;
  onDrillDown?: (insight: Insight) => void;
  isDismissing?: boolean;
  isResolving?: boolean;
}

const severityConfig: Record<
  InsightSeverity,
  {
    icon: typeof AlertTriangle;
    label: string;
    bg: string;
    border: string;
    iconColor: string;
    badgeBg: string;
    badgeText: string;
    dotColor: string;
  }
> = {
  critical: {
    icon: AlertTriangle,
    label: 'Critical Issue',
    bg: 'bg-red-500/5',
    border: 'border-red-500/20 hover:border-red-500/40',
    iconColor: 'text-red-500',
    badgeBg: 'bg-red-500/10 text-red-400 border border-red-500/20',
    badgeText: 'text-red-400',
    dotColor: 'bg-red-500',
  },
  high: {
    icon: AlertCircle,
    label: 'High Risk',
    bg: 'bg-orange-500/5',
    border: 'border-orange-500/20 hover:border-orange-500/40',
    iconColor: 'text-orange-500',
    badgeBg: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    badgeText: 'text-orange-400',
    dotColor: 'bg-orange-500',
  },
  medium: {
    icon: AlertCircle,
    label: 'Warning',
    bg: 'bg-amber-500/5',
    border: 'border-amber-500/20 hover:border-amber-500/40',
    iconColor: 'text-amber-500',
    badgeBg: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    badgeText: 'text-amber-400',
    dotColor: 'bg-amber-500',
  },
  low: {
    icon: Info,
    label: 'Informational',
    bg: 'bg-sky-500/5',
    border: 'border-sky-500/20 hover:border-sky-500/40',
    iconColor: 'text-sky-500',
    badgeBg: 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
    badgeText: 'text-sky-400',
    dotColor: 'bg-sky-500',
  },
};

const areaTagConfig: Record<string, { color: string; icon: typeof UserCheck }> = {
  Identity: { color: 'bg-purple-500/10 text-purple-400 border-purple-500/20', icon: UserCheck },
  Access: { color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Shield },
  Workflow: { color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: WorkflowIcon },
  Organization: { color: 'bg-teal-500/10 text-teal-400 border-teal-500/20', icon: Building2 },
  Security: { color: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: Shield },
  Configuration: { color: 'bg-slate-500/10 text-slate-300 border-slate-500/20', icon: Settings },
  General: { color: 'bg-slate-500/10 text-slate-300 border-slate-500/20', icon: Layers },
};

/**
 * InsightCard Component
 * Displays a system health insight with Title, Severity level, and Affected Area.
 * Provides drill-down trigger, deep link navigation, and dismiss capability.
 */
export const InsightCard: React.FC<InsightCardProps> = ({
  insight,
  onDismiss,
  onResolve,
  onAutoFix,
  onDrillDown,
  isDismissing = false,
  isResolving = false,
}) => {
  const navigate = useNavigate();

  const severity = (insight.severity as InsightSeverity) || 'info';
  const config = severityConfig[severity] || severityConfig.low;
  const Icon = config.icon;
  const area = insight.affected_area || 'General';
  const areaConfig = areaTagConfig[area] || areaTagConfig.General;
  const AreaIcon = areaConfig.icon;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleViewIssue = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (insight.remediation_url) {
      navigate(insight.remediation_url);
      return;
    }

    if (!insight.affected_object_type || !insight.affected_object_id) return;

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
      case 'role':
        navigate(ROUTES.ROLE_DETAIL(insight.affected_object_id));
        break;
      case 'workflow':
        navigate(ROUTES.WORKFLOWS);
        break;
      case 'location':
        navigate(ROUTES.LOCATIONS);
        break;
      default:
        break;
    }
  };

  const handleCardClick = () => {
    if (onDrillDown) {
      onDrillDown(insight);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        'group relative overflow-hidden p-4 rounded-xl border transition-all duration-200 cursor-pointer',
        'bg-surface hover:bg-surface/80 shadow-sm hover:shadow-md hover:-translate-y-0.5',
        config.border
      )}
    >
      <div className="flex items-start gap-3.5">
        {/* Severity Icon */}
        <div className={cn('h-9 w-9 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5', config.bg, config.border)}>
          <Icon className={cn('h-4 w-4', config.iconColor)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Badges Bar: Severity, Affected Area, Timestamp */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {/* Severity Badge */}
            <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md', config.badgeBg)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', config.dotColor)} />
              {config.label}
            </span>

            {/* Affected Area Badge */}
            <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border', areaConfig.color)}>
              <AreaIcon className="w-3 h-3" />
              Area: {area}
            </span>

            <span className="text-[11px] text-ink-muted ml-auto hidden sm:inline-block">
              {formatDate(insight.detected_at)}
            </span>
          </div>

          {/* Title */}
          <h4 className="text-sm font-semibold text-ink group-hover:text-primary transition-colors flex items-center gap-1.5">
            <span>{insight.title}</span>
            <ArrowRight className="w-3.5 h-3.5 text-ink-muted opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
          </h4>

          {/* Description */}
          <p className="text-xs text-ink-secondary mt-1 line-clamp-2 leading-relaxed">
            {insight.description}
          </p>

          {/* Detailed Reasoning / Logic (Accordion) */}
          {insight.reasoning && (
            <details className="mt-2.5 group/details [&_summary::-webkit-details-marker]:hidden" onClick={(e) => e.stopPropagation()}>
              <summary className="flex items-center gap-1.5 text-xs font-medium text-ink-muted cursor-pointer hover:text-ink transition-colors select-none w-fit">
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-open/details:-rotate-180" />
                View logic & detailed reasoning
              </summary>
              <div className="mt-2 p-2.5 rounded-lg bg-surface-alt border border-line shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  <WorkflowIcon className="w-3 h-3" />
                  Logic / Conditions Triggered
                </div>
                <p className="text-xs text-ink-secondary font-mono leading-relaxed">
                  {insight.reasoning}
                </p>
              </div>
            </details>
          )}

          {/* Affected Entity Label & Diagnostic snippet */}
          {insight.affected_object_label && (
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-ink-muted">
              <span>Affected:</span>
              <span className="font-medium text-ink-secondary bg-surface-alt px-1.5 py-0.5 rounded border border-line">
                {insight.affected_object_label}
              </span>
              {insight.affected_object_type && (
                <span className="text-ink-muted">({insight.affected_object_type})</span>
              )}
            </div>
          )}

          {/* Actions Footer */}
          <div className="flex flex-wrap items-center justify-between mt-3 pt-2.5 border-t border-line/60 gap-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onDrillDown) onDrillDown(insight);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover transition-colors"
              >
                <Eye className="h-3 w-3" />
                Drill Down
              </button>

              {insight.auto_fix_available && onAutoFix && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAutoFix();
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500 hover:text-emerald-600 transition-colors"
                >
                  Auto Fix Issue ✨
                </button>
              )}

              {insight.recommendations && insight.recommendations.length > 0 ? (
                insight.recommendations.map((rec, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(rec.url);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary hover:text-ink transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {rec.action} →
                  </button>
                ))
              ) : insight.remediation_action && (
                <button 
                  type="button"
                  onClick={handleViewIssue}
                  className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary hover:text-ink transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  {insight.remediation_action} →
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
                disabled={isDismissing || isResolving}
                className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-error transition-colors disabled:opacity-50"
              >
                <X className="h-3 w-3" />
                {isDismissing ? 'Dismissing...' : 'Dismiss'}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onResolve();
                }}
                disabled={isDismissing || isResolving}
                className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-emerald-500 transition-colors disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                {isResolving ? 'Resolving...' : 'Resolve'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
