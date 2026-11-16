import { Link } from 'react-router-dom';
import { DashboardPage } from '@/components/templates/DashboardPage';
import { SectionBoundary } from '@/components/ui/SectionBoundary';
import { useOperatorCan, useRevokeOperatorSession, useSecurity, type OverviewBlock } from '@/features/operator/operatorApi';

const failed = <T,>(b: OverviewBlock<T> | undefined): b is { error: true } => !!b && typeof b === 'object' && 'error' in b;
const ok = <T,>(b: OverviewBlock<T> | undefined): T | null => (b === undefined || failed(b) ? null : (b as T));
const when = (v?: string | null) => (v ? new Date(v).toLocaleString() : '-');

export default function OperatorSecurityPage() {
  const q = useSecurity();
  const revoke = useRevokeOperatorSession();
  const canRevoke = useOperatorCan('operators.write');
  const d = q.data;
  const noMfa = ok(d?.operators_without_mfa);
  const fails = ok(d?.failed_sign_ins);
  const locked = ok(d?.locked_accounts);
  const sessions = ok(d?.active_sessions);
  const tenants = ok(d?.tenants_without_mfa);
  const roles = ok(d?.recent_role_changes);
  const bad = (b: unknown) => !!d && failed(b as OverviewBlock<unknown>);
  const section = (title: string, b: unknown, empty: boolean, emptyText: string, children: React.ReactNode) => (
    <SectionBoundary title={title} isLoading={q.isLoading} isError={q.isError || bad(b)} onRetry={() => q.refetch()} isEmpty={empty} emptyText={emptyText}>{children}</SectionBoundary>
  );

  return (
    <DashboardPage
      title="Security"
      subtitle="Operator accounts, sign-in failures and sessions."
      tiles={[
        { id: 'nomfa', label: 'Operators without MFA', value: noMfa?.length ?? '-', tone: noMfa?.length ? 'warning' : 'neutral' },
        { id: 'fails', label: 'Failed sign-ins (24 h)', value: fails?.count ?? '-', tone: fails?.count ? 'warning' : 'neutral' },
        { id: 'locked', label: 'Locked accounts', value: locked?.length ?? '-', tone: locked?.length ? 'error' : 'neutral' },
        { id: 'sessions', label: 'Active sessions', value: sessions?.length ?? '-' },
      ]}
      sections={[
        {
          id: 'nomfa', span: 6,
          node: section('Operators without verified MFA', d?.operators_without_mfa, !!noMfa && noMfa.length === 0, 'Every active operator has MFA.',
            <ul className="divide-y divide-line">{(noMfa ?? []).map((o) => <li key={o.id} className="py-1.5 text-body text-ink">{o.full_name} <span className="text-ink-muted">{o.email}</span></li>)}</ul>),
        },
        {
          id: 'locked', span: 6,
          node: section('Locked accounts', d?.locked_accounts, !!locked && locked.length === 0, 'No account is locked.',
            <ul className="divide-y divide-line">{(locked ?? []).map((o) => <li key={o.id} className="py-1.5 text-body text-ink">{o.email} <span className="text-ink-muted">until {when(o.locked_until)}</span></li>)}</ul>),
        },
        {
          id: 'sessions', span: 12,
          node: section('Active operator sessions', d?.active_sessions, !!sessions && sessions.length === 0, 'No active sessions.',
            <table className="w-full text-table">
              <thead className="text-left text-label uppercase text-ink-muted"><tr><th className="py-1">Operator</th><th>IP</th><th>Signed in</th><th>Last seen</th><th /></tr></thead>
              <tbody className="divide-y divide-line">
                {(sessions ?? []).map((s) => (
                  <tr key={s.id}>
                    <td className="py-1.5">{s.operator_email ?? s.operator_id}</td><td>{s.ip ?? '-'}</td><td>{when(s.created_at)}</td><td>{when(s.last_seen_at)}</td>
                    <td className="text-right">{canRevoke && <button type="button" disabled={revoke.isPending} onClick={() => revoke.mutate({ operatorId: s.operator_id, sid: s.id })} className="text-primary hover:underline">Revoke</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>),
        },
        {
          id: 'fails', span: 6,
          node: section('Recent failed sign-ins', d?.failed_sign_ins, !!fails && fails.recent.length === 0, 'No failed sign-ins in the last 24 hours.',
            <ul className="divide-y divide-line">{(fails?.recent ?? []).map((e, i) => <li key={i} className="py-1.5 text-body text-ink">{e.email ?? 'unknown'} <span className="text-ink-muted">{e.event_type.replace(/_/g, ' ')} from {e.ip ?? '-'} at {when(e.at)}</span></li>)}</ul>),
        },
        {
          id: 'roles', span: 6,
          node: section('Recent operator role changes', d?.recent_role_changes, !!roles && roles.length === 0, 'No role changes recorded.',
            <ul className="divide-y divide-line">{(roles ?? []).map((r) => <li key={r.id} className="py-1.5 text-body text-ink">{r.action} <span className="text-ink-muted">by {r.by} at {when(r.at)}</span></li>)}</ul>),
        },
        {
          id: 'tenants', span: 12,
          node: section('Organizations whose admins have no MFA', d?.tenants_without_mfa, !!tenants && tenants.length === 0, 'Every organization admin has MFA.',
            <ul className="divide-y divide-line">{(tenants ?? []).map((t, i) => <li key={t.company_id ?? i} className="flex justify-between py-1.5 text-body text-ink"><span>{t.summary}</span><Link to={t.link.replace(/\?.*$/, '')} className="text-primary hover:underline">Open</Link></li>)}</ul>),
        },
      ]}
    />
  );
}
