import React from 'react';
import { cn } from '@/utils/cn';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary' | 'accent';

interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  error: 'bg-error/10 text-error border-error/20',
  info: 'bg-info/10 text-info border-info/20',
  neutral: 'bg-surface-alt text-ink-secondary border-line',
  primary: 'bg-primary/10 text-primary border-primary/20',
  accent: 'bg-accent/10 text-accent border-accent/20',
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
