import React from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import type { Breadcrumb, OverflowItem } from '@/components/ui/PageHeader';
import { KeyFacts } from '@/components/ui/KeyFacts';
import type { KeyFact } from '@/components/ui/KeyFacts';
import { Tabs } from '@/components/ui/Tabs';
import type { TabItem } from '@/components/ui/Tabs';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageStates } from './PageStates';

interface ObjectPageProps {
  /** The object's name. While loading, pass an empty string. */
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  status?: React.ReactNode;
  primaryAction?: React.ReactNode;
  overflow?: OverflowItem[];
  facts?: KeyFact[];
  factColumns?: 2 | 3 | 4;
  tabs: TabItem[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** The load succeeded but the object does not exist (or belongs to another tenant). */
  notFound?: boolean;
  forbidden?: boolean;
}

/**
 * Object template (DRD 9.3): PageHeader (name, status, actions), KeyFacts, Tabs.
 * Tabs are URL-synced (`?tab=`).
 */
export const ObjectPage: React.FC<ObjectPageProps> = ({
  title,
  subtitle,
  breadcrumbs,
  status,
  primaryAction,
  overflow,
  facts,
  factColumns,
  tabs,
  isLoading,
  isError,
  onRetry,
  notFound,
  forbidden,
}) => (
  <div>
    <PageHeader
      title={isLoading ? 'Loading' : title}
      subtitle={subtitle}
      breadcrumbs={breadcrumbs}
      status={status}
      primaryAction={primaryAction}
      overflow={overflow}
    />
    <PageStates
      isLoading={isLoading}
      forbidden={forbidden}
      skeleton={<div className="h-40 animate-pulse rounded-card border border-line bg-surface" aria-busy="true" />}
    >
      {isError ? (
        <ErrorState onRetry={onRetry} />
      ) : notFound ? (
        <EmptyState title="Not found" description="This item does not exist or you cannot see it." />
      ) : (
        <div className="space-y-4">
          {facts && facts.length > 0 && <KeyFacts items={facts} columns={factColumns} />}
          <Tabs items={tabs} />
        </div>
      )}
    </PageStates>
  </div>
);
