import { DashboardPage } from '@/components/templates/DashboardPage';
import { SectionBoundary } from '@/components/ui/SectionBoundary';
import { HealthPill } from '@/components/ui/HealthPill';
import { Timeline } from '@/components/ui/Timeline';
import { useHealth, useHealthSync, type HealthComponent } from '@/features/operator/operatorApi';

const LABELS: Record<string, string> = {
  admin_api: 'Admin API', database: 'Database', identity: 'Sign-in service', event_dispatcher: 'Event dispatcher',
  products_api: 'Products API', products_worker: 'Products worker', email: 'E-mail', jobs: 'Background jobs',
  standalone_portals: 'Standalone portals',
};
const when = (v?: string | null) => (v ? new Date(v).toLocaleString() : 'never');

function ComponentCard({ c }: { c: HealthComponent }) {
  return (
    <li className="rounded-card border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body font-medium text-ink">{LABELS[c.component] ?? c.component}</span>
        <HealthPill health={c.state} />
      </div>
      <p className="mt-1 text-table text-ink-secondary">{c.detail}</p>
      <p className="mt-1 text-label text-ink-muted">Checked {when(c.checked_at)}</p>
    </li>
  );
}

export default function OperatorHealthPage() {
  const health = useHealth();
  const sync = useHealthSync();
  const data = health.data;
  const count = (s: string) => data?.components.filter((c) => c.state === s).length ?? 0;
  const rows = sync.data?.rows ?? [];
  const attention = count('degraded') + count('unknown');

  return (
    <DashboardPage
      title="Platform health"
      subtitle="What the platform itself is doing. Checked every minute."
      status={data && <HealthPill health={data.state} />}
      tiles={[
        { id: 'healthy', label: 'Healthy', value: count('healthy') },
        { id: 'degraded', label: 'Degraded or unknown', value: attention, tone: attention ? 'warning' : 'neutral' },
        { id: 'critical', label: 'Critical', value: count('critical'), tone: count('critical') ? 'error' : 'neutral' },
        { id: 'checked', label: 'Checks', value: data?.stale ? 'Stale' : 'Running', sub: data?.stale ? 'No result in the last 3 minutes' : undefined, tone: data?.stale ? 'warning' : 'success' },
      ]}
      sections={[
        {
          id: 'components',
          span: 12,
          node: (
            <SectionBoundary title="Components" isLoading={health.isLoading} isError={health.isError} onRetry={() => health.refetch()}>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {(data?.components ?? []).map((c) => <ComponentCard key={c.component} c={c} />)}
              </ul>
            </SectionBoundary>
          ),
        },
        {
          id: 'history',
          span: 6,
          node: (
            <SectionBoundary
              title="Recent changes"
              isLoading={health.isLoading}
              isError={health.isError}
              onRetry={() => health.refetch()}
              isEmpty={(data?.history ?? []).length === 0}
              emptyText="No state changes in the last 7 days."
            >
              <Timeline items={(data?.history ?? []).map((h) => ({ id: h.id, actor: LABELS[h.component] ?? h.component, verb: `${h.from} to ${h.to}`, at: h.at, detail: h.detail }))} />
            </SectionBoundary>
          ),
        },
        {
          id: 'sync',
          span: 6,
          node: (
            <SectionBoundary
              title="Products sync by organization"
              isLoading={sync.isLoading}
              isError={sync.isError}
              onRetry={() => sync.refetch()}
              isEmpty={rows.length === 0}
              emptyText={sync.data && !sync.data.configured ? 'The products backend is not configured here.' : sync.data && !sync.data.answered ? 'The products backend did not answer.' : 'No organizations reported.'}
            >
              <table className="w-full text-table">
                <thead className="text-left text-label uppercase text-ink-muted">
                  <tr><th className="py-1">Organization</th><th>Lag</th><th>Parked</th><th>Last error</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.org_id}>
                      <td className="py-1.5">{r.name ?? r.org_id}</td>
                      <td className="tabular">{r.lag}</td>
                      <td className="tabular">{r.parked}</td>
                      <td>{r.last_error_code ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionBoundary>
          ),
        },
      ]}
    />
  );
}
