import { PageHeader } from '@/components/ui/PageHeader';
import { PageStates } from '@/components/templates/PageStates';
import { StatTile } from '@/components/ui/StatTile';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SeatMeter } from '@/components/ui/SeatMeter';
import { useSubscription } from '@/features/apps/productAccess';

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const DAY = 86_400_000;

/** Subscription (elevation 5.5): read-only plan, products, seats and trial, as set by the operator. */
export default function SubscriptionPage() {
  const { data, isLoading, isError, refetch } = useSubscription();
  const products = data?.products ?? [];
  const entitlements = new Map((data?.entitlements ?? []).map((e) => [e.product_key, e]));
  const active = products.filter((p) => p.entitled).length;

  const trialEnd = data?.trial_ends_at ?? null;
  const daysLeft = trialEnd ? Math.ceil((new Date(trialEnd).getTime() - Date.now()) / DAY) : null;
  const trialValue = !trialEnd ? 'None' : daysLeft !== null && daysLeft < 0 ? 'Ended' : fmt(trialEnd);
  const trialSub = !trialEnd ? undefined : daysLeft !== null && daysLeft < 0 ? `Ended ${fmt(trialEnd)}` : `${daysLeft} day(s) left`;

  return (
    <div>
      <PageHeader title="Subscription" subtitle="Your plan, products and seats. Contact Karbexa to change them." />
      <PageStates isLoading={isLoading} isError={isError} onRetry={() => refetch()} isEmpty={!isLoading && products.length === 0} emptyTitle="No products" emptyDescription="Your organisation has no products yet.">
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="subscription-tiles">
          <StatTile label="Plan" value={data?.plan?.name ?? 'Custom'} sub={data?.plan ? undefined : 'No plan applied'} />
          <StatTile label="Products" value={`${active} of ${products.length}`} sub="active" />
          <StatTile label="Trial ends" value={trialValue} sub={trialSub} tone={daysLeft !== null && daysLeft <= 7 ? 'warning' : 'neutral'} />
        </div>
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <table className="w-full text-table">
            <thead className="bg-surface-alt text-label uppercase text-ink-muted">
              <tr>
                <th className="p-3 text-left">Product</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Source</th>
                <th className="p-3 text-left w-64">Seats</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((p) => {
                const e = entitlements.get(p.product_key);
                const source = !e ? '-' : e.source === 'operator' ? 'Override' : e.source === 'plan' ? `Plan${e.plan_key ? ` (${e.plan_key})` : ''}` : 'Included';
                return (
                  <tr key={p.product_key} data-testid={`sub-row-${p.product_key}`}>
                    <td className="p-3 font-medium text-ink">{p.name}</td>
                    <td className="p-3">
                      <StatusBadge variant={p.entitled ? 'success' : e ? 'warning' : 'neutral'}>
                        {p.entitled ? 'Active' : e ? e.status.charAt(0).toUpperCase() + e.status.slice(1) : 'Not included'}
                      </StatusBadge>
                    </td>
                    <td className="p-3 text-ink-secondary">
                      {source}
                      {e?.source === 'operator' && e.expires_at ? `, until ${fmt(e.expires_at)}` : ''}
                    </td>
                    <td className="p-3">{p.entitled ? <SeatMeter used={p.seats_used} total={p.seats_limit} label="" /> : <span className="text-ink-muted">-</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PageStates>
    </div>
  );
}
