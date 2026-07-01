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
 * Displays a single stat metric for the dashboard with Liquid Glass styling
 */
export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}) => {
  return (
    <div className="group relative overflow-hidden bg-surface backdrop-blur-glass border border-line rounded-2xl p-6 transition-all duration-300 ease-out hover:bg-surface-alt hover:border-primary/30 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(245,176,42,0.12)] cursor-pointer">
      {/* Subtle top border gradient glow on hover */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/0 to-transparent group-hover:via-primary/50 transition-all duration-500" />
      
      {/* Ambient background glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 rounded-full blur-[64px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

      <div className="relative z-10 flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-bold text-ink-secondary tracking-widest uppercase mb-2">{title}</p>
          <p className="text-4xl font-extrabold text-ink tracking-tight drop-shadow-sm">{value}</p>
          {subtitle && (
            <p className="text-sm text-ink-muted mt-2 font-medium">{subtitle}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1.5 mt-3 bg-white/5 w-fit px-2 py-1 rounded-md border border-white/5">
              <span
                className={`text-xs font-bold flex items-center ${
                  trend.positive ? 'text-success' : 'text-error'
                }`}
              >
                {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
              <span className="text-xs text-ink-muted font-medium">{trend.label}</span>
            </div>
          )}
        </div>
        <div className="h-14 w-14 rounded-xl bg-[rgba(245,176,42,0.1)] border border-[rgba(245,176,42,0.2)] flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(245,176,42,0.2)]">
          <Icon className="h-7 w-7 text-primary transition-transform duration-300 group-hover:rotate-[-5deg]" strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
};
