import React from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import type { Breadcrumb, OverflowItem } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';

type StatTileProps = React.ComponentProps<typeof StatTile>;

interface DashboardPageProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  status?: React.ReactNode;
  primaryAction?: React.ReactNode;
  overflow?: OverflowItem[];
  /** The StatTile row. Each tile is a link when it has `href`. */
  tiles?: Array<StatTileProps & { id: string }>;
  /**
   * Sections for the 12-column grid. Wrap each in `SectionBoundary` and give it a
   * column span through `span` so one failing section never blanks the page.
   */
  sections: Array<{ id: string; span?: 3 | 4 | 6 | 8 | 12; node: React.ReactNode }>;
}

const spanClass = {
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  6: 'lg:col-span-6',
  8: 'lg:col-span-8',
  12: 'lg:col-span-12',
} as const;

/** Dashboard template (DRD 9.3): PageHeader, StatTile row, sections in a 12-column grid. */
export const DashboardPage: React.FC<DashboardPageProps> = ({
  title,
  subtitle,
  breadcrumbs,
  status,
  primaryAction,
  overflow,
  tiles,
  sections,
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
    {tiles && tiles.length > 0 && (
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(({ id, ...tile }) => (
          <StatTile key={id} {...tile} />
        ))}
      </div>
    )}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {sections.map((s) => (
        <div key={s.id} className={spanClass[s.span ?? 12]}>
          {s.node}
        </div>
      ))}
    </div>
  </div>
);
