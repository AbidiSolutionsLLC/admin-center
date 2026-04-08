// src/features/organization/components/OrgHealthTab.tsx
import React from 'react';
import { AlertTriangle, AlertCircle, Info, X, ExternalLink } from 'lucide-react';
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
  critical: { icon: AlertTriangle, bg: 'bg-errorLight', border: 'border-errorBorder', text: 'text-error', badge: 'bg-error text-white', label: 'Critical' },
  warning: { icon: AlertCircle, bg: 'bg-warningLight', border: 'border-warningBorder', text: 'text-warning', badge: 'bg-warning text-white', label: 'Warning' },
  info: { icon: Info, bg: 'bg-infoLight', border: 'border-infoBorder', text: 'text-info', badge: 'bg-info text-white', label: 'Info' },
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
          'flex items-start gap-3 p-4 rounded-lg border',
          config.bg,
          config.border
        )}
      >
        <config.icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', config.text)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-ink">{insight.title}</h4>
            <span className={cn('text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5', config.badge)}>
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
            <div key={severity} className={cn('p-4 rounded-lg border', config.bg, config.border)}>
              <div className="flex items-center gap-2">
                <config.icon className={cn('w-5 h-5', config.text)} />
                <span className="text-sm font-medium text-ink-secondary">{config.label}</span>
              </div>
              <p className="text-2xl font-bold text-ink mt-2">{count}</p>
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
