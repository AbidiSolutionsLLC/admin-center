import { useState, useMemo } from 'react';
import { ArrowLeft, Search, AlertCircle, RotateCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useInsightHistory } from '@/features/overview/useInsightHistory';
import { DataTable } from '@/components/ui/DataTable';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/utils/cn';
import { format } from 'date-fns';
import type { CellContext } from '@tanstack/react-table';
import type { InsightHistoryResponse } from '@/features/overview/useInsightHistory';

type HistoryInsight = InsightHistoryResponse['data'][0];
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export default function InsightHistoryPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    severity: 'all',
    category: 'all',
    status: 'all', // all, resolved, dismissed
  });

  const { data, isLoading, error, refetch } = useInsightHistory({
    ...filters,
    page,
    limit: 50,
  });

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const columns = useMemo(
    () => [
      {
        id: 'title',
        header: 'Insight',
        accessorKey: 'title',
        cell: (info: CellContext<HistoryInsight, unknown>) => {
          const insight = info.row.original;
          return (
            <div>
              <p className="text-sm font-semibold text-ink">{insight.title}</p>
              <p className="text-xs text-ink-secondary truncate max-w-md">{insight.description}</p>
              {insight.is_recurring && (
                <span className="inline-flex mt-1 items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-600 border border-orange-500/20">
                  <RotateCw className="w-3 h-3" />
                  Recurring Issue ({insight.recurrence_count}x)
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'severity',
        header: 'Severity',
        accessorKey: 'severity',
        cell: (info: CellContext<HistoryInsight, unknown>) => {
          const val = info.getValue() as string;
          const colors: Record<string, string> = {
            critical: 'bg-red-50 text-red-700 border-red-200',
            high: 'bg-orange-50 text-orange-700 border-orange-200',
            medium: 'bg-amber-50 text-amber-700 border-amber-200',
            low: 'bg-sky-50 text-sky-700 border-sky-200',
          };
          return (
            <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border', colors[val] || 'bg-surface-alt border-line')}>
              {val}
            </span>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'is_resolved',
        cell: (info: CellContext<HistoryInsight, unknown>) => {
          const isResolved = info.getValue() as boolean;
          const isDismissed = info.row.original.is_dismissed;
          
          if (isResolved) {
            return (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border bg-emerald-50 text-emerald-700 border-emerald-200">
                Resolved
              </span>
            );
          }
          if (isDismissed) {
            return (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border bg-surface-alt text-ink-secondary border-line">
                Dismissed
              </span>
            );
          }
          return null;
        },
      },
      {
        id: 'date',
        header: 'Date',
        accessorFn: (row: HistoryInsight) => row.resolved_at || row.dismissed_at,
        cell: (info: CellContext<HistoryInsight, unknown>) => {
          const date = info.getValue() as string | undefined;
          if (!date) return '-';
          return (
            <span className="text-sm text-ink-secondary">
              {format(new Date(date), 'MMM d, yyyy HH:mm')}
            </span>
          );
        },
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate(ROUTES.OVERVIEW)}
          className="mt-1 flex items-center justify-center w-8 h-8 rounded-md bg-surface border border-line text-ink-secondary hover:text-ink hover:bg-surface-alt transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            Insight History & Trends
          </h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            Track past system health improvements and identify recurring issues.
          </p>
        </div>
      </div>

      {error ? (
        <ErrorState
          title="Failed to load history"
          description="Could not load insight history."
          onRetry={refetch}
        />
      ) : (
        <>
          {/* Trends Chart */}
          <div className="bg-surface p-5 rounded-lg border border-line shadow-card h-80">
            <h2 className="text-sm font-semibold text-ink mb-4">Resolution Trends (Monthly)</h2>
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center bg-surface-alt animate-pulse rounded-md" />
            ) : data?.trends && data.trends.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.trends} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E6ED" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#5A6478' }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#5A6478' }}
                  />
                  <Tooltip 
                    cursor={{ fill: '#F1F3F7' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E2E6ED', boxShadow: '0 4px 12px 0 rgba(15, 22, 41, 0.10)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                  <Bar dataKey="resolved" name="Resolved" fill="#059669" radius={[4, 4, 0, 0]} barSize={40} />
                  <Bar dataKey="dismissed" name="Dismissed" fill="#9BA5B7" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-ink-muted">
                No trend data available yet.
              </div>
            )}
          </div>

          {/* Filters & Table */}
          <div className="bg-surface rounded-lg border border-line shadow-card overflow-hidden">
            {/* Toolbar */}
            <div className="p-4 border-b border-line flex flex-wrap items-center gap-3 bg-surface-alt">
              <div className="relative flex-1 min-w-[250px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  placeholder="Search historical insights..."
                  className="w-full h-9 pl-9 pr-4 text-sm rounded-md border border-line bg-surface text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
                />
              </div>

              <select
                value={filters.severity}
                onChange={(e) => handleFilterChange('severity', e.target.value)}
                className="h-9 px-3 text-sm rounded-md border border-line bg-surface text-ink focus:outline-none focus:border-primary"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="h-9 px-3 text-sm rounded-md border border-line bg-surface text-ink focus:outline-none focus:border-primary"
              >
                <option value="all">All Statuses</option>
                <option value="resolved">Resolved Only</option>
                <option value="dismissed">Dismissed Only</option>
              </select>
            </div>

            <DataTable
              columns={columns}
              data={data?.data || []}
              isLoading={isLoading}
              emptyState={
                <EmptyState 
                  icon={AlertCircle} 
                  title="No historical insights" 
                  description="No insights match your current filters." 
                />
              }
              pagination={
                data ? {
                  page: data.pagination.page,
                  pageSize: data.pagination.limit,
                  total: data.pagination.total,
                  onPageChange: setPage,
                } : undefined
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
