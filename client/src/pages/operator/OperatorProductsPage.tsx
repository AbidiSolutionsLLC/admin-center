import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ListPage } from '@/components/templates/ListPage';
import { useCatalogue, useOperatorMe, type CatalogueProduct } from '@/features/operator/operatorApi';
import { useStandalonePortals, useRotateSecret } from '@/features/operator/standalone/standaloneApi';
import { RegisterStandaloneModal } from '@/features/operator/standalone/RegisterStandaloneModal';
import { SecretOnceDialog } from '@/features/operator/standalone/SecretOnceDialog';
import type { StandalonePortal } from '@/features/operator/standalone/standaloneForm';

const STATUS_VARIANT: Record<string, 'success' | 'info' | 'neutral' | 'warning'> = { active: 'success', beta: 'info', hidden: 'neutral', retired: 'warning' };

interface Secret { clientId: string; secret: string; previousValidUntil?: string | null }

export default function OperatorProductsPage() {
  const { data, isLoading, isError, refetch } = useCatalogue();
  const { data: standalone = [] } = useStandalonePortals();
  const me = useOperatorMe().data;
  // The API accepts `products.write` or the platform_admin role; the page only hides what it would refuse.
  const canRegister = !!me && (me.permissions.includes('products.write') || (me.roles ?? []).includes('platform_admin'));
  const [editing, setEditing] = useState<StandalonePortal | 'new' | null>(null);
  const [rotating, setRotating] = useState<StandalonePortal | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const rotate = useRotateSecret();
  const portalOf = (key: string) => standalone.find((p) => p.product_key === key);

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
      { header: 'Hosting', id: 'hosting', cell: ({ row }) => (portalOf(row.original.product_key) ? <StatusBadge variant="info">Standalone</StatusBadge> : <span className="text-ink-muted">Suite</span>) },
      { header: 'Status', id: 'status', cell: ({ row }) => <StatusBadge variant={STATUS_VARIANT[row.original.status] ?? 'neutral'}>{row.original.status}</StatusBadge> },
      { header: 'Category', id: 'category', cell: ({ row }) => row.original.category ?? '-' },
      { header: 'Manifest', id: 'manifest', cell: ({ row }) => <span className="tabular">{row.original.manifest_version ? `v${row.original.manifest_version}` : '-'}</span> },
      { header: 'Roles', id: 'roles', cell: ({ row }) => <span className="tabular">{row.original.roles}</span> },
      { header: 'Active', id: 'active', cell: ({ row }) => <span className="tabular">{row.original.tenants_active}</span> },
      { header: 'Suspended', id: 'suspended', cell: ({ row }) => <span className="tabular">{row.original.tenants_suspended}</span> },
      { header: 'Restricted', id: 'restricted', cell: ({ row }) => <span className="tabular">{row.original.tenants_restricted}</span> },
      {
        header: '', id: 'actions',
        cell: ({ row }) => {
          const p = portalOf(row.original.product_key);
          if (!p || !canRegister) return null;
          return (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>Edit</Button>
              {p.hosting.client.has_secret && (
                <Button variant="outline" size="sm" onClick={() => setRotating(p)} aria-label={`Rotate secret of ${p.name}`}>Rotate secret</Button>
              )}
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [standalone, canRegister]
  );

  return (
    <>
      <ListPage
        title="Products"
        subtitle="Registered products and how many organizations hold each. Suite products register themselves; standalone portals are registered here."
        primaryAction={canRegister ? <Button onClick={() => setEditing('new')}>Register standalone portal</Button> : undefined}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isEmpty={!isLoading && !isError && (data ?? []).length === 0}
        emptyTitle="No products registered"
        emptyDescription="Products appear here once a manifest has been published."
      >
        <DataTable columns={columns} data={data ?? []} />
      </ListPage>

      {editing && (
        <RegisterStandaloneModal
          portal={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(r) => {
            setEditing(null);
            if (r.client_secret) setSecret({ clientId: r.client_id, secret: r.client_secret });
          }}
        />
      )}
      <ConfirmDialog
        isOpen={!!rotating}
        onClose={() => setRotating(null)}
        variant="warning"
        title={`Rotate the client secret of ${rotating?.name ?? ''}?`}
        description="A new secret is issued and shown once. The current secret keeps working for 24 hours."
        confirmLabel="Rotate secret"
        isLoading={rotate.isPending}
        onConfirm={async () => {
          if (!rotating) return;
          try {
            const r = await rotate.mutateAsync(rotating.product_key);
            setRotating(null);
            setSecret({ clientId: r.client_id, secret: r.client_secret, previousValidUntil: r.previous_secret_expires_at });
          } catch { /* toasted by the hook */ }
        }}
      />
      {secret && <SecretOnceDialog {...secret} onClose={() => setSecret(null)} />}
    </>
  );
}
