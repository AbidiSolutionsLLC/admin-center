import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ListPage } from '@/components/templates/ListPage';
import { useCatalogue, type CatalogueProduct } from '@/features/operator/operatorApi';

const STATUS_VARIANT: Record<string, 'success' | 'info' | 'neutral' | 'warning'> = { active: 'success', beta: 'info', hidden: 'neutral', retired: 'warning' };

export default function OperatorProductsPage() {
  const { data, isLoading, isError, refetch } = useCatalogue();
  const columns = useMemo<ColumnDef<CatalogueProduct>[]>(
    () => [
      {
        header: 'Product',
        id: 'name',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.name}</p>
            <p className="font-mono text-label text-ink-muted">{row.original.product_key}</p>
          </div>
        ),
      },
      { header: 'Status', id: 'status', cell: ({ row }) => <StatusBadge variant={STATUS_VARIANT[row.original.status] ?? 'neutral'}>{row.original.status}</StatusBadge> },
      { header: 'Category', id: 'category', cell: ({ row }) => row.original.category ?? '-' },
      { header: 'Manifest', id: 'manifest', cell: ({ row }) => <span className="tabular">{row.original.manifest_version ? `v${row.original.manifest_version}` : '-'}</span> },
      { header: 'Roles', id: 'roles', cell: ({ row }) => <span className="tabular">{row.original.roles}</span> },
      { header: 'Active', id: 'active', cell: ({ row }) => <span className="tabular">{row.original.tenants_active}</span> },
      { header: 'Suspended', id: 'suspended', cell: ({ row }) => <span className="tabular">{row.original.tenants_suspended}</span> },
      { header: 'Restricted', id: 'restricted', cell: ({ row }) => <span className="tabular">{row.original.tenants_restricted}</span> },
    ],
    []
  );
  return (
    <ListPage
      title="Products"
      subtitle="Registered products and how many organizations hold each. Products register themselves; this list is read-only."
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isEmpty={!isLoading && !isError && (data ?? []).length === 0}
      emptyTitle="No products registered"
      emptyDescription="Products appear here once a manifest has been published."
    >
      <DataTable columns={columns} data={data ?? []} />
    </ListPage>
  );
}
