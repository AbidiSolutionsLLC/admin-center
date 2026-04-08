// client/src/features/overview/StatCard.tsx
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
}

/**
 * StatCard Component
 * Displays a single stat metric for the dashboard
 */
export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}) => {
  return (
    <div className="bg-surface border border-line rounded-lg shadow-card p-5 hover:shadow-card-hover transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-ink-secondary">{title}</p>
          <p className="text-3xl font-bold text-ink-primary mt-2">{value}</p>
          {subtitle && (
            <p className="text-xs text-ink-muted mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <span
                className={`text-xs font-medium ${
                  trend.positive ? 'text-success' : 'text-ink-red'
                }`}
              >
                {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
              <span className="text-xs text-ink-muted">{trend.label}</span>
            </div>
          )}
        </div>
        <div className="h-12 w-12 rounded-lg bg-primary-50 flex items-center justify-center">
          <Icon className="h-6 w-6 text-primary-600" />
        </div>
      </div>
    </div>
  );
};
