import React from 'react';
import { cn } from '@/utils/cn';

export type Health = 'healthy' | 'degraded' | 'critical' | 'unknown';

const map: Record<Health, { label: string; dot: string; text: string }> = {
  healthy: { label: 'Healthy', dot: 'bg-success', text: 'text-success' },
  degraded: { label: 'Degraded', dot: 'bg-warning', text: 'text-warning' },
  critical: { label: 'Critical', dot: 'bg-error', text: 'text-error' },
  unknown: { label: 'Unknown', dot: 'bg-ink-muted', text: 'text-ink-secondary' },
};

interface HealthPillProps {
  health: Health;
  className?: string;
}

/** HealthPill: Healthy / Degraded / Critical / Unknown, dot plus word (DRD 9.2). */
export const HealthPill: React.FC<HealthPillProps> = ({ health, className }) => {
  const m = map[health] ?? map.unknown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 h-6 text-table',
        m.text,
        className,
      )}
    >
      <span className={cn('h-dot w-dot rounded-full', m.dot)} aria-hidden />
      {m.label}
    </span>
  );
};
