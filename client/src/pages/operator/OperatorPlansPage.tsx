import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/FormField';
import { Tag } from '@/components/ui/Tag';
import { DataTable } from '@/components/ui/DataTable';
import { ListPage } from '@/components/templates/ListPage';
import { usePlans, useSavePlan, type Plan } from '@/features/operator/operatorApi';

function PlanDialog({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const save = useSavePlan();
  const [key, setKey] = useState(plan?.key ?? '');
  const [name, setName] = useState(plan?.name ?? '');
  const [products, setProducts] = useState((plan?.products ?? []).join(', '));
  const submit = async () => {
    const list = products.split(',').map((p) => p.trim()).filter(Boolean);
    await save.mutateAsync({ id: plan?.key, body: plan ? { name, products: list } : { key, name, products: list } });
    onClose();
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={plan ? `Edit plan: ${plan.name}` : 'Create plan'}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="border-line bg-surface text-ink hover:bg-surface-hover">
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name || (!plan && !key) || save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!plan && (
          <FormField label="Key" hint="Lower-case identifier, for example starter" required>
            {(p) => <Input {...p} value={key} onChange={(e) => setKey(e.target.value)} />}
          </FormField>
        )}
        <FormField label="Name" required>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField label="Products" hint="Product keys, comma separated">
          {(p) => <Input {...p} value={products} onChange={(e) => setProducts(e.target.value)} />}
        </FormField>
      </div>
    </Modal>
  );
}

export default function OperatorPlansPage() {
  const { data: plans, isLoading, isError, refetch } = usePlans();
  const [editing, setEditing] = useState<Plan | null | undefined>(undefined); // undefined = closed, null = create

  const columns = useMemo<ColumnDef<Plan>[]>(
    () => [
      { header: 'Key', accessorKey: 'key', cell: ({ row }) => <span className="font-mono text-table">{row.original.key}</span> },
      { header: 'Name', accessorKey: 'name' },
      {
        header: 'Products',
        id: 'products',
        cell: ({ row }) =>
          row.original.products.length ? (
            <span className="flex flex-wrap gap-1">
              {row.original.products.map((p) => (
                <Tag key={p}>{p}</Tag>
              ))}
            </span>
          ) : (
            '-'
          ),
      },
    ],
    []
  );

  return (
    <>
      <ListPage
        title="Plans"
        subtitle="Which products each plan includes."
        primaryAction={<Button onClick={() => setEditing(null)}>Create plan</Button>}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isEmpty={!isLoading && !isError && (plans ?? []).length === 0}
        emptyTitle="No plans yet"
        emptyDescription="Create the first plan to offer products to organizations."
        emptyAction={{ label: 'Create plan', onClick: () => setEditing(null) }}
      >
        <DataTable columns={columns} data={plans ?? []} onRowClick={(p) => setEditing(p)} />
      </ListPage>
      {editing !== undefined && <PlanDialog plan={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}
