import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { ListPage } from '@/components/templates/ListPage';
import { useUrlParam } from '@/hooks/useUrlParam';
import { ROUTES } from '@/constants/routes';
import { useOperatorCan, useOnboardingList, useResendInviteFor, type OnboardingRow } from '@/features/operator/operatorApi';

const LIMIT = 25;
const when = (v?: string | null) => (v ? new Date(v).toLocaleString() : '-');
const fieldCls =
  'h-9 rounded-control border border-line bg-surface px-2 text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

/** Stage words and how serious each is (CC-ON-1). */
const STAGES: Record<string, { label: string; variant: 'warning' | 'error' | 'info' | 'neutral' }> = {
  no_first_admin: { label: 'No first admin', variant: 'error' },
  no_invitation: { label: 'No invitation', variant: 'error' },
  sending: { label: 'Sending', variant: 'info' },
  delivery_failed: { label: 'Delivery failed', variant: 'error' },
  awaiting_acceptance: { label: 'Awaiting acceptance', variant: 'warning' },
  expired: { label: 'Invitation expired', variant: 'error' },
  revoked: { label: 'Invitation revoked', variant: 'warning' },
};
// Stages where sending the invitation again makes sense.
const RESENDABLE = new Set(['no_invitation', 'delivery_failed', 'awaiting_acceptance', 'expired', 'revoked']);

export default function OperatorOnboardingPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useUrlParam('stage');
  const [cursors, setCursors] = useState<string[]>([]); // cursor stack; top = current page
  const canResend = useOperatorCan('onboarding.write');
  const resend = useResendInviteFor();
  const { data, isLoading, isError, isFetching, refetch } = useOnboardingList({ cursor: cursors[cursors.length - 1], limit: LIMIT });
  // The server returns every organization that is not fully onboarded; the stage filter narrows the page being shown.
  const rows = (data?.data ?? []).filter((r) => !stage || r.stage === stage);

  const columns = useMemo<ColumnDef<OnboardingRow>[]>(
    () => [
      {
        header: 'Organization',
        id: 'org',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.organization.name}</p>
            <p className="text-label text-ink-muted">{row.original.organization.slug}</p>
          </div>
        ),
      },
      {
        header: 'Stage',
        id: 'stage',
        cell: ({ row }) => {
          const s = STAGES[row.original.stage] ?? { label: row.original.stage, variant: 'neutral' as const };
          return <StatusBadge variant={s.variant}>{s.label}</StatusBadge>;
        },
      },
      { header: 'First admin', id: 'admin', cell: ({ row }) => row.original.first_admin?.email ?? '-' },
      { header: 'Invitation sent', id: 'sent', cell: ({ row }) => <span className="whitespace-nowrap text-table">{when(row.original.invitation?.sent_at)}</span> },
      { header: 'Expires', id: 'expires', cell: ({ row }) => <span className="whitespace-nowrap text-table">{when(row.original.invitation?.expires_at)}</span> },
      {
        header: 'Last delivery error',
        id: 'error',
        cell: ({ row }) => <span className="text-table text-ink-secondary">{row.original.delivery?.last_error ?? '-'}</span>,
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) =>
          canResend && row.original.first_admin && RESENDABLE.has(row.original.stage) ? (
            <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
              <Button variant="outline" size="sm" disabled={resend.isPending} onClick={() => resend.mutate(row.original.organization.id)}>
                Resend invitation
              </Button>
            </div>
          ) : null,
      },
    ],
    [canResend, resend]
  );

  return (
    <ListPage
      title="Onboarding"
      subtitle="Organizations whose first admin has not finished setting up."
      toolbar={{
        filters: (
          <select aria-label="Stage" className={fieldCls} value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">All stages</option>
            {Object.entries(STAGES).map(([value, s]) => <option key={value} value={value}>{s.label}</option>)}
          </select>
        ),
      }}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isEmpty={!isLoading && !isError && rows.length === 0 && cursors.length === 0}
      emptyTitle={stage ? 'No organizations at this stage' : 'Nobody is waiting'}
      emptyDescription={stage ? 'Choose another stage, or clear the filter.' : 'Every organization has an active first admin.'}
    >
      <DataTable
        columns={columns}
        data={rows}
        onRowClick={(r) => navigate(`${ROUTES.OPERATOR_ORGS}/${r.organization.id}?tab=onboarding`)}
        stickyHeader
        paging={{
          hasNext: !!data?.next_cursor,
          hasPrev: cursors.length > 0,
          isLoading: isFetching,
          onNext: () => data?.next_cursor && setCursors([...cursors, data.next_cursor]),
          onPrev: () => setCursors(cursors.slice(0, -1)),
        }}
      />
    </ListPage>
  );
}
