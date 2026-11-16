import React from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import type { Breadcrumb, OverflowItem } from '@/components/ui/PageHeader';
import { Toolbar } from '@/components/ui/Toolbar';
import { Drawer } from '@/components/ui/Drawer';
import { PageStates } from './PageStates';
import type { PageStateProps } from './PageStates';

type ToolbarProps = React.ComponentProps<typeof Toolbar>;

interface ListPageProps extends PageStateProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  status?: React.ReactNode;
  primaryAction?: React.ReactNode;
  overflow?: OverflowItem[];
  /** Omit for a list with no search or filters. */
  toolbar?: ToolbarProps;
  /** Row detail. The caller owns `isOpen`, ideally from a URL parameter. */
  drawer?: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    actions?: React.ReactNode;
    footer?: React.ReactNode;
    size?: 'md' | 'lg';
    content: React.ReactNode;
  };
  /** Usually a DataTable. */
  children: React.ReactNode;
}

/**
 * List template (DRD 9.3): PageHeader, Toolbar, DataTable, Drawer for row detail.
 * The page file passes data and handlers; the template owns layout and the
 * loading, error, empty and no-access states.
 */
export const ListPage: React.FC<ListPageProps> = ({
  title,
  subtitle,
  breadcrumbs,
  status,
  primaryAction,
  overflow,
  toolbar,
  drawer,
  children,
  ...states
}) => (
  <div>
    <PageHeader
      title={title}
      subtitle={subtitle}
      breadcrumbs={breadcrumbs}
      status={status}
      primaryAction={primaryAction}
      overflow={overflow}
    />
    {toolbar && !states.forbidden && <Toolbar {...toolbar} />}
    <PageStates {...states}>{children}</PageStates>
    {drawer && (
      <Drawer
        isOpen={drawer.isOpen}
        onClose={drawer.onClose}
        title={drawer.title}
        description={drawer.description}
        actions={drawer.actions}
        footer={drawer.footer}
        size={drawer.size}
      >
        {drawer.content}
      </Drawer>
    )}
  </div>
);
