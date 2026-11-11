// client/src/pages/overview/OverviewPage.tsx
import { Users, Building2, Package, Shield } from 'lucide-react';
import {
  useDashboardStats,
  useSetupProgress,
  useRecentActivity,
} from '@/features/overview/useDashboard';
import { StatCard } from '@/features/overview/StatCard';
import { HealthInsightsDashboard } from '@/features/overview/HealthInsightsDashboard';
import { SetupProgressCard } from '@/features/overview/SetupProgressCard';
import { RecentActivityFeed } from '@/features/overview/RecentActivityFeed';
import { ErrorState } from '@/components/ui/ErrorState';

/**
 * OverviewPage Component
 * Main dashboard page showing:
 * - 4 stat cards (users, departments, apps, roles)
 * - Centralized System Health Insights (Issues, Warnings, Informational) with drill-down
 * - Setup progress reflecting actual completion state
 * - Recent activity feed showing last 10 events
 */
export default function OverviewPage() {
  // ── Server data ──────────────────────────────────────────────────────
  const { data: stats, isLoading: isLoadingStats, isError: isErrorStats, refetch: refetchStats } = useDashboardStats();
  const { data: setupProgress, isLoading: isLoadingSetup } = useSetupProgress();
  const { data: activity, isLoading: isLoadingActivity } = useRecentActivity();

  // ── Loading State ────────────────────────────────────────────────────
  if (isLoadingStats) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="h-7 w-32 bg-surface-alt animate-pulse rounded" />
            <div className="h-4 w-48 bg-surface-alt animate-pulse rounded mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-surface animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-surface animate-pulse rounded-lg" />
          <div className="h-96 bg-surface animate-pulse rounded-lg" />
        </div>
      </div>
    );
  }

  // ── Error State ──────────────────────────────────────────────────────
  if (isErrorStats) {
    return (
      <ErrorState
        title="Failed to load dashboard"
        description="Unable to fetch dashboard statistics. Please try again."
        onRetry={refetchStats}
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
            Welcome to Karbexa Admin.
          </p>
        </div>
      </div>

      {/* High-Level Stat Cards */}
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

      {/* Main Grid: Health Insights Dashboard + Setup Progress & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Centralized System Health Insights (2/3 width) */}
        <div className="lg:col-span-2">
          <HealthInsightsDashboard />
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

          {/* Recent Activity Feed */}
          <RecentActivityFeed
            events={activity ?? []}
            isLoading={isLoadingActivity}
          />
        </div>
      </div>
    </div>
  );
}

