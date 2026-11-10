import { useState } from 'react';
import { idOf, useOperatorAudit } from '@/features/operator/operatorApi';

const LIMIT = 50;

export default function OperatorAuditPage() {
  const [cursors, setCursors] = useState<string[]>([]);
  const { data, isLoading, isError } = useOperatorAudit({ cursor: cursors[cursors.length - 1], limit: LIMIT });
  const rows = data?.data ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Audit</h1>
      <div className="bg-surface border border-line rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-ink-muted text-xs uppercase">
            <tr><th className="text-left p-3">When</th><th className="text-left p-3">Actor</th><th className="text-left p-3">Action</th><th className="text-left p-3">Target</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {isLoading && <tr><td colSpan={4} className="p-6 text-center text-ink-muted">Loading...</td></tr>}
            {isError && <tr><td colSpan={4} className="p-6 text-center text-error">Failed to load audit log.</td></tr>}
            {rows.map((r, i) => (
              <tr key={idOf(r) ?? i}>
                <td className="p-3 text-xs whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                <td className="p-3">{r.actor_email ?? r.actor ?? '-'}</td>
                <td className="p-3">{r.action}</td>
                <td className="p-3 text-xs">{[r.target_type, r.target].filter(Boolean).join(': ') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2 text-sm">
        <button disabled={cursors.length === 0} onClick={() => setCursors(cursors.slice(0, -1))} className="h-8 px-3 border border-line rounded-md disabled:opacity-50">Prev</button>
        <button disabled={!data?.next_cursor} onClick={() => data?.next_cursor && setCursors([...cursors, data.next_cursor])} className="h-8 px-3 border border-line rounded-md disabled:opacity-50">Next</button>
      </div>
    </div>
  );
}
