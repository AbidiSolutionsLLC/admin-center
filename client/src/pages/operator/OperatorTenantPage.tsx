import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ObjectPage } from '@/components/templates/ObjectPage';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tag } from '@/components/ui/Tag';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/Textarea';
import { FormField } from '@/components/ui/FormField';
import { Timeline } from '@/components/ui/Timeline';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ROUTES } from '@/constants/routes';
import {
  useAddNote, useApproveTenant, useChangeFirstAdmin, useDeleteNote, useOperatorAudit, useOperatorCan, useOperatorMe, useOrg,
  useOrgAdmins, useOrgIdps, useOrgNotes, useOrgOnboarding, useOrgProducts, usePatchOrg, useResendInvite,
  type OrgAdmin, type OrgProduct,
} from '@/features/operator/operatorApi';

const when = (v?: string | null) => (v ? new Date(v).toLocaleString() : '-');
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : '-');
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral' | 'error'> = {
  active: 'success', suspended: 'warning', closed: 'neutral', restricted: 'warning', not_entitled: 'neutral',
};

function SummaryTab({ id }: { id: string }) {
  const { data: org } = useOrg(id);
  const idps = useOrgIdps(id);
  const approve = useApproveTenant(id);
  const patch = usePatchOrg(id);
  const canWrite = useOperatorCan('tenants.write');
  const [tagText, setTagText] = useState('');
  const [trial, setTrial] = useState('');
  if (!org) return null;
  const addTag = () => {
    const t = tagText.trim();
    if (!t || (org.tags ?? []).includes(t)) return;
    patch.mutate({ tags: [...(org.tags ?? []), t] }, { onSuccess: () => setTagText('') });
  };
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-section text-ink">Tags</h2>
        <div className="flex flex-wrap items-center gap-2">
          {(org.tags ?? []).map((t) => (
            <Tag key={t} onRemove={canWrite ? () => patch.mutate({ tags: (org.tags ?? []).filter((x) => x !== t) }) : undefined}>{t}</Tag>
          ))}
          {(org.tags ?? []).length === 0 && <span className="text-body text-ink-muted">No tags</span>}
          {canWrite && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addTag(); }}>
              <Input aria-label="New tag" placeholder="Add a tag" maxLength={30} value={tagText} onChange={(e) => setTagText(e.target.value)} className="w-40" />
              <Button type="submit" variant="outline" disabled={!tagText.trim() || patch.isPending}>Add</Button>
            </form>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-section text-ink">Trial</h2>
        <p className="mb-2 text-body text-ink-secondary">
          {org.trial_ends_at ? `Trial ends ${day(org.trial_ends_at)}. Nothing is suspended automatically.` : 'Not on a trial.'}
        </p>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Trial end date" type="date" value={trial} onChange={(e) => setTrial(e.target.value)} className="w-44" />
            <Button variant="outline" disabled={!trial || patch.isPending} onClick={() => patch.mutate({ trial_ends_at: new Date(`${trial}T23:59:59`).toISOString() }, { onSuccess: () => setTrial('') })}>Set trial end</Button>
            {org.trial_ends_at && <Button variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ trial_ends_at: null })}>Clear trial</Button>}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-section text-ink">Identity providers</h2>
        {idps.isLoading ? (
          <p className="text-body text-ink-muted">Loading</p>
        ) : (idps.data ?? []).length === 0 ? (
          <p className="text-body text-ink-muted">This organization has no identity providers.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {(idps.data ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="text-body font-medium text-ink">{c.display_name} <span className="text-ink-muted">({c.type})</span></p>
                  <p className="text-table text-ink-muted">
                    {c.status}
                    {c.tenant_id && ` · Entra tenant ${c.tenant_id}`}
                    {c.tenant_approval && ` · approved ${when(c.tenant_approval.approved_at)}`}
                  </p>
                </div>
                {c.type === 'entra' && c.tenant_id && !c.tenant_approval && canWrite && (
                  <Button variant="outline" disabled={approve.isPending} onClick={() => approve.mutate(c.id)}>Approve tenant</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProductsTab({ id }: { id: string }) {
  const { data, isLoading, isError, refetch } = useOrgProducts(id);
  const columns: ColumnDef<OrgProduct>[] = [
    { header: 'Product', id: 'name', cell: ({ row }) => <span className="font-medium">{row.original.name ?? row.original.product_key}</span> },
    { header: 'State', id: 'state', cell: ({ row }) => <StatusBadge variant={STATUS_VARIANT[row.original.status] ?? 'neutral'}>{row.original.status.replace('_', ' ')}</StatusBadge> },
    { header: 'Source', id: 'source', cell: ({ row }) => (row.original.source === 'operator' ? 'Override' : row.original.source ?? '-') },
    { header: 'Plan', id: 'plan', cell: ({ row }) => row.original.plan_key ?? '-' },
    { header: 'Seat limit', id: 'seats', cell: ({ row }) => <span className="tabular">{row.original.seats_limit ?? 'No limit'}</span> },
  ];
  if (isError) return <EmptyState title="Could not load products" description="Try again." action={{ label: 'Retry', onClick: () => refetch() }} />;
  if (isLoading) return <p className="text-body text-ink-muted">Loading</p>;
  return <DataTable columns={columns} data={data ?? []} />;
}

function OnboardingTab({ id }: { id: string }) {
  const { data, isLoading } = useOrgOnboarding(id);
  const resend = useResendInvite(id);
  const change = useChangeFirstAdmin(id);
  const canResend = useOperatorCan('onboarding.write');
  const canWrite = useOperatorCan('tenants.write');
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  if (isLoading || !data) return <p className="text-body text-ink-muted">Loading</p>;
  const pending = data.first_admin?.lifecycle_state === 'invited';
  return (
    <div className="space-y-4">
      <p className="text-body text-ink">
        Stage: <StatusBadge variant={data.stage === 'complete' ? 'success' : data.stage === 'delivery_failed' || data.stage === 'expired' ? 'error' : 'warning'}>{data.stage.replace(/_/g, ' ')}</StatusBadge>
      </p>
      <dl className="grid grid-cols-1 gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-2">
        <div><dt className="text-label uppercase text-ink-muted">First admin</dt><dd className="text-body text-ink">{data.first_admin ? `${data.first_admin.full_name} (${data.first_admin.email})` : 'None'}</dd></div>
        <div><dt className="text-label uppercase text-ink-muted">Invitation</dt><dd className="text-body text-ink">{data.invitation ? `${data.invitation.state}, sent ${data.invitation.sent_count} time(s), expires ${when(data.invitation.expires_at)}` : 'None'}</dd></div>
        <div><dt className="text-label uppercase text-ink-muted">E-mail delivery</dt><dd className="text-body text-ink">{data.delivery ? `${data.delivery.status} (${data.delivery.attempts} attempt(s))` : '-'}</dd></div>
        <div><dt className="text-label uppercase text-ink-muted">Last delivery error</dt><dd className="text-body text-ink">{data.delivery?.last_error ?? '-'}</dd></div>
      </dl>
      {pending && (
        <div className="flex flex-wrap gap-2">
          {canResend && <Button disabled={resend.isPending} onClick={() => resend.mutate()}>Resend invitation</Button>}
          {canWrite && <Button variant="outline" onClick={() => { setEmail(data.first_admin?.email ?? ''); setName(data.first_admin?.full_name ?? ''); setEditing(true); }}>Change first admin</Button>}
        </div>
      )}
      {editing && (
        <form
          className="max-w-md space-y-3 rounded-card border border-line bg-surface p-4"
          onSubmit={(e) => { e.preventDefault(); change.mutate({ email, full_name: name }, { onSuccess: () => setEditing(false) }); }}
        >
          <FormField label="Full name" required>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</FormField>
          <FormField label="E-mail" hint="A new invitation is sent to this address." required>{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</FormField>
          <div className="flex gap-2">
            <Button type="submit" disabled={!email || !name || change.isPending}>Save</Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}

function AdminsTab({ id }: { id: string }) {
  const { data, isLoading, isError, refetch } = useOrgAdmins(id);
  const columns: ColumnDef<OrgAdmin>[] = [
    { header: 'Name', id: 'name', cell: ({ row }) => <div><p className="font-medium text-ink">{row.original.full_name}</p><p className="text-label text-ink-muted">{row.original.email}</p></div> },
    { header: 'Roles', id: 'roles', cell: ({ row }) => <span className="flex flex-wrap gap-1">{row.original.roles.map((r) => <Tag key={r}>{r}</Tag>)}</span> },
    { header: 'MFA', id: 'mfa', cell: ({ row }) => <StatusBadge variant={row.original.mfa_enabled ? 'success' : 'warning'}>{row.original.mfa_enabled ? 'On' : 'Off'}</StatusBadge> },
    { header: 'Last sign-in', id: 'last', cell: ({ row }) => when(row.original.last_login_at) },
    { header: 'Status', id: 'status', cell: ({ row }) => row.original.status },
  ];
  if (isError) return <EmptyState title="Could not load admins" description="Try again." action={{ label: 'Retry', onClick: () => refetch() }} />;
  if (isLoading) return <p className="text-body text-ink-muted">Loading</p>;
  return <DataTable columns={columns} data={data ?? []} />;
}

function ActivityTab({ id }: { id: string }) {
  const { data, isLoading } = useOperatorAudit({ company_id: id, limit: 50 });
  if (isLoading) return <p className="text-body text-ink-muted">Loading</p>;
  const rows = data?.data ?? [];
  if (rows.length === 0) return <EmptyState title="No operator activity" description="Actions taken on this organization appear here." />;
  return (
    <Timeline
      items={rows.map((r) => ({ id: (r.id ?? r._id) as string, actor: r.operator_email ?? 'operator', verb: r.action, at: r.created_at ?? '', detail: r.reason ?? undefined }))}
    />
  );
}

function NotesTab({ id }: { id: string }) {
  const { data, isLoading } = useOrgNotes(id);
  const { data: me } = useOperatorMe();
  const add = useAddNote(id);
  const del = useDeleteNote(id);
  const canWrite = useOperatorCan('notes.write');
  const canDeleteAny = useOperatorCan('tenants.write');
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <div className="max-w-2xl space-y-4">
      {canWrite && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); add.mutate(text.trim(), { onSuccess: () => setText('') }); }}>
          <FormField label="Add a note" hint="Internal. Never shown to the organization.">
            {(p) => <Textarea {...p} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />}
          </FormField>
          <Button type="submit" disabled={!text.trim() || add.isPending}>Add note</Button>
        </form>
      )}
      {isLoading ? (
        <p className="text-body text-ink-muted">Loading</p>
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="No notes yet" description="Notes about this organization appear here." />
      ) : (
        <ul className="space-y-3">
          {(data ?? []).map((n) => (
            <li key={n.id} className="rounded-card border border-line bg-surface p-3">
              <p className="whitespace-pre-wrap text-body text-ink">{n.body}</p>
              <div className="mt-2 flex items-center justify-between text-table text-ink-muted">
                <span>{n.operator_email} · {when(n.created_at)}</span>
                {canWrite && (n.operator_id === me?.id || canDeleteAny) && <Button variant="outline" size="sm" onClick={() => setConfirm(n.id)}>Delete</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete this note?"
        description="The deletion is recorded in the audit log."
        confirmLabel="Delete"
        variant="danger"
        isLoading={del.isPending}
        onConfirm={() => confirm && del.mutate(confirm, { onSettled: () => setConfirm(null) })}
      />
    </div>
  );
}

export default function OperatorTenantPage() {
  const { id = '' } = useParams();
  const { data: org, isLoading, isError, error, refetch } = useOrg(id);
  const canAudit = useOperatorCan('audit.read');
  const notFound = (error as { response?: { status?: number } } | null)?.response?.status === 404;

  const tabs = [
    { value: 'summary', label: 'Summary', content: <SummaryTab id={id} /> },
    { value: 'products', label: 'Products', content: <ProductsTab id={id} /> },
    { value: 'onboarding', label: 'Onboarding', content: <OnboardingTab id={id} /> },
    { value: 'admins', label: 'Admins', content: <AdminsTab id={id} /> },
    ...(canAudit ? [{ value: 'activity', label: 'Activity', content: <ActivityTab id={id} /> }] : []),
    { value: 'notes', label: 'Notes', content: <NotesTab id={id} /> },
  ];

  return (
    <ObjectPage
      title={org?.name ?? ''}
      subtitle={org?.slug}
      breadcrumbs={[{ label: 'Organizations', href: ROUTES.OPERATOR_ORGS }, { label: org?.name ?? 'Organization' }]}
      status={org && <StatusBadge variant={STATUS_VARIANT[org.status] ?? 'neutral'}>{org.status}</StatusBadge>}
      facts={org && [
        { label: 'Plan', value: org.plan_key ?? '-' },
        { label: 'Members', value: `${org.members_active ?? 0} active / ${org.members_total ?? 0}` },
        { label: 'Last activity', value: when(org.last_activity_at) },
        { label: 'First admin', value: org.first_admin ? `${org.first_admin.full_name} (${org.first_admin.lifecycle_state})` : '-' },
      ]}
      tabs={tabs}
      isLoading={isLoading}
      isError={isError && !notFound}
      notFound={notFound}
      onRetry={() => refetch()}
    />
  );
}
