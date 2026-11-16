// Effective access of one member: the role in each product and why (elevation 5.4 drill-in, 5.6 member profile).
import React from 'react';
import { useEffectiveAccess, DENIAL_TEXT, useSubscription } from './productAccess';
import { Tag } from '@/components/ui/Tag';

const TARGET_LABEL: Record<string, string> = {
  role: 'Org role', department: 'Department', group: 'Group', user: 'Direct', location: 'Location', attribute: 'Rule',
};

interface Props {
  memberId: string;
  /** Show only this product; omit for every product. */
  productKey?: string;
}

/** Answers "why does this person have this role?": the matching assignments per product, or the denial reason. */
export const EffectiveAccessPanel: React.FC<Props> = ({ memberId, productKey }) => {
  const { data: access, isLoading, isError } = useEffectiveAccess(memberId);
  const { data: subscription } = useSubscription();

  if (isLoading) return <p className="text-table text-ink-secondary" data-testid="access-loading">Loading access...</p>;
  if (isError || !access) return <p className="text-table text-error" data-testid="access-error">Access could not be loaded.</p>;

  const names = new Map((subscription?.products ?? []).map((p) => [p.product_key, p.name]));
  const keys = productKey
    ? [productKey]
    : [...new Set([...Object.keys(access.products), ...Object.keys(access.denials)])].sort();
  if (keys.length === 0) return <p className="text-table text-ink-secondary">No products.</p>;

  return (
    <ul className="space-y-3" data-testid="effective-access">
      {keys.map((pk) => {
        const granted = access.products[pk];
        const reasons = access.reasons?.[pk] ?? [];
        return (
          <li key={pk} className="rounded-card border border-line bg-surface p-3" data-testid={`access-${pk}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-body font-medium text-ink">{names.get(pk) ?? pk}</span>
              {granted ? <Tag tone="primary">{granted.role_name}</Tag> : <Tag>No access</Tag>}
            </div>
            {granted ? (
              <ul className="mt-2 space-y-1 text-table text-ink-secondary">
                {reasons.length === 0 && <li>Granted by an assignment that is no longer listed.</li>}
                {reasons.map((r) => (
                  <li key={r.assignment_id}>
                    <span className="text-ink">{TARGET_LABEL[r.target_type] ?? r.target_type}: {r.target_name}</span>
                    {' '}
                    {r.product_role_key ? `gives role ${r.product_role_key}` : 'gives the default role'}
                    {r.include_descendants ? ' (including sub-units)' : ''}
                  </li>
                ))}
                {reasons.length > 1 && <li>The highest role among these applies.</li>}
              </ul>
            ) : (
              <p className="mt-2 text-table text-ink-secondary">{DENIAL_TEXT[access.denials[pk]] ?? 'No access.'}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
};
