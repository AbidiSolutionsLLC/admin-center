import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/cn';

interface SectionBoundaryProps {
  title?: string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** Shown instead of children when true and not loading or failed. */
  isEmpty?: boolean;
  emptyText?: string;
  children: React.ReactNode;
  className?: string;
}

const ErrorBody: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <div role="alert" className="flex items-center gap-3 text-body text-ink-secondary py-6">
    <AlertTriangle className="w-4 h-4 text-error shrink-0" aria-hidden />
    <span>This section could not be loaded.</span>
    {onRetry && (
      <button type="button" onClick={onRetry} className="text-primary hover:underline">
        Retry
      </button>
    )}
  </div>
);

class Catcher extends React.Component<{ onRetry?: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <ErrorBody
          onRetry={() => {
            this.setState({ failed: false });
            this.props.onRetry?.();
          }}
        />
      );
    }
    return this.props.children;
  }
}

/**
 * SectionBoundary: wraps a dashboard section with its own loading, error and
 * empty state so one failure does not blank the page (DRD 9.2). A render
 * error inside the section is caught too.
 */
export const SectionBoundary: React.FC<SectionBoundaryProps> = ({
  title,
  isLoading,
  isError,
  onRetry,
  isEmpty,
  emptyText = 'Nothing to show yet.',
  children,
  className,
}) => (
  <section className={cn('rounded-card border border-line bg-surface p-4', className)}>
    {title && <h2 className="text-section text-ink mb-3">{title}</h2>}
    {isLoading ? (
      <div aria-busy="true" className="space-y-2">
        <div className="h-4 w-1/3 rounded bg-white/5 animate-pulse" />
        <div className="h-4 w-full rounded bg-white/5 animate-pulse" />
        <div className="h-4 w-2/3 rounded bg-white/5 animate-pulse" />
      </div>
    ) : isError ? (
      <ErrorBody onRetry={onRetry} />
    ) : isEmpty ? (
      <p className="text-body text-ink-muted py-6">{emptyText}</p>
    ) : (
      <Catcher onRetry={onRetry}>{children}</Catcher>
    )}
  </section>
);
