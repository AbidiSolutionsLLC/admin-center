import { useSubscription } from '@/features/apps/productAccess';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';

export default function SubscriptionPage() {
  const { data, isLoading, isError, refetch } = useSubscription();
  if (isLoading) return <TableSkeleton rows={3} columns={3} />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const rows = data?.entitlements ?? [];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Subscription</h1>
        <p className="text-sm text-ink-muted">Products your organization is entitled to. Contact Karbexa to change your plan.</p>
      </div>
      <div className="bg-surface border border-line rounded-lg shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-ink-muted text-xs uppercase">
            <tr><th className="text-left p-3">Product</th><th className="text-left p-3">Status</th><th className="text-left p-3">Seats limit</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((e) => (
              <tr key={e.product_key}>
                <td className="p-3 font-medium text-ink">{e.product_key}</td>
                <td className="p-3">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${e.status === 'active' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{e.status.toUpperCase()}</span>
                </td>
                <td className="p-3 text-ink-secondary">{e.seats_limit ?? 'Unlimited'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-ink-muted italic">No entitlements.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
