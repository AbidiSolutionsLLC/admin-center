import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/Textarea';
import { FormField } from '@/components/ui/FormField';
import { Tag } from '@/components/ui/Tag';
import { DataTable } from '@/components/ui/DataTable';
import { ListPage } from '@/components/templates/ListPage';
import {
  useApplyPlan, useOperatorCan, usePlanPreview, usePlans, useSavePlan, type Plan, type PlanPreview,
} from '@/features/operator/operatorApi';

const parseProducts = (text: string) => text.split(',').map((p) => p.trim()).filter(Boolean);

const PreviewList = ({ title, rows }: { title: string; rows: PlanPreview['added'] }) => (
  <div>
    <h3 className="text-label uppercase text-ink-muted">{title}</h3>
    {rows.length === 0 ? (
      <p className="text-body text-ink-muted">None</p>
    ) : (
      <ul className="text-body text-ink">
        {rows.map((r) => <li key={r.product_key}>{r.product_key}: {r.tenants} organization(s)</li>)}
      </ul>
    )}
  </div>
);

/** Shows what applying the plan to every tenant on it would change (a dry run), then queues it on confirm. */
function ApplyPlanDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const { data, isLoading, isError } = usePlanPreview(plan.key, true);
  const apply = useApplyPlan();
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Apply plan: ${plan.name}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="border-line bg-surface text-ink hover:bg-surface-hover">Cancel</Button>
          <Button disabled={!data || apply.isPending} onClick={() => apply.mutate(plan.key, { onSuccess: onClose })}>
            Apply to {data?.tenants_affected ?? 0} organization(s)
          </Button>
        </>
      }
    >
      {isLoading && <p className="text-body text-ink-muted">Working out the changes</p>}
      {isError && <p className="text-body text-error">Could not preview this plan.</p>}
      {data && (
        <div className="space-y-3">
          <p className="text-body text-ink-secondary">
            {data.tenants_affected === 0
              ? 'Every organization on this plan is already up to date.'
              : 'Overrides are never changed. A product that leaves the plan is restricted: access off, data kept.'}
          </p>
          <PreviewList title="Products added" rows={data.added} />
          <PreviewList title="Products restricted" rows={data.restricted} />
          <PreviewList title="Unchanged" rows={data.unchanged} />
        </div>
      )}
    </Modal>
  );
}

function PlanDialog({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const save = useSavePlan();
  const canApply = useOperatorCan('plans.write');
  const [applying, setApplying] = useState(false);
  const [key, setKey] = useState(plan?.key ?? '');
  const [name, setName] = useState(plan?.name ?? '');
  const [description, setDescription] = useState(plan?.description ?? '');
  const [products, setProducts] = useState((plan?.products ?? []).join(', '));
  const [trial, setTrial] = useState(plan?.trial_days ? String(plan.trial_days) : '');
  const [seats, setSeats] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(plan?.seat_defaults ?? {}).map(([k, v]) => [k, v === null ? '' : String(v)]))
  );
  const list = parseProducts(products);
  const submit = async () => {
    const seat_defaults = Object.fromEntries(list.filter((k) => seats[k] !== undefined && seats[k] !== '').map((k) => [k, Number(seats[k])]));
    const trial_days = trial ? Number(trial) : null;
    const body = { name, products: list, description, seat_defaults, trial_days };
    await save.mutateAsync({ id: plan?.key, body: plan ? body : { key, ...body } });
    onClose();
  };
  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        title={plan ? `Edit plan: ${plan.name}` : 'Create plan'}
        size="sm"
        footer={
          <>
            {plan && canApply && (
              <Button variant="outline" className="mr-auto" onClick={() => setApplying(true)}>Apply to organizations</Button>
            )}
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
          <FormField label="Description">
            {(p) => <Textarea {...p} maxLength={500} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}
          </FormField>
          <FormField label="Products" hint="Product keys, comma separated">
            {(p) => <Input {...p} value={products} onChange={(e) => setProducts(e.target.value)} />}
          </FormField>
          {list.length > 0 && (
            <div className="space-y-2">
              <p className="text-table font-medium text-ink">Default seats</p>
              {list.map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-28 text-body text-ink-secondary">{k}</span>
                  <Input aria-label={`Default seats for ${k}`} type="number" min={0} placeholder="No limit" value={seats[k] ?? ''} onChange={(e) => setSeats({ ...seats, [k]: e.target.value })} className="w-32" />
                </div>
              ))}
            </div>
          )}
          <FormField label="Trial days" hint="A new organization on this plan gets a trial end this many days ahead. Empty = no trial.">
            {(p) => <Input {...p} type="number" min={1} max={365} value={trial} onChange={(e) => setTrial(e.target.value)} />}
          </FormField>
          {plan && <p className="text-table text-ink-muted">Version {plan.version ?? 1}. Every edit raises it.</p>}
        </div>
      </Modal>
      {applying && plan && <ApplyPlanDialog plan={plan} onClose={() => setApplying(false)} />}
    </>
  );
}

export default function OperatorPlansPage() {
  const { data: plans, isLoading, isError, refetch } = usePlans();
  const canWrite = useOperatorCan('plans.write');
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
      { header: 'Organizations', id: 'tenants', cell: ({ row }) => <span className="tabular">{row.original.tenant_count ?? '-'}</span> },
      { header: 'Trial', id: 'trial', cell: ({ row }) => (row.original.trial_days ? `${row.original.trial_days} days` : '-') },
      { header: 'Version', id: 'version', cell: ({ row }) => <span className="tabular">{row.original.version ?? 1}</span> },
    ],
    []
  );

  return (
    <>
      <ListPage
        title="Plans"
        subtitle="Which products each plan includes."
        primaryAction={canWrite ? <Button onClick={() => setEditing(null)}>Create plan</Button> : undefined}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isEmpty={!isLoading && !isError && (plans ?? []).length === 0}
        emptyTitle="No plans yet"
        emptyDescription="Create the first plan to offer products to organizations."
        emptyAction={canWrite ? { label: 'Create plan', onClick: () => setEditing(null) } : undefined}
      >
        <DataTable columns={columns} data={plans ?? []} onRowClick={canWrite ? (p) => setEditing(p) : undefined} />
      </ListPage>
      {editing !== undefined && <PlanDialog plan={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}
