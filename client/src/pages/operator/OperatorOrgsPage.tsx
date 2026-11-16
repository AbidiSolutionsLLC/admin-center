import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  errMsg, idOf, operatorApi, useCreateOrg, useOperatorCan, useOrgAction, useOrgs, usePlans, useSetEntitlement,
  type OperatorOrg,
} from '@/features/operator/operatorApi';

const inputCls = 'w-full h-9 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600';
const LIMIT = 20;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// Plan assignment: PATCH /orgs/:id {plan_key} -> { id, plan_key, products } (activates the plan's products).
const useAssignPlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, plan_key }: { id: string; plan_key: string }) => (await operatorApi.patch(`/orgs/${id}`, { plan_key })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operator', 'orgs'] });
      qc.invalidateQueries({ queryKey: ['operator', 'org'] });
      toast.success('Plan assigned');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to assign plan')),
  });
};

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

function EntitlementsDialog({ org, onClose }: { org: OperatorOrg; onClose: () => void }) {
  const { data: plans } = usePlans();
  const setEnt = useSetEntitlement();
  const assignPlan = useAssignPlan();
  const [plan, setPlan] = useState('');
  const { data: detail } = useQuery({
    queryKey: ['operator', 'org', idOf(org)],
    queryFn: async () => (await operatorApi.get(`/orgs/${idOf(org)}`)).data.data as OperatorOrg,
  });
  const ents = detail?.entitlements ?? org.entitlements ?? [];
  const productKeys = Array.from(new Set([...(plans ?? []).flatMap((p) => p.products), ...ents.map((e) => e.product_key)]));
  const statusOf = (k: string) => ents.find((e) => e.product_key === k)?.status ?? 'none';

  return (
    <Modal isOpen onClose={onClose} title={`Entitlements: ${org.name}`} size="sm">
      <div className="space-y-4">
        <div className="flex gap-2">
          <select className={inputCls} value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">Assign plan...</option>
            {(plans ?? []).map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <button
            disabled={!plan || assignPlan.isPending}
            onClick={() => assignPlan.mutate({ id: idOf(org), plan_key: plan })}
            className="h-9 px-3 text-sm bg-primary text-white rounded-md disabled:opacity-50"
          >Apply</button>
        </div>
        <div className="divide-y divide-line border border-line rounded-md">
          {productKeys.map((k) => {
            const st = statusOf(k);
            const active = st === 'active';
            return (
              <div key={k} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{k}</p>
                  <p className="text-xs text-ink-muted">{st}</p>
                </div>
                <button
                  disabled={setEnt.isPending}
                  onClick={() => setEnt.mutate({ orgId: idOf(org), productKey: k, status: active ? 'suspended' : 'active' })}
                  className="h-8 px-3 text-xs rounded-md border border-line hover:bg-surface-alt"
                >{active ? 'Suspend' : 'Activate'}</button>
              </div>
            );
          })}
          {productKeys.length === 0 && <p className="p-3 text-sm text-ink-muted italic">No products defined.</p>}
        </div>
      </div>
    </Modal>
  );
}

export default function OperatorOrgsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [cursors, setCursors] = useState<string[]>([]); // cursor stack; top = current page
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<OperatorOrg | null>(null);
  const [confirm, setConfirm] = useState<{ org: OperatorOrg; action: 'suspend' | 'reactivate' | 'close' } | null>(null);
  const { data, isLoading, isError } = useOrgs({ search: search || undefined, status: status || undefined, cursor: cursors[cursors.length - 1], limit: LIMIT });
  const action = useOrgAction();
  const canWrite = useOperatorCan('tenants.write');
  const canClose = useOperatorCan('tenants.close');
  const canEntitle = useOperatorCan('entitlements.write');
  const orgs = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Organizations</h1>
        {canWrite && <button onClick={() => setCreating(true)} className="h-9 px-4 bg-primary text-white text-sm rounded-md">Create organization</button>}
      </div>
      <div className="flex gap-2">
        <input className={inputCls + ' max-w-xs'} placeholder="Search..." value={search} onChange={(e) => { setSearch(e.target.value); setCursors([]); }} />
        <select className={inputCls + ' max-w-[10rem]'} value={status} onChange={(e) => { setStatus(e.target.value); setCursors([]); }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <div className="bg-surface border border-line rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-ink-muted text-xs uppercase">
            <tr>
              <th className="text-left p-3">Name</th><th className="text-left p-3">Status</th><th className="text-left p-3">Members</th>
              <th className="text-left p-3">Products</th><th className="text-left p-3">Last activity</th><th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {isLoading && <tr><td colSpan={6} className="p-6 text-center text-ink-muted">Loading...</td></tr>}
            {isError && <tr><td colSpan={6} className="p-6 text-center text-error">Failed to load organizations.</td></tr>}
            {orgs.map((o) => (
              <tr key={idOf(o)}>
                <td className="p-3"><p className="font-medium">{o.name}</p><p className="text-xs text-ink-muted">{o.slug}</p></td>
                <td className="p-3">{o.status}</td>
                <td className="p-3">{o.members_count ?? '-'}</td>
                <td className="p-3 text-xs">{(o.entitlements ?? []).map((e) => `${e.product_key}:${e.status}`).join(', ') || '-'}</td>
                <td className="p-3 text-xs">{o.last_activity ? new Date(o.last_activity).toLocaleString() : '-'}</td>
                <td className="p-3 text-right space-x-2 whitespace-nowrap">
                  {canEntitle && <button onClick={() => setEditing(o)} className="text-xs px-2 h-7 border border-line rounded-md hover:bg-surface-alt">Entitlements</button>}
                  {canWrite && o.status === 'active' && <button onClick={() => setConfirm({ org: o, action: 'suspend' })} className="text-xs px-2 h-7 border border-line rounded-md hover:bg-surface-alt">Suspend</button>}
                  {canWrite && o.status === 'suspended' && <button onClick={() => setConfirm({ org: o, action: 'reactivate' })} className="text-xs px-2 h-7 border border-line rounded-md hover:bg-surface-alt">Reactivate</button>}
                  {canClose && o.status !== 'closed' && <button onClick={() => setConfirm({ org: o, action: 'close' })} className="text-xs px-2 h-7 border border-error/30 text-error rounded-md hover:bg-error/5">Close</button>}
                </td>
              </tr>
            ))}
            {!isLoading && !isError && orgs.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-ink-muted italic">No organizations.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2 text-sm">
        <button disabled={cursors.length === 0} onClick={() => setCursors(cursors.slice(0, -1))} className="h-8 px-3 border border-line rounded-md disabled:opacity-50">Prev</button>
        <button disabled={!data?.next_cursor} onClick={() => data?.next_cursor && setCursors([...cursors, data.next_cursor])} className="h-8 px-3 border border-line rounded-md disabled:opacity-50">Next</button>
      </div>

      {creating && <CreateOrgDialog onClose={() => setCreating(false)} />}
      {editing && <EntitlementsDialog org={editing} onClose={() => setEditing(null)} />}
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
    </div>
  );
}
