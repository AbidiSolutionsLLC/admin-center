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
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-lg border border-line shadow-card">
      <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-error" />
      </div>
      <h3 className="text-sm font-semibold text-ink mb-1">{title}</h3>
      <p className="text-sm text-ink-secondary mb-5">{description}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
};
