import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tag } from '@/components/ui/Tag';
import { FilterChip } from '@/components/ui/Toolbar';
import { ListPage } from '@/components/templates/ListPage';
import { useUrlParam } from '@/hooks/useUrlParam';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  idOf, useCreateOrg, useOperatorCan, useOrgAction, useOrgs, usePlans,
  type OperatorOrg,
} from '@/features/operator/operatorApi';

const inputCls = 'w-full h-9 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600';
const LIMIT = 20;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function CreateOrgDialog({ onClose }: { onClose: () => void }) {
  const { data: plans } = usePlans();
  const create = useCreateOrg();
  const [form, setForm] = useState({ name: '', slug: '', plan_key: '', email: '', full_name: '' });
  const [result, setResult] = useState<any>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const valid = form.name && form.plan_key && form.email && form.full_name;

  const submit = async () => {
    const res = await create.mutateAsync({
      name: form.name,
      slug: form.slug || undefined,
      plan_key: form.plan_key,
      first_admin: { email: form.email, full_name: form.full_name },
    });
    setResult({ ...(res?.data ?? {}), ...(res?.meta ?? {}) });
  };
  const invite = result && (result.invite_token || result.invite_link);

  return (
    <Modal isOpen onClose={onClose} title="Create Organization" size="sm">
      {result ? (
        <div className="space-y-3 text-sm">
          <p className="text-success font-medium">
            {result.already_existed ? 'Organization already existed (no changes made).' : result.invite_email_sent ? 'Organization created. Invite email sent to the first admin.' : 'Organization created. Invite email was not sent.'}
          </p>
          {!import.meta.env.PROD && invite && (
            <div>
              <p className="text-xs text-ink-muted mb-1">Invite (non-production only)</p>
              <code className="block break-all p-2 bg-surface-alt border border-line rounded text-xs">{String(invite)}</code>
            </div>
          )}
          <button onClick={onClose} className="h-9 px-4 bg-primary text-white rounded-md text-sm">Done</button>
        </div>
      ) : (
        <div className="space-y-3">
          <input className={inputCls} placeholder="Organization name" value={form.name} onChange={set('name')} />
          <input className={inputCls} placeholder="Slug (optional)" value={form.slug} onChange={set('slug')} />
          <select className={inputCls} value={form.plan_key} onChange={set('plan_key')}>
            <option value="">Select plan...</option>
            {(plans ?? []).map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <input className={inputCls} placeholder="First admin full name" value={form.full_name} onChange={set('full_name')} />
          <input className={inputCls} type="email" placeholder="First admin email" value={form.email} onChange={set('email')} />
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-line rounded-md">Cancel</button>
            <button onClick={submit} disabled={!valid || create.isPending} className="h-9 px-4 text-sm bg-primary text-white rounded-md disabled:opacity-50">
              {create.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const fieldCls =
  'h-9 rounded-control border border-line bg-surface px-2 text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral'> = { active: 'success', suspended: 'warning', closed: 'neutral' };
const SORTS = [['created', 'Newest'], ['name', 'Name'], ['members', 'Most members'], ['last_activity', 'Last activity']] as const;
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : '-');

export default function OperatorOrgsPage() {
  const navigate = useNavigate();
  const [search] = useUrlParam('search');
  const [status, setStatus] = useUrlParam('status');
  const [plan, setPlan] = useUrlParam('plan');
  const [tag, setTag] = useUrlParam('tag');
  const [trial, setTrial] = useUrlParam('trial');
  const [sort, setSort] = useUrlParam('sort', 'created');
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<{ org: OperatorOrg; action: 'suspend' | 'reactivate' | 'close' } | null>(null);

  const params = {
    search: search || undefined, status: status || undefined, plan: plan || undefined, tag: tag || undefined,
    trial: trial === 'true' ? true : undefined, sort: sort !== 'created' ? sort : undefined,
  };
  // Cursor stack, reset whenever any filter or the sort changes.
  const key = JSON.stringify(params);
  const [paging, setPaging] = useState<{ forKey: string; cursors: string[] }>({ forKey: key, cursors: [] });
  const cursors = paging.forKey === key ? paging.cursors : [];

  const { data, isLoading, isError, isFetching, refetch } = useOrgs({ ...params, cursor: cursors[cursors.length - 1], limit: LIMIT });
  const plans = usePlans().data ?? [];
  const action = useOrgAction();
  const canWrite = useOperatorCan('tenants.write');
  const canClose = useOperatorCan('tenants.close');
  const canEntitle = useOperatorCan('entitlements.write');
  const orgs = data?.data ?? [];
  const filtered = Object.values(params).some(Boolean);

  const columns = useMemo<ColumnDef<OperatorOrg>[]>(
    () => [
      {
        header: 'Organization',
        id: 'name',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.name}</p>
            <p className="text-label text-ink-muted">{row.original.slug}</p>
          </div>
        ),
      },
      {
        header: 'Status',
        id: 'status',
        cell: ({ row }) => <StatusBadge variant={STATUS_VARIANT[row.original.status] ?? 'neutral'}>{row.original.status}</StatusBadge>,
      },
      { header: 'Plan', id: 'plan', cell: ({ row }) => row.original.plan_key ?? '-' },
      {
        header: 'Members',
        id: 'members',
        cell: ({ row }) => (
          <span className="tabular">{row.original.members_active ?? 0} active / {row.original.members_total ?? row.original.members_count ?? 0}</span>
        ),
      },
      {
        header: 'Products',
        id: 'products',
        cell: ({ row }) =>
          row.original.products?.length ? (
            <span className="flex flex-wrap gap-1">{row.original.products.map((p) => <Tag key={p}>{p}</Tag>)}</span>
          ) : (
            '-'
          ),
      },
      {
        header: 'Tags',
        id: 'tags',
        cell: ({ row }) =>
          row.original.tags?.length ? (
            <span className="flex flex-wrap gap-1">{row.original.tags.map((t) => <Tag key={t}>{t}</Tag>)}</span>
          ) : (
            '-'
          ),
      },
      { header: 'Trial ends', id: 'trial', cell: ({ row }) => day(row.original.trial_ends_at) },
      { header: 'Last activity', id: 'activity', cell: ({ row }) => <span className="whitespace-nowrap text-table">{day(row.original.last_activity_at)}</span> },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) => {
          const o = row.original;
          return (
            <div className="flex justify-end gap-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
              {canEntitle && <Button variant="outline" size="sm" onClick={() => navigate(`${ROUTES.OPERATOR_ORGS}/${idOf(o)}?tab=products`)}>Entitlements</Button>}
              {canWrite && o.status === 'active' && <Button variant="outline" size="sm" onClick={() => setConfirm({ org: o, action: 'suspend' })}>Suspend</Button>}
              {canWrite && o.status === 'suspended' && <Button variant="outline" size="sm" onClick={() => setConfirm({ org: o, action: 'reactivate' })}>Reactivate</Button>}
              {canClose && o.status !== 'closed' && <Button variant="outline" size="sm" onClick={() => setConfirm({ org: o, action: 'close' })}>Close</Button>}
            </div>
          );
        },
      },
    ],
    [canEntitle, canWrite, canClose, navigate]
  );

  return (
    <>
      <ListPage
        title="Organizations"
        subtitle="Every tenant on the platform."
        primaryAction={canWrite ? <Button onClick={() => setCreating(true)}>Create organization</Button> : undefined}
        toolbar={{
          search: { urlKey: 'search', placeholder: 'Search name or slug' },
          filters: (
            <>
              <select aria-label="Status" className={fieldCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="closed">Closed</option>
              </select>
              <select aria-label="Plan" className={fieldCls} value={plan} onChange={(e) => setPlan(e.target.value)}>
                <option value="">All plans</option>
                {plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
              <input aria-label="Tag" placeholder="Tag" className={`${fieldCls} w-28`} value={tag} onChange={(e) => setTag(e.target.value)} />
              <FilterChip label="In trial" active={trial === 'true'} onClick={() => setTrial(trial === 'true' ? '' : 'true')} />
            </>
          ),
          sort: (
            <select aria-label="Sort" className={fieldCls} value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          ),
        }}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isEmpty={!isLoading && !isError && orgs.length === 0 && cursors.length === 0}
        emptyTitle={filtered ? 'No organizations match these filters' : 'No organizations yet'}
        emptyDescription={filtered ? 'Change or clear the filters.' : 'Create the first organization to get started.'}
      >
        <DataTable
          columns={columns}
          data={orgs}
          onRowClick={(o) => navigate(`${ROUTES.OPERATOR_ORGS}/${idOf(o)}`)}
          stickyHeader
          paging={{
            hasNext: !!data?.next_cursor,
            hasPrev: cursors.length > 0,
            isLoading: isFetching,
            onNext: () => data?.next_cursor && setPaging({ forKey: key, cursors: [...cursors, data.next_cursor] }),
            onPrev: () => setPaging({ forKey: key, cursors: cursors.slice(0, -1) }),
          }}
        />
      </ListPage>

      {creating && <CreateOrgDialog onClose={() => setCreating(false)} />}
      <ConfirmDialog
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm ? `${cap(confirm.action)} ${confirm.org.name}?` : ''}
        description={confirm?.action === 'close' ? 'Closing an organization is permanent and revokes all member access.' : 'This changes access for every member of the organization.'}
        confirmLabel={confirm ? cap(confirm.action) : 'Confirm'}
        variant={confirm?.action === 'reactivate' ? 'warning' : 'danger'}
        isLoading={action.isPending}
        onConfirm={() => confirm && action.mutate({ id: idOf(confirm.org), action: confirm.action }, { onSettled: () => setConfirm(null) })}
      />
    </>
  );
}
