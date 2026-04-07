import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { HelpCircle } from 'lucide-react';
import { Button } from './button';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * EmptyState Component
 * Displays a standardized empty state when no data is available.
 * Includes an optional CTA button.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No items yet',
  description = 'Start by creating your first item.',
  icon: Icon = HelpCircle,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-lg border border-line shadow-card">
      {/* Icon container — amber tinted */}
      <div className="w-12 h-12 rounded-xl bg-primary-light flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <h3 className="text-sm font-semibold text-ink mb-1">{title}</h3>
      <p className="text-sm text-ink-secondary mb-5 max-w-xs">{description}</p>
      {action && (
        <Button variant="default" onClick={action.onClick} className="bg-primary hover:bg-primary-hover">
          {action.label}
        </Button>
      )}
    </div>
  );
};
