import React from 'react';
import { cn } from '@/utils/cn';

type BadgeVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'neutral'
  | 'primary'
  | 'accent'
  | 'action-needed';

interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const dotStyles: Record<Exclude<BadgeVariant, 'action-needed'>, { dot: string; text: string }> = {
  success: { dot: 'bg-success', text: 'text-success' },
  warning: { dot: 'bg-warning', text: 'text-warning' },
  error: { dot: 'bg-error', text: 'text-error' },
  info: { dot: 'bg-info', text: 'text-info' },
  neutral: { dot: 'bg-ink-muted', text: 'text-ink-secondary' },
  primary: { dot: 'bg-primary', text: 'text-primary' },
  accent: { dot: 'bg-accent', text: 'text-accent' },
};

/**
 * StatusBadge Component
 * Dot plus word (DRD 9.2). The filled pill is reserved for `action-needed`.
 * Used for lifecycle states, department types, etc.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  children,
  variant = 'neutral',
  className,
}) => {
  if (variant === 'action-needed') {
    return (
      <span
        className={cn(
          'inline-flex items-center text-table font-medium rounded-full px-2.5 py-0.5 border',
          'bg-warning/10 text-warning border-warning/30',
          className
        )}
      >
        {children}
      </span>
    );
  }
  const s = dotStyles[variant];
  return (
    <span className={cn('inline-flex items-center gap-2 text-table font-medium', s.text, className)}>
      <span className={cn('h-dot w-dot rounded-full shrink-0', s.dot)} aria-hidden />
      {children}
    </span>
  );
};
