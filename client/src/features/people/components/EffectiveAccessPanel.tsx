import { useEffectiveAccess } from '@/features/apps/productAccess';

export function EffectiveAccessPanel({ userId }: { userId: string }) {
  const { data, isLoading, isError } = useEffectiveAccess(userId);
  if (isLoading) return <div className="bg-white rounded-lg border border-line shadow-card p-6 h-24 animate-pulse" />;
  if (isError || !data) return <div className="bg-white rounded-lg border border-line shadow-card p-6 text-sm text-ink-muted">Effective access is unavailable.</div>;
  const products = Object.entries(data.products ?? {});
  const denials = Object.entries(data.denials ?? {});
  return (
    <div className="bg-white rounded-lg border border-line shadow-card p-6 space-y-4">
      {products.length === 0 && denials.length === 0 && <p className="text-sm text-ink-muted italic">No product access.</p>}
      {products.map(([key, p]) => (
        <div key={key} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
          <div>
            <p className="text-sm font-semibold text-ink">{key}</p>
            <p className="text-xs text-ink-muted">Role: {p.role_name || p.role}</p>
          </div>
          <span className="text-xs text-ink-secondary">{p.granted_by?.length ?? 0} granting assignment(s)</span>
        </div>
      ))}
      {denials.map(([key, reason]) => (
        <div key={key} className="flex items-center justify-between rounded-md bg-error/5 border border-error/10 px-3 py-2">
          <p className="text-sm font-semibold text-ink">{key}</p>
          <span className="text-xs text-error">{reason}</span>
        </div>
      ))}
      <p className="text-[11px] text-ink-muted">Authorization version: {data.authz_ver}</p>
    </div>
  );
}
