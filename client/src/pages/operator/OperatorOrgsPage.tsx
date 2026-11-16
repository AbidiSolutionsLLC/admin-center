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
import { CreateOrgDialog } from './CreateOrgDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  idOf, useOperatorCan, useOrgAction, useOrgs, usePlans,
  type OperatorOrg,
} from '@/features/operator/operatorApi';

const LIMIT = 20;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

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
        description={confirm?.action === 'close' ? 'Closing an organization is permanent and revokes all member access.' : confirm?.action === 'suspend' ? 'Every member loses access until the organization is reactivated.' : 'Members get their access back.'}
        reasonField={{ label: 'Reason (recorded in the audit log)', required: true }}
        requireText={confirm && confirm.action !== 'reactivate' ? confirm.org.slug : undefined}
        confirmLabel={confirm ? cap(confirm.action) : 'Confirm'}
        variant={confirm?.action === 'reactivate' ? 'warning' : 'danger'}
        isLoading={action.isPending}
        onConfirm={(reason) => confirm && reason && action.mutate(
          { id: idOf(confirm.org), action: confirm.action, reason, confirm_slug: confirm.action === 'reactivate' ? undefined : confirm.org.slug },
          { onSettled: () => setConfirm(null) },
        )}
      />
    </>
  );
}
