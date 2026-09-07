// client/src/features/overview/InsightDetailModal.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  Check, 
  X,
  ExternalLink, 
  Clock, 
  Layers, 
  ShieldAlert, 
  FileText 
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/utils/cn';
import type { Insight, InsightSeverity } from '@/types';

interface InsightDetailModalProps {
  insight: Insight | null;
  isOpen: boolean;
  onClose: () => void;
  onDismiss: (insightId: string) => void;
  onResolve: (insightId: string) => void;
  onAutoFix?: (insightId: string) => void;
  isDismissing?: boolean;
  isResolving?: boolean;
}

const severityConfig: Record<
  InsightSeverity,
  {
    icon: typeof AlertTriangle;
    label: string;
    badgeBg: string;
    badgeText: string;
    border: string;
    bg: string;
    iconColor: string;
  }
> = {
  critical: {
    icon: AlertTriangle,
    label: 'Critical Issue',
    badgeBg: 'bg-red-500/10 text-red-500 border-red-500/30',
    badgeText: 'text-red-500',
    border: 'border-red-500/30',
    bg: 'bg-red-500/5',
    iconColor: 'text-red-500',
  },
  high: {
    icon: AlertCircle,
    label: 'High Risk',
    badgeBg: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
    badgeText: 'text-orange-500',
    border: 'border-orange-500/30',
    bg: 'bg-orange-500/5',
    iconColor: 'text-orange-500',
  },
  medium: {
    icon: AlertCircle,
    label: 'Medium Risk Warning',
    badgeBg: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    badgeText: 'text-amber-500',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    iconColor: 'text-amber-500',
  },
  low: {
    icon: Info,
    label: 'Informational Insight',
    badgeBg: 'bg-sky-500/10 text-sky-500 border-sky-500/30',
    badgeText: 'text-sky-500',
    border: 'border-sky-500/30',
    bg: 'bg-sky-500/5',
    iconColor: 'text-sky-500',
  },
};

const areaTagColors: Record<string, string> = {
  Identity: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Access: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Workflow: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Organization: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  Security: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  Configuration: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  General: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
};

export const InsightDetailModal: React.FC<InsightDetailModalProps> = ({
  insight,
  isOpen,
  onClose,
  onDismiss,
  onResolve,
  onAutoFix,
  isDismissing = false,
  isResolving = false,
}) => {
  const navigate = useNavigate();

  if (!insight) return null;

  const severity = (insight.severity as InsightSeverity) || 'info';
  const config = severityConfig[severity] || severityConfig.low;
  const Icon = config.icon;
  const area = insight.affected_area || 'General';
  const areaBadgeClass = areaTagColors[area] || areaTagColors.General;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleNavigateToRecord = () => {
    onClose();
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
      case 'company':
        navigate(ROUTES.COMPANY_SETTINGS);
        break;
      default:
        navigate(ROUTES.OVERVIEW);
        break;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="System Health Insight Details"
      description="In-depth diagnostic breakdown and remediation guidance"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDismiss(insight._id)}
              disabled={isDismissing || isResolving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              {isDismissing ? 'Dismissing...' : 'Dismiss'}
            </button>
            <button
              type="button"
              onClick={() => onResolve(insight._id)}
              disabled={isDismissing || isResolving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {isResolving ? 'Resolving...' : 'Resolve'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              Close
            </button>
            {insight.auto_fix_available && onAutoFix ? (
              <button
                type="button"
                onClick={() => onAutoFix(insight._id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg shadow-sm transition-colors"
              >
                Auto Fix Issue ✨
              </button>
            ) : (insight.remediation_url || insight.remediation_action) && (
              <button
                type="button"
                onClick={handleNavigateToRecord}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {insight.remediation_action || 'Fix Issue Now'} →
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Banner with Severity & Area Tag */}
        <div className={cn('p-4 rounded-xl border flex items-start gap-3.5', config.bg, config.border)}>
          <div className={cn('p-2 rounded-lg border flex-shrink-0', config.bg, config.border)}>
            <Icon className={cn('w-5 h-5', config.iconColor)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className={cn('text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border', config.badgeBg)}>
                {config.label}
              </span>
              <span className={cn('text-[11px] font-semibold px-2.5 py-0.5 rounded-md border', areaBadgeClass)}>
                Area: {area}
              </span>
              {insight.category && (
                <span className="text-[11px] text-slate-400 font-medium capitalize bg-white/5 border border-white/10 px-2 py-0.5 rounded-md">
                  {insight.category.replace(/_/g, ' ')}
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-slate-100">{insight.title}</h3>
            <p className="mt-1 text-sm text-slate-300 leading-relaxed">{insight.description}</p>
          </div>
        </div>

        {/* Diagnosis & Root Cause Section */}
        {insight.reasoning && (
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <ShieldAlert className="w-4 h-4 text-primary" />
              Logic / Conditions Triggered
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-mono bg-black/30 p-3 rounded-lg border border-white/5">
              {insight.reasoning}
            </p>
          </div>
        )}

        {/* Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/10">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              Affected Object
            </span>
            <p className="mt-1 text-sm font-semibold text-slate-200">
              {insight.affected_object_label || 'All Company Records'}
            </p>
            {insight.affected_object_type && (
              <span className="mt-0.5 inline-block text-xs font-medium text-slate-400">
                Type: <span className="text-slate-300 capitalize">{insight.affected_object_type}</span>
              </span>
            )}
            {insight.affected_object_id && (
              <p className="mt-0.5 text-[11px] font-mono text-slate-500 truncate">
                ID: {insight.affected_object_id}
              </p>
            )}
          </div>

          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Detection & Status
            </span>
            <p className="mt-1 text-sm font-semibold text-slate-200">
              Detected: {formatDate(insight.detected_at)}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs text-slate-300">Active (Requires attention)</span>
            </div>
          </div>
        </div>

        {/* Remediation & Action Plan */}
        <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <FileText className="w-4 h-4" />
            Recommended Remediation Plan
          </div>
          {insight.recommendations && insight.recommendations.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-300">
                Action required: Please follow the recommended actions below to resolve this issue.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {insight.recommendations.map((rec, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate(rec.url);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {rec.action} →
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-300">
              {insight.remediation_action 
                ? `Action required: ${insight.remediation_action}. Clicking "Fix Issue Now" will take you directly to the target management interface.`
                : 'Review the affected entity in its corresponding section and apply the necessary administrative fixes.'
              }
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};
