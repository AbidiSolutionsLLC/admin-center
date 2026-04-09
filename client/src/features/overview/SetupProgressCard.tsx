// client/src/features/overview/SetupProgressCard.tsx
import { CheckCircle2, Circle } from 'lucide-react';
import type { SetupProgress } from '@/types';

interface SetupProgressCardProps {
  progress: SetupProgress;
  isLoading?: boolean;
}

/**
 * SetupProgressCard Component
 * Shows setup completion across all modules
 */
export const SetupProgressCard: React.FC<SetupProgressCardProps> = ({
  progress,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="bg-surface border border-line rounded-lg shadow-card p-5">
        <div className="h-4 bg-surface-alt animate-pulse rounded w-32 mb-3" />
        <div className="h-2 bg-surface-alt animate-pulse rounded w-full mb-2" />
        <div className="space-y-2 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-3 bg-surface-alt animate-pulse rounded w-3/4" />
          ))}
        </div>
      </div>
    );
  }

  const getProgressColor = (percentage: number) => {
    if (percentage === 100) return 'bg-success';
    if (percentage >= 50) return 'bg-warning';
    return 'bg-primary';
  };

  return (
    <div className="bg-surface border border-line rounded-lg shadow-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink">Setup Progress</h3>
        <span className="text-xs font-medium text-ink-secondary">
          {progress.completed_checks}/{progress.total_checks} completed
        </span>
      </div>

      {/* Overall Progress Bar */}
      <div className="w-full h-2 bg-surface-alt rounded-full overflow-hidden mb-4">
        <div
          className={`h-full ${getProgressColor(progress.overall_percentage)} transition-all`}
          style={{ width: `${progress.overall_percentage}%` }}
        />
      </div>

      <p className="text-xs text-ink-muted mb-4">
        {progress.overall_percentage}% complete
      </p>

      {/* Module Progress */}
      <div className="space-y-3">
        {progress.modules.map((module) => (
          <div key={module.key}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {module.percentage === 100 ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <Circle className="h-4 w-4 text-ink-muted" />
                )}
                <span className="text-xs font-medium text-ink-secondary">{module.label}</span>
              </div>
              <span className="text-xs text-ink-muted">
                {module.completed}/{module.total}
              </span>
            </div>
            <div className="h-1.5 bg-surface-alt rounded-full overflow-hidden ml-6">
              <div
                className={`h-full ${getProgressColor(module.percentage)} transition-all`}
                style={{ width: `${module.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
