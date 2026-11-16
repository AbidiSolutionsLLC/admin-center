import React from 'react';
import { Lock } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';

/**
 * The five states of a migrated page (DRD 9.4): loading, error, empty,
 * no access, and the populated content. Templates use this to pick one.
 */
export interface PageStateProps {
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; onClick: () => void };
  /** The user lacks permission to see this page's data. */
  forbidden?: boolean;
}

interface PageStatesProps extends PageStateProps {
  children: React.ReactNode;
  /** Placeholder shown while loading. Defaults to a table skeleton. */
  skeleton?: React.ReactNode;
}

export const PageStates: React.FC<PageStatesProps> = ({
  isLoading,
  isError,
  onRetry,
  isEmpty,
  emptyTitle,
  emptyDescription,
  emptyAction,
  forbidden,
  skeleton,
  children,
}) => {
  if (forbidden) {
    return (
      <EmptyState
        icon={Lock}
        title="You do not have access"
        description="Ask an administrator for the permission that opens this page."
      />
    );
  }
  if (isLoading) return <>{skeleton ?? <TableSkeleton />}</>;
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (isEmpty) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  return <>{children}</>;
};
