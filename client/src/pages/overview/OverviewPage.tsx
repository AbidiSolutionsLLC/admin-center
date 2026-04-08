// client/src/pages/overview/OverviewPage.tsx
import { Users, Building2, Package, Shield, AlertTriangle } from 'lucide-react';
import {
  useDashboardStats,
  useSetupProgress,
  useRecentActivity,
  useOverviewInsights,
  useDismissInsight,
} from '@/features/overview/useDashboard';
import { StatCard } from '@/features/overview/StatCard';
import { InsightCard } from '@/features/overview/InsightCard';
import { SetupProgressCard } from '@/features/overview/SetupProgressCard';
import { RecentActivityFeed } from '@/features/overview/RecentActivityFeed';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * OverviewPage Component
 * Main dashboard page showing:
 * - 4 stat cards (users, departments, apps, roles)
 * - Setup progress reflecting actual completion state
 * - Insights sorted by severity (critical first), grouped visually
 * - Recent activity feed showing last 10 events
 */
export default function OverviewPage() {
  // ── Server data ──────────────────────────────────────────────────────
  const { data: stats, isLoading: isLoadingStats, isError: isErrorStats } = useDashboardStats();
  const { data: setupProgress, isLoading: isLoadingSetup } = useSetupProgress();
  const { data: activity, isLoading: isLoadingActivity } = useRecentActivity();
  const { data: insights, isLoading: isLoadingInsights } = useOverviewInsights();

  // Mutations
  const dismissInsightMutation = useDismissInsight();

  // ── Loading State ────────────────────────────────────────────────────
  if (isLoadingStats) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="h-7 w-32 bg-surface-secondary animate-pulse rounded" />
            <div className="h-4 w-48 bg-surface-secondary animate-pulse rounded mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-surface animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-64 bg-surface animate-pulse rounded-lg" />
          <div className="h-64 bg-surface animate-pulse rounded-lg" />
        </div>
      </div>
    );
  }

  // ── Error State ──────────────────────────────────────────────────────
  if (isErrorStats) {
    return (
      <ErrorState
        title="Failed to load dashboard"
        message="Please try again."
        onRetry={() => window.location.reload()}
      />
    );
  }

  // ── Main Content ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            Overview
          </h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            Welcome to the Admin Center Dashboard.
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={stats?.users.total ?? 0}
          subtitle={`${stats?.users.active ?? 0} active, ${stats?.users.invited ?? 0} invited`}
          icon={Users}
        />
        <StatCard
          title="Departments"
          value={stats?.departments.total ?? 0}
          subtitle="Active departments"
          icon={Building2}
        />
        <StatCard
          title="Apps"
          value={stats?.apps.total ?? 0}
          subtitle={`${stats?.apps.active ?? 0} active`}
          icon={Package}
        />
        <StatCard
          title="Roles"
          value={stats?.roles.total ?? 0}
          subtitle={`${stats?.roles.custom ?? 0} custom`}
          icon={Shield}
        />
      </div>

      {/* Main Grid: Insights + Setup Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Insights Column (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Insights & Recommendations</h2>
            {insights && insights.length > 0 && (
              <span className="text-xs text-ink-muted">
                {insights.length} active insight{insights.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {isLoadingInsights ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-surface animate-pulse rounded-lg" />
              ))}
            </div>
          ) : !insights || insights.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No insights"
              description="Your system is running smoothly. No issues detected."
            />
          ) : (
            <div className="space-y-3">
              {/* Group insights by severity */}
              {['critical', 'warning', 'info'].map((severity) => {
                const severityInsights = insights.filter((i) => i.severity === severity);
                if (severityInsights.length === 0) return null;

                return (
                  <div key={severity} className="space-y-2">
                    {severity === 'critical' && severityInsights.length > 0 && (
                      <div className="flex items-center gap-2 px-1">
                        <div className="h-2 w-2 rounded-full bg-ink-red" />
                        <span className="text-xs font-semibold text-ink-red uppercase tracking-wide">
                          Critical ({severityInsights.length})
                        </span>
                      </div>
                    )}
                    {severity === 'warning' && severityInsights.length > 0 && (
                      <div className="flex items-center gap-2 px-1">
                        <div className="h-2 w-2 rounded-full bg-warning" />
                        <span className="text-xs font-semibold text-warning uppercase tracking-wide">
                          Warnings ({severityInsights.length})
                        </span>
                      </div>
                    )}
                    {severity === 'info' && severityInsights.length > 0 && (
                      <div className="flex items-center gap-2 px-1">
                        <div className="h-2 w-2 rounded-full bg-info" />
                        <span className="text-xs font-semibold text-info uppercase tracking-wide">
                          Info ({severityInsights.length})
                        </span>
                      </div>
                    )}

                    {severityInsights.map((insight) => (
                      <InsightCard
                        key={insight._id}
                        insight={insight}
                        onDismiss={() => dismissInsightMutation.mutate(insight._id)}
                        isDismissing={dismissInsightMutation.isPending}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Setup Progress + Recent Activity (1/3 width) */}
        <div className="space-y-6">
          {/* Setup Progress */}
          {setupProgress && (
            <SetupProgressCard
              progress={setupProgress}
              isLoading={isLoadingSetup}
            />
          )}

          {/* Recent Activity */}
          <RecentActivityFeed
            events={activity ?? []}
            isLoading={isLoadingActivity}
          />
        </div>
      </div>
    </div>
  );
}
