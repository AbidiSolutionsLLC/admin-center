// src/features/organization/components/OrgHealthTab.tsx
import React from 'react';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { useOrgHealth, useDismissInsight } from '../hooks/useOrgHealth';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/utils/cn';
import type { Insight } from '@/types';

interface OrgHealthTabProps {
  onNavigateToRecord: (insight: Insight) => void;
}

const severityConfig = {
  critical: { icon: AlertTriangle, bg: 'bg-error/10', border: 'border-error/30', text: 'text-error', badge: 'bg-error/20 text-error border border-error/30', label: 'Critical' },
  warning: { icon: AlertCircle, bg: 'bg-warning/10', border: 'border-warning/30', text: 'text-warning', badge: 'bg-warning/20 text-warning border border-warning/30', label: 'Warning' },
  info: { icon: Info, bg: 'bg-info/10', border: 'border-info/30', text: 'text-info', badge: 'bg-info/20 text-info border border-info/30', label: 'Info' },
};

/**
 * OrgHealthTab Component
 * Shows organizational health insights grouped by severity.
 * Features:
 * - 3 severity groups with correct counts
 * - "Fix Now →" deep link navigates to correct record
 * - Dismiss marks insight as resolved and removes from view
 * - Empty state when no issues exist
 */
export const OrgHealthTab: React.FC<OrgHealthTabProps> = ({ onNavigateToRecord }) => {
  const { data, isLoading, isError, refetch } = useOrgHealth();
  const dismissMutation = useDismissInsight();

  if (isLoading) return <TableSkeleton rows={6} columns={5} />;

  if (isError) {
    return (
      <ErrorState
        title="Failed to load health insights"
        description="Something went wrong. Please try again."
        onRetry={refetch}
      />
    );
  }

  if (!data || data.counts.total === 0) {
    return (
      <EmptyState
        icon={Info}
        title="All clear!"
        description="No organizational health issues detected. Great job!"
      />
    );
  }

  const handleDismiss = (insight: Insight) => {
    dismissMutation.mutate(insight._id);
  };

  const renderInsight = (insight: Insight) => {
    const config = severityConfig[insight.severity as keyof typeof severityConfig];

    return (
      <div
        key={insight._id}
        className={cn(
          'group relative overflow-hidden flex items-start gap-4 p-5 rounded-2xl border backdrop-blur-glass transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5',
          config.bg,
          config.border
        )}
      >
        <div className={cn('h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0', config.bg, config.border)}>
          <config.icon className={cn('w-5 h-5 transition-transform duration-300 group-hover:scale-110', config.text)} strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-ink group-hover:text-primary transition-colors">{insight.title}</h4>
            <span className={cn('text-[10px] font-bold uppercase tracking-widest rounded-full px-2.5 py-0.5', config.badge)}>
              {config.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-secondary">{insight.description}</p>
          <p className="mt-1 text-xs text-ink-muted italic">{insight.reasoning}</p>
          <div className="mt-2 flex items-center gap-3">
            {insight.remediation_url && (
              <button
                onClick={() => onNavigateToRecord(insight)}
                className="text-xs font-semibold text-accent hover:text-accent-hover flex items-center gap-1"
              >
                Fix Now →
              </button>
            )}
            <button
              onClick={() => handleDismiss(insight)}
              className="text-xs text-ink-muted hover:text-ink flex items-center gap-1"
              disabled={dismissMutation.isPending}
            >
              <X className="w-3 h-3" />
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {(['critical', 'warning', 'info'] as const).map((severity) => {
          const config = severityConfig[severity];
          const count = data.counts[severity];
          return (
            <div key={severity} className={cn(
              'group relative overflow-hidden backdrop-blur-glass p-6 rounded-2xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover cursor-pointer',
              config.bg, config.border
            )}>
              {/* Subtle top border gradient glow on hover */}
              <div className={cn("absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent to-transparent transition-all duration-500", 
                 severity === 'critical' ? 'group-hover:via-error/50' : severity === 'warning' ? 'group-hover:via-warning/50' : 'group-hover:via-info/50'
              )} />
              
              <div className="relative z-10 flex items-start justify-between">
                 <div>
                   <p className="text-xs font-bold text-ink-secondary tracking-widest uppercase mb-2">{config.label}</p>
                   <p className="text-4xl font-extrabold text-ink tracking-tight drop-shadow-sm">{count}</p>
                 </div>
                 <div className={cn("h-14 w-14 rounded-xl border flex items-center justify-center transition-transform duration-300 group-hover:scale-110", config.bg, config.border)}>
                   <config.icon className={cn('h-7 w-7 transition-transform duration-300 group-hover:rotate-[-5deg]', config.text)} strokeWidth={1.5} />
                 </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Insights grouped by severity */}
      {(['critical', 'warning', 'info'] as const).map((severity) => {
        const insights = data.insights[severity];
        if (insights.length === 0) return null;
        const config = severityConfig[severity];

        return (
          <div key={severity} className="space-y-3">
            <h3 className={cn('text-sm font-semibold flex items-center gap-2', config.text)}>
              <config.icon className="w-4 h-4" />
              {config.label} ({insights.length})
            </h3>
            <div className="space-y-2">
              {insights.map(renderInsight)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
