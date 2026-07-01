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
    <div style={{
      background: 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 20,
      padding: '64px 24px',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Icon container */}
      <div style={{
        width: 54, height: 54, borderRadius: 14,
        background: 'rgba(245,176,42,0.10)',
        border: '1px solid rgba(245,176,42,0.20)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
      }}>
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <h3 className="text-sm font-semibold text-slate-200 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 mb-5 max-w-xs">{description}</p>
      {action && (
        <Button variant="default" onClick={action.onClick} className="btn-primary-glow border-0">
          {action.label}
        </Button>
      )}
    </div>
  );
};
