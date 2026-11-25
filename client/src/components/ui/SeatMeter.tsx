import React from 'react';
import { cn } from '@/utils/cn';

interface SeatMeterProps {
  used: number;
  /** null or undefined means unlimited. */
  total?: number | null;
  label?: string;
  className?: string;
}

/** SeatMeter: used of total seats; amber from 90 %, red at the limit (DRD 9.2). */
export const SeatMeter: React.FC<SeatMeterProps> = ({ used, total, label = 'Seats', className }) => {
  // 0 is a real limit (no seats; the server refuses every assignment); only null / undefined mean unlimited.
  const limit = typeof total === 'number' && total >= 0 ? total : null;
  const pct = limit === null ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const bar = pct >= 100 ? 'bg-error' : pct >= 90 ? 'bg-warning' : 'bg-primary';
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between text-table">
        <span className="text-ink-secondary">{label}</span>
        <span className="tabular text-ink">
          {used}
          {limit !== null ? ` of ${limit}` : ' (unlimited)'}
        </span>
      </div>
      {limit !== null && (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
          className="h-2 rounded-full bg-white/10 overflow-hidden"
        >
          <div className={cn('h-full rounded-full transition-all duration-panel', bar)} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
};
