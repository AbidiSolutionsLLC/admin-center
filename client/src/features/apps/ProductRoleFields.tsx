import { useAppRoles } from './productAccess';

interface Props {
  appId: string;
  roleKey: string;
  includeDescendants: boolean;
  onRoleChange: (key: string) => void;
  onIncludeDescendantsChange: (v: boolean) => void;
  showDescendants?: boolean;
}

/** Product role selector + include-descendants toggle for karbexa_product assignments. */
export const ProductRoleFields: React.FC<Props> = ({ appId, roleKey, includeDescendants, onRoleChange, onIncludeDescendantsChange, showDescendants = true }) => {
  const { data: roles, isLoading } = useAppRoles(appId);
  const assignable = (roles ?? []).filter((r) => r.assignable);
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">Product Role</label>
        <select
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
