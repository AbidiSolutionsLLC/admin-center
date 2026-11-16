import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardPage } from '@/components/templates/DashboardPage';
import { SectionBoundary } from '@/components/ui/SectionBoundary';
import { HealthPill } from '@/components/ui/HealthPill';
import { Timeline } from '@/components/ui/Timeline';
import { ROUTES } from '@/constants/routes';
import { AnnouncementDialog } from './AnnouncementDialog';
import { useOperatorCan, useOverview, type OverviewBlock } from '@/features/operator/operatorApi';

const failed = <T,>(b: OverviewBlock<T> | undefined): b is { error: true } => !!b && typeof b === 'object' && 'error' in b;
const SEVERITY_TEXT = { critical: 'text-error', warning: 'text-warning', info: 'text-ink-secondary' } as const;

export default function OperatorOverviewPage() {
  const q = useOverview();
  const canAnnounce = useOperatorCan('announcements.write');
  const [announcing, setAnnouncing] = useState(false);
  const d = q.data;
  const tenants = d && !failed(d.tenants) ? d.tenants : null;
  const attention = d && !failed(d.attention) ? d.attention : null;
  const health = d && !failed(d.health) ? d.health : null;
  const activity = d && !failed(d.activity) ? d.activity : null;
  const members = d && !failed(d.members_active) ? d.members_active : null;
  const section = (title: string, bad: boolean, empty: boolean, emptyText: string, children: React.ReactNode) => (
    <SectionBoundary title={title} isLoading={q.isLoading} isError={q.isError || bad} onRetry={() => q.refetch()} isEmpty={empty} emptyText={emptyText}>{children}</SectionBoundary>
  );
  const blocked = (b: unknown) => !!d && failed(b as OverviewBlock<unknown>);

  return (
    <>
    <DashboardPage
      title="Overview"
      subtitle="What needs attention across the platform."
      status={health && <HealthPill health={health.state} />}
      primaryAction={canAnnounce ? <button type="button" onClick={() => setAnnouncing(true)} className="h-9 rounded-md border border-line px-4 text-sm">Announcement</button> : undefined}
      tiles={[
        { id: 'tenants', label: 'Organizations', value: tenants?.total ?? '-', sub: tenants ? `${tenants.active} active` : undefined, href: ROUTES.OPERATOR_ORGS },
        { id: 'trial', label: 'On trial', value: tenants?.trial ?? '-', sub: tenants ? `${tenants.suspended} suspended` : undefined, href: ROUTES.OPERATOR_ORGS },
        { id: 'onboarding', label: 'Onboarding', value: tenants?.onboarding ?? '-', href: ROUTES.OPERATOR_ONBOARDING },
        { id: 'members', label: 'Active members', value: members ?? '-' },
      ]}
      sections={[
        {
          id: 'attention', span: 8,
          node: section('Attention required', blocked(d?.attention), !!attention && attention.top.length === 0, 'Nothing needs attention.',
            <div>
              <p className="mb-2 text-table text-ink-secondary">
                {attention?.counts.critical ?? 0} critical, {attention?.counts.warning ?? 0} warning, {attention?.counts.info ?? 0} info
              </p>
              <ul className="divide-y divide-line">
                {(attention?.top ?? []).map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-body text-ink"><span className={`mr-2 text-label uppercase ${SEVERITY_TEXT[i.severity]}`}>{i.severity}</span>{i.summary}</span>
                    <Link to={i.link.replace(/\?.*$/, '')} className="shrink-0 text-primary hover:underline">Open</Link>
                  </li>
                ))}
              </ul>
            </div>),
        },
        {
          id: 'health', span: 4,
          node: section('Platform health', blocked(d?.health), false, '',
            <ul className="space-y-1.5">
              {(health?.components ?? []).map((c) => (
                <li key={c.component} className="flex items-center justify-between text-table"><span className="text-ink">{c.component.replace(/_/g, ' ')}</span><HealthPill health={c.state} /></li>
              ))}
              <li><Link to={ROUTES.OPERATOR_HEALTH} className="text-primary hover:underline">Details</Link></li>
            </ul>),
        },
        {
          id: 'activity', span: 12,
          node: section('Recent operator activity', blocked(d?.activity), !!activity && activity.length === 0, 'No operator activity yet.',
            <Timeline items={(activity ?? []).map((a) => ({ id: a.id, actor: a.operator_email, verb: a.action, target: a.target_type, at: a.at }))} />),
        },
      ]}
    />
    {announcing && <AnnouncementDialog onClose={() => setAnnouncing(false)} />}
    </>
  );
}
