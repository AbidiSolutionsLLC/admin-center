// client/src/features/overview/HealthInsightsDashboard.tsx
import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  Search, 
  RotateCw, 
  ShieldCheck, 
  SlidersHorizontal,
  CheckCircle2
} from 'lucide-react';
import { InsightCard } from './InsightCard';
import { InsightDetailModal } from './InsightDetailModal';
import { useOverviewInsights, useDismissInsight, useResolveInsight, useRunIntelligence, useAutoFixInsight } from './useDashboard';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/utils/cn';
import type { Insight } from '@/types';

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';

const CATEGORIES = [
  'All Types',
  'Misconfigurations',
  'Health Issues',
  'Data Consistency',
  'Recommendations',
] as const;

const AREAS = [
  'All Areas',
  'Identity',
  'Access',
  'Workflow',
  'Organization',
  'Security',
  'Configuration',
] as const;

import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';

export const HealthInsightsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All Types');
  const [areaFilter, setAreaFilter] = useState<string>('All Areas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);

  // TanStack Query hooks
  const { 
    data: rawInsights, 
    isLoading, 
    isError, 
    refetch, 
    isFetching 
  } = useOverviewInsights();

  const dismissMutation = useDismissInsight();
  const resolveMutation = useResolveInsight();
  const runIntelligenceMutation = useRunIntelligence();
  const autoFixMutation = useAutoFixInsight();
  const [autoFixInsight, setAutoFixInsight] = useState<Insight | null>(null);

  // Normalize and filter insights
  const insights = useMemo(() => rawInsights ?? [], [rawInsights]);

  // Aggregate counts
  const counts = useMemo(() => {
    return {
      total: insights.length,
      critical: insights.filter((i) => i.severity === 'critical').length,
      high: insights.filter((i) => i.severity === 'high').length,
      medium: insights.filter((i) => i.severity === 'medium').length,
      low: insights.filter((i) => i.severity === 'low').length,
    };
  }, [insights]);

  // Filtered list
  const filteredInsights = useMemo(() => {
    return insights.filter((insight) => {
      // Severity filter
      if (severityFilter !== 'all' && insight.severity !== severityFilter) {
        return false;
      }

      // Category filter
      if (categoryFilter !== 'All Types') {
        if (categoryFilter === 'Misconfigurations' && insight.category !== 'misconfiguration') return false;
        if (categoryFilter === 'Health Issues' && insight.category !== 'health') return false;
        if (categoryFilter === 'Data Consistency' && insight.category !== 'data_consistency') return false;
        if (categoryFilter === 'Recommendations' && insight.category !== 'recommendation') return false;
      }

      // Area filter
      if (areaFilter !== 'All Areas') {
        const area = insight.affected_area || 'General';
        if (area.toLowerCase() !== areaFilter.toLowerCase()) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = insight.title?.toLowerCase().includes(q);
        const descMatch = insight.description?.toLowerCase().includes(q);
        const labelMatch = insight.affected_object_label?.toLowerCase().includes(q);
        const areaMatch = insight.affected_area?.toLowerCase().includes(q);
        const reasoningMatch = insight.reasoning?.toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !labelMatch && !areaMatch && !reasoningMatch) {
          return false;
        }
      }

      return true;
    });
  }, [insights, severityFilter, categoryFilter, areaFilter, searchQuery]);

  const handleDismiss = (insightId: string) => {
    dismissMutation.mutate(insightId, {
      onSuccess: () => {
        if (selectedInsight?._id === insightId) {
          setSelectedInsight(null);
        }
      },
    });
  };

  const handleResolve = (insightId: string) => {
    resolveMutation.mutate(insightId, {
      onSuccess: () => {
        if (selectedInsight?._id === insightId) {
          setSelectedInsight(null);
        }
      },
    });
  };

  const handleRunDiagnostics = () => {
    runIntelligenceMutation.mutate();
  };

  if (isError) {
    return (
      <ErrorState
        title="Failed to load system health insights"
        description="Could not evaluate system intelligence rules. Please try again."
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ── System Health Header & Summary Metric Cards ────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-ink">System Health & Insights</h2>
              {counts.critical > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  {counts.critical} Critical Issue{counts.critical !== 1 ? 's' : ''}
                </span>
              ) : (counts.high > 0 || counts.medium > 0) ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {counts.high + counts.medium} Warning{counts.high + counts.medium !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  All Systems Optimal
                </span>
              )}
            </div>
            <p className="text-xs text-ink-secondary mt-0.5">
              Proactive diagnostic monitoring across Identity, Access, Workflows, and Security.
            </p>
          </div>

          {/* Run Diagnostics Action */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => navigate(ROUTES.INSIGHT_HISTORY)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:text-ink bg-surface hover:bg-surface-alt border border-line rounded-lg shadow-sm transition-all"
            >
              View History & Trends
            </button>
            <button
              type="button"
              onClick={handleRunDiagnostics}
              disabled={runIntelligenceMutation.isPending || isFetching}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:text-ink bg-surface hover:bg-surface-alt border border-line rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              <RotateCw className={cn('w-3.5 h-3.5', (runIntelligenceMutation.isPending || isFetching) && 'animate-spin text-primary')} />
              {runIntelligenceMutation.isPending ? 'Running Health Scan...' : 'Scan System Health'}
            </button>
          </div>
        </div>

        {/* 4 Centralized Severity Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {[
            {
              key: 'critical' as const,
              label: 'Issues (Critical)',
              count: counts.critical,
              subtitle: counts.critical === 1 ? 'requires immediate fix' : 'require immediate fix',
              icon: AlertTriangle,
              colorClass: 'red',
            },
            {
              key: 'high' as const,
              label: 'High Risk',
              count: counts.high,
              subtitle: 'potential operational risk',
              icon: AlertCircle,
              colorClass: 'orange',
            },
            {
              key: 'medium' as const,
              label: 'Warnings (Medium)',
              count: counts.medium,
              subtitle: 'potential operational risk',
              icon: AlertCircle,
              colorClass: 'amber',
            },
            {
              key: 'low' as const,
              label: 'Low / Info',
              count: counts.low,
              subtitle: 'optimization recommendations',
              icon: Info,
              colorClass: 'sky',
            },
          ].map((card) => (
            <div
              key={card.key}
              onClick={() => setSeverityFilter(severityFilter === card.key ? 'all' : card.key)}
              className={cn(
                'group p-4 rounded-xl border transition-all cursor-pointer select-none',
                'backdrop-blur-sm relative overflow-hidden',
                severityFilter === card.key
                  ? `bg-${card.colorClass}-500/10 border-${card.colorClass}-500/50 shadow-md ring-1 ring-${card.colorClass}-500/30`
                  : `bg-surface hover:bg-surface-alt border-line hover:border-${card.colorClass}-500/30`
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-[11px] font-bold uppercase tracking-wider text-${card.colorClass}-400`}>
                    {card.label}
                  </p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-extrabold text-ink tracking-tight">
                      {card.count}
                    </span>
                    <span className="text-[11px] text-ink-muted">
                      {card.subtitle}
                    </span>
                  </div>
                </div>
                <div className={`h-10 w-10 rounded-lg bg-${card.colorClass}-500/10 border border-${card.colorClass}-500/20 flex items-center justify-center text-${card.colorClass}-500 group-hover:scale-105 transition-transform`}>
                  <card.icon className="w-5 h-5" />
                </div>
              </div>
              {severityFilter === card.key && (
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-${card.colorClass}-500`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Search & Filter Controls ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-surface border border-line">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search insights by title, entity, or area..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface-alt border border-line rounded-lg text-ink placeholder-ink-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category dropdown filter */}
          <div className="flex items-center gap-1.5 bg-surface-alt px-2.5 py-1 rounded-lg border border-line">
            <SlidersHorizontal className="w-3.5 h-3.5 text-ink-muted" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs bg-transparent text-ink font-medium focus:outline-none cursor-pointer"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat} className="bg-[#0b101e] text-slate-200">
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Area dropdown filter */}
          <div className="flex items-center gap-1.5 bg-surface-alt px-2.5 py-1 rounded-lg border border-line">
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="text-xs bg-transparent text-ink font-medium focus:outline-none cursor-pointer"
            >
              {AREAS.map((area) => (
                <option key={area} value={area} className="bg-[#0b101e] text-slate-200">
                  {area}
                </option>
              ))}
            </select>
          </div>

          {/* Severity tabs */}
          <div className="flex items-center p-0.5 bg-surface-alt rounded-lg border border-line">
            {(
              [
                { key: 'all', label: `All (${counts.total})` },
                { key: 'critical', label: `Critical (${counts.critical})` },
                { key: 'high', label: `High (${counts.high})` },
                { key: 'medium', label: `Medium (${counts.medium})` },
                { key: 'low', label: `Low (${counts.low})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSeverityFilter(tab.key)}
                className={cn(
                  'px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all',
                  severityFilter === tab.key
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-ink-secondary hover:text-ink'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Insights List (Grouped and Easily Scannable) ─────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-surface-alt animate-pulse rounded-xl" />
          ))}
        </div>
      ) : filteredInsights.length === 0 ? (
        <EmptyState
          icon={insights.length === 0 ? ShieldCheck : Search}
          title={insights.length === 0 ? 'All Systems Healthy' : 'No matching health insights'}
          description={
            insights.length === 0
              ? 'Zero critical issues, warnings, or misconfigurations detected across your organization.'
              : 'Try clearing your search query or selecting a different severity/area filter.'
          }
        />
      ) : (
        <div className="space-y-3">
          {/* If filtering 'all', render grouped sections for crystal-clear scannability */}
          {severityFilter === 'all' && (
            <>
              {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
                const groupItems = filteredInsights.filter((i) => i.severity === sev);
                if (groupItems.length === 0) return null;

                const sevTitle = 
                  sev === 'critical' ? 'Issues (Critical)' :
                  sev === 'high' ? 'High Risk' :
                  sev === 'medium' ? 'Warnings (Medium Risk)' : 'Informational Insights';

                const sevColor = 
                  sev === 'critical' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                  sev === 'high' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' :
                  sev === 'medium' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                  'text-sky-400 bg-sky-500/10 border-sky-500/20';

                return (
                  <div key={sev} className="space-y-2">
                    <div className="flex items-center gap-2 px-1 pt-2 pb-1">
                      <span className={cn('text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border', sevColor)}>
                        {sevTitle} ({groupItems.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {groupItems.map((insight) => (
                        <InsightCard
                          key={insight._id}
                          insight={insight}
                          onDrillDown={(ins) => setSelectedInsight(ins)}
                          onDismiss={() => handleDismiss(insight._id)}
                          onResolve={() => handleResolve(insight._id)}
                          onAutoFix={() => setAutoFixInsight(insight)}
                          isDismissing={dismissMutation.isPending && dismissMutation.variables === insight._id}
                          isResolving={resolveMutation.isPending && resolveMutation.variables === insight._id}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* When a specific severity filter is selected */}
          {severityFilter !== 'all' && (
            <div className="space-y-2">
              {filteredInsights.map((insight) => (
                <InsightCard
                  key={insight._id}
                  insight={insight}
                  onDrillDown={(ins) => setSelectedInsight(ins)}
                  onDismiss={() => handleDismiss(insight._id)}
                  onResolve={() => handleResolve(insight._id)}
                  onAutoFix={() => setAutoFixInsight(insight)}
                  isDismissing={dismissMutation.isPending && dismissMutation.variables === insight._id}
                  isResolving={resolveMutation.isPending && resolveMutation.variables === insight._id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Drill Down Detail Modal ────────────────────────────────────── */}
      <InsightDetailModal
        insight={selectedInsight}
        isOpen={!!selectedInsight}
        onClose={() => setSelectedInsight(null)}
        onDismiss={handleDismiss}
        onResolve={handleResolve}
        onAutoFix={() => setAutoFixInsight(selectedInsight)}
        isDismissing={dismissMutation.isPending}
        isResolving={resolveMutation.isPending}
      />

      {/* ── Auto Fix Confirmation Modal ────────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!autoFixInsight}
        onClose={() => setAutoFixInsight(null)}
        onConfirm={() => {
          if (autoFixInsight) {
            autoFixMutation.mutate(autoFixInsight._id, {
              onSuccess: () => {
                setAutoFixInsight(null);
                setSelectedInsight(null); // Close the detail modal too if it's open
              }
            });
          }
        }}
        title="Apply Automated Fix"
        description="Are you sure you want to apply this automated fix? This will immediately modify the affected record."
        confirmLabel="Apply Fix"
        variant="warning"
        isLoading={autoFixMutation.isPending}
      />
    </div>
  );
};
