import { useAppRoles } from './productAccess';

interface Props {
  appId: string;
  /** Shown in the label, so the field reads as the product's own role ("Zyntrus role"), not an organisation role. */
  appName?: string;
  roleKey: string;
  includeDescendants: boolean;
  onRoleChange: (key: string) => void;
  onIncludeDescendantsChange: (v: boolean) => void;
  showDescendants?: boolean;
}

/** Product role selector + include-descendants toggle for karbexa_product assignments. */
export const ProductRoleFields: React.FC<Props> = ({ appId, appName, roleKey, includeDescendants, onRoleChange, onIncludeDescendantsChange, showDescendants = true }) => {
  const { data: roles, isLoading } = useAppRoles(appId);
  const assignable = (roles ?? []).filter((r) => r.assignable);
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="product-role-select" className="block text-xs font-bold text-ink-secondary uppercase tracking-wider mb-1.5">{appName ? `${appName} role` : 'Product role'}</label>
        <select
          id="product-role-select"
          value={roleKey}
          onChange={(e) => onRoleChange(e.target.value)}
          disabled={isLoading}
          className="w-full h-9 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600"
        >
          <option value="">{isLoading ? 'Loading roles...' : 'Default role'}</option>
          {assignable.map((r) => (
            <option key={r.key} value={r.key}>{r.name}{r.is_default ? ' (default)' : ''}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-secondary">What the people selected above can do {appName ? `in ${appName}` : 'in this product'}.</p>
      </div>
      {showDescendants && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={includeDescendants} onChange={(e) => onIncludeDescendantsChange(e.target.checked)} />
          Include descendants (sub-departments / child groups)
        </label>
      )}
    </div>
  );
};
