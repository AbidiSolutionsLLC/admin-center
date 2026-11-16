import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/DataTable';
import { KeyFacts } from '@/components/ui/KeyFacts';
import { CopyField } from '@/components/ui/CopyField';
import { ListPage } from '@/components/templates/ListPage';
import { useUrlParam } from '@/hooks/useUrlParam';
import { idOf, useOperatorAudit, type AuditEntry } from '@/features/operator/operatorApi';

const LIMIT = 50;

const when = (v?: string) => (v ? new Date(v).toLocaleString() : '-');

export default function OperatorAuditPage() {
  const [action] = useUrlParam('action');
  const [entryId, setEntryId] = useUrlParam('entry');
  // Cursor stack, reset whenever the action filter changes.
  const [paging, setPaging] = useState<{ forAction: string; cursors: string[] }>({ forAction: action, cursors: [] });
  const cursors = paging.forAction === action ? paging.cursors : [];

  const { data, isLoading, isError, isFetching, refetch } = useOperatorAudit({
    cursor: cursors[cursors.length - 1],
    limit: LIMIT,
    action: action || undefined,
  });
  const rows = data?.data ?? [];
  const selected = rows.find((r) => idOf(r) === entryId);

  const columns = useMemo<ColumnDef<AuditEntry>[]>(
    () => [
      { header: 'When', id: 'when', cell: ({ row }) => <span className="whitespace-nowrap text-table">{when(row.original.created_at)}</span> },
      { header: 'Actor', id: 'actor', cell: ({ row }) => row.original.operator_email ?? '-' },
      { header: 'Action', accessorKey: 'action' },
      {
        header: 'Target',
        id: 'target',
        cell: ({ row }) => (
          <span className="text-table">{[row.original.target_type, row.original.target_id].filter(Boolean).join(': ') || '-'}</span>
        ),
      },
    ],
    []
  );

  return (
    <ListPage
      title="Audit"
      subtitle="Every action taken in the operator console."
      toolbar={{ search: { urlKey: 'action', placeholder: 'Filter by exact action' } }}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isEmpty={!isLoading && !isError && rows.length === 0 && cursors.length === 0}
      emptyTitle={action ? 'No entries for this action' : 'No audit entries yet'}
      emptyDescription={action ? 'Check the action name; the filter matches it exactly.' : 'Operator actions appear here as they happen.'}
      drawer={{
        isOpen: !!selected,
        onClose: () => setEntryId(''),
        title: selected?.action ?? 'Audit entry',
        description: selected ? when(selected.created_at) : undefined,
        size: 'lg',
        content: selected && (
          <div className="space-y-4">
            <KeyFacts
              columns={2}
              items={[
                { label: 'Actor', value: selected.operator_email ?? '-' },
                { label: 'Action', value: selected.action },
                { label: 'Target', value: [selected.target_type, selected.target_id].filter(Boolean).join(': ') || '-' },
                { label: 'Organization', value: selected.company_id ?? '-' },
              ]}
            />
            {selected.correlation_id && <CopyField label="Correlation id" value={selected.correlation_id} />}
            <div>
              <h3 className="mb-1 text-label uppercase text-ink-muted">Details</h3>
              <pre className="max-h-96 overflow-auto rounded-control border border-line bg-surface p-3 font-mono text-table text-ink">
                {selected.details ? JSON.stringify(selected.details, null, 2) : 'None'}
              </pre>
            </div>
          </div>
        ),
      }}
    >
      <DataTable
        columns={columns}
        data={rows}
        onRowClick={(r) => setEntryId(idOf(r))}
        stickyHeader
        paging={{
          hasNext: !!data?.next_cursor,
          hasPrev: cursors.length > 0,
          isLoading: isFetching,
          onNext: () => data?.next_cursor && setPaging({ forAction: action, cursors: [...cursors, data.next_cursor] }),
          onPrev: () => setPaging({ forAction: action, cursors: cursors.slice(0, -1) }),
        }}
      />
    </ListPage>
  );
}
