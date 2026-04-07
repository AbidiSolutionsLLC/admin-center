import React from 'react';
import { cn } from '@/utils/cn';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary' | 'accent';

interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  neutral: 'bg-surface-alt text-ink-muted border-line',
  primary: 'bg-primary-light text-amber-700 border-amber-200',
  accent: 'bg-accent-light text-accent border-indigo-200',
};

/**
 * StatusBadge Component
 * Displays a standardized status pill with variant-based colors.
 * Used for lifecycle states, department types, etc.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  children,
  variant = 'neutral',
  className,
}) => {
  return (
    <span
      className={cn(
        'inline-flex items-center text-[11px] font-semibold tracking-wide rounded-full px-2.5 py-0.5 border',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
};
