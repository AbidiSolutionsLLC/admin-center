import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { DataTable } from '@/components/ui/DataTable';
import { KeyFacts } from '@/components/ui/KeyFacts';
import { CopyField } from '@/components/ui/CopyField';
import { Button } from '@/components/ui/button';
import { ListPage } from '@/components/templates/ListPage';
import { useUrlParam } from '@/hooks/useUrlParam';
import {
  AUDIT_CATEGORIES, downloadAuditCsv, errMsg, idOf, useOperatorAudit, useOperatorCan, useOperators,
  type AuditEntry, type AuditFilters,
} from '@/features/operator/operatorApi';

const LIMIT = 50;

const when = (v?: string) => (v ? new Date(v).toLocaleString() : '-');
const json = (v: unknown) => (v === null || v === undefined ? 'None' : JSON.stringify(v, null, 2));
const fieldCls =
  'h-9 rounded-control border border-line bg-surface px-2 text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

export default function OperatorAuditPage() {
  const [action] = useUrlParam('action');
  const [category, setCategory] = useUrlParam('category');
  const [operatorId, setOperatorId] = useUrlParam('operator');
  const [from, setFrom] = useUrlParam('from');
  const [to, setTo] = useUrlParam('to');
  const [entryId, setEntryId] = useUrlParam('entry');
  const canExport = useOperatorCan('audit.export');
  const canSeeOperators = useOperatorCan('operators.read');
  const operators = useOperators({ enabled: canSeeOperators }).data ?? [];
  const [exporting, setExporting] = useState(false);

  const filters: AuditFilters = {
    action: action || undefined,
    category: category || undefined,
    operator_id: operatorId || undefined,
    // Date inputs are local days: `from` is the start of that day, `to` its end.
    from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
  };
  const filtered = Object.values(filters).some(Boolean);

  // Cursor stack, reset whenever any filter changes.
  const filterKey = JSON.stringify(filters);
  const [paging, setPaging] = useState<{ forKey: string; cursors: string[] }>({ forKey: filterKey, cursors: [] });
  const cursors = paging.forKey === filterKey ? paging.cursors : [];

  const { data, isLoading, isError, isFetching, refetch } = useOperatorAudit({
    cursor: cursors[cursors.length - 1],
    limit: LIMIT,
    ...filters,
  });
  const rows = data?.data ?? [];
  const selected = rows.find((r) => idOf(r) === entryId);

  const columns = useMemo<ColumnDef<AuditEntry>[]>(
    () => [
      { header: 'When', id: 'when', cell: ({ row }) => <span className="whitespace-nowrap text-table">{when(row.original.created_at)}</span> },
      { header: 'Actor', id: 'actor', cell: ({ row }) => row.original.operator_email ?? '-' },
      { header: 'Category', id: 'category', cell: ({ row }) => row.original.category ?? '-' },
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

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadAuditCsv(filters);
    } catch (e) {
      toast.error(errMsg(e, 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <ListPage
      title="Audit"
      subtitle="Every action taken in the operator console."
      toolbar={{
        search: { urlKey: 'action', placeholder: 'Filter by exact action' },
        filters: (
          <>
            <select aria-label="Category" className={fieldCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {AUDIT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {canSeeOperators && (
              <select aria-label="Operator" className={fieldCls} value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
                <option value="">All operators</option>
                {operators.map((o) => (
                  <option key={idOf(o)} value={idOf(o)}>{o.email}</option>
                ))}
              </select>
            )}
            <input aria-label="From date" type="date" className={fieldCls} value={from} onChange={(e) => setFrom(e.target.value)} />
            <input aria-label="To date" type="date" className={fieldCls} value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        ),
        actions: canExport ? (
          <Button variant="outline" disabled={exporting} onClick={exportCsv}>Export CSV</Button>
        ) : undefined,
      }}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isEmpty={!isLoading && !isError && rows.length === 0 && cursors.length === 0}
      emptyTitle={filtered ? 'No entries match these filters' : 'No audit entries yet'}
      emptyDescription={filtered ? 'Change or clear the filters. The action filter matches exactly.' : 'Operator actions appear here as they happen.'}
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
                { label: 'Category', value: selected.category ?? '-' },
                { label: 'Result', value: selected.result ?? '-' },
                { label: 'Reason', value: selected.reason ?? '-' },
              ]}
            />
            {selected.correlation_id && <CopyField label="Correlation id" value={selected.correlation_id} />}
            {([['Before', selected.before], ['After', selected.after], ['Details', selected.details]] as const).map(([label, value]) => (
              <div key={label}>
                <h3 className="mb-1 text-label uppercase text-ink-muted">{label}</h3>
                <pre className="max-h-72 overflow-auto rounded-control border border-line bg-surface p-3 font-mono text-table text-ink">{json(value)}</pre>
              </div>
            ))}
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
          onNext: () => data?.next_cursor && setPaging({ forKey: filterKey, cursors: [...cursors, data.next_cursor] }),
          onPrev: () => setPaging({ forKey: filterKey, cursors: cursors.slice(0, -1) }),
        }}
      />
    </ListPage>
  );
}
