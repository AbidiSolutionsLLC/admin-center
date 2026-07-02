import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './button';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

/**
 * ErrorState Component
 * Displays a standardized error message with a retry button.
 * Used across the application for data fetching failures.
 */
export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to load data',
  description = 'Something went wrong fetching this data. Try again.',
  onRetry,
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
      <div style={{
        width: 54, height: 54, borderRadius: 14,
        background: 'rgba(239,68,68,0.12)',
        border: '1px solid rgba(239,68,68,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
      }}>
        <AlertTriangle className="w-6 h-6 text-error" />
      </div>
      <h3 className="text-sm font-semibold text-slate-200 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 mb-5">{description}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="bg-white/5 border-white/10 text-slate-200 hover:bg-white/10">
          Retry
        </Button>
      )}
    </div>
  );
};
