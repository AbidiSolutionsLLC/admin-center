// client/src/features/roles/PermissionMatrix.tsx
import { useState, useMemo } from 'react';
import { Check, Minus, X } from 'lucide-react';
import { Permission, ResolvedPermission, PermissionUpdate } from '@/types';

interface PermissionMatrixProps {
  permissions: Permission[];
  rolePermissions: ResolvedPermission[];
  onUpdate: (updates: PermissionUpdate[]) => void;
  isSaving?: boolean;
}

/**
 * PermissionMatrix Component
 * 
 * Displays a matrix of modules (rows) vs actions (columns) with checkboxes
 * to grant/deny permissions. Follows the design guidelines in admin-frontend-guidelines.md
 */
export const PermissionMatrix: React.FC<PermissionMatrixProps> = ({
  permissions,
  rolePermissions,
  onUpdate,
  isSaving = false,
}) => {
  const [localState, setLocalState] = useState<Map<string, boolean | null>>(new Map());

  // Group permissions by module
  const modules = useMemo(() => {
    const moduleSet = new Set(permissions.map((p) => p.module));
    return Array.from(moduleSet).sort();
  }, [permissions]);

  const actions = ['create', 'read', 'update', 'delete', 'export'];
  const dataScopes = ['own', 'department', 'all'];

  // Build a lookup map for role permissions
  const rolePermMap = useMemo(() => {
    const map = new Map<string, boolean>();
    rolePermissions.forEach((rp) => {
      const key = `${rp.module}:${rp.action}:${rp.data_scope}`;
      map.set(key, rp.granted);
    });
    return map;
  }, [rolePermissions]);

  // Get effective permission state (local change > role permission > null)
  const getEffectiveState = (module: string, action: string, scope: string): boolean | null => {
    const key = `${module}:${action}:${scope}`;
    if (localState.has(key)) {
      return localState.get(key)!;
    }
    return rolePermMap.get(key) ?? null;
  };

  // Handle cell click - cycle through null -> grant -> deny -> null
  const handleCellClick = (module: string, action: string, scope: string) => {
    const key = `${module}:${action}:${scope}`;
    const currentState = localState.get(key) ?? rolePermMap.get(key) ?? null;

    let newState: boolean | null;
    if (currentState === null) {
      newState = true; // Grant
    } else if (currentState === true) {
      newState = false; // Deny
    } else {
      newState = null; // Clear
    }

    setLocalState(new Map(localState).set(key, newState));
  };

  // Handle grant all for a module
  const handleGrantAll = (module: string) => {
    const newLocalState = new Map(localState);
    actions.forEach((action) => {
      dataScopes.forEach((scope) => {
        const key = `${module}:${action}:${scope}`;
        newLocalState.set(key, true);
      });
    });
    setLocalState(newLocalState);
  };

  // Handle clear all for a module
  const handleClearAll = (module: string) => {
    const newLocalState = new Map(localState);
    actions.forEach((action) => {
      dataScopes.forEach((scope) => {
        const key = `${module}:${action}:${scope}`;
        newLocalState.set(key, null);
      });
    });
    setLocalState(newLocalState);
  };

  // Save changes
  const handleSave = () => {
    const updates: PermissionUpdate[] = [];

    localState.forEach((granted, key) => {
      if (granted !== null) {
        const [permModule, permAction, permScope] = key.split(':');
        const permission = permissions.find(
          (p) =>
            p.module === permModule &&
            p.action === permAction &&
            p.data_scope === permScope
        );

        if (permission) {
          updates.push({
            permission_id: permission._id,
            granted,
          });
        }
      }
    });

    if (updates.length > 0) {
      onUpdate(updates);
      setLocalState(new Map());
    }
  };

  // Render cell icon based on state
  const renderCell = (module: string, action: string, scope: string) => {
    const state = getEffectiveState(module, action, scope);

    const bgColor = state === true
      ? 'bg-primary-50 text-primary-700'
      : state === false
      ? 'bg-ink-red/10 text-ink-red'
      : 'bg-surface';

    return (
      <button
        key={`${module}:${action}:${scope}`}
        onClick={() => handleCellClick(module, action, scope)}
        className={`
          h-8 w-8 flex items-center justify-center rounded-md border transition-all
          ${state !== null ? bgColor : 'border-line'}
          hover:scale-110 hover:shadow-sm
        `}
        aria-label={`${module} ${action} ${scope}: ${state === null ? 'not set' : state ? 'granted' : 'denied'}`}
      >
        {state === true && <Check className="h-4 w-4" />}
        {state === false && <X className="h-4 w-4" />}
        {state === null && <Minus className="h-3 w-3 text-ink-muted" />}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line bg-surface-secondary">
              <th className="sticky left-0 z-10 bg-surface-secondary p-3 text-left text-xs font-semibold text-ink-secondary uppercase tracking-wider">
                Module
              </th>
              {actions.map((action) => (
                <th
                  key={action}
                  colSpan={3}
                  className="p-3 text-center text-xs font-semibold text-ink-secondary uppercase tracking-wider border-l border-line"
                >
                  {action}
                </th>
              ))}
              <th className="p-3 text-center text-xs font-semibold text-ink-secondary uppercase tracking-wider border-l border-line">
                Actions
              </th>
            </tr>
            <tr className="border-b border-line bg-surface-secondary/50">
              <th className="sticky left-0 z-10 bg-surface-secondary/50 p-2 text-xs text-ink-muted">
                Data Scope →
              </th>
              {actions.map((action) =>
                dataScopes.map((scope, idx) => (
                  <th
                    key={`${action}:${scope}`}
                    className={`p-2 text-xs text-ink-muted text-center border-l ${
                      idx % 3 === 0 ? 'border-line' : 'border-line/50'
                    }`}
                  >
                    {scope}
                  </th>
                ))
              )}
              <th className="border-l border-line"></th>
            </tr>
          </thead>
          <tbody>
            {modules.map((module, moduleIdx) => (
              <tr
                key={module}
                className={`border-b border-line hover:bg-surface-secondary/30 transition-colors ${
                  moduleIdx % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary/20'
                }`}
              >
                <td className="sticky left-0 z-10 p-3 text-sm font-medium text-ink-primary border-r border-line bg-inherit">
                  <span className="capitalize">{module.replace('_', ' ')}</span>
                </td>
                {actions.map((action) =>
                  dataScopes.map((scope, idx) => (
                    <td
                      key={`${module}:${action}:${scope}`}
                      className={`p-2 text-center border-l ${
                        idx % 3 === 0 ? 'border-line' : 'border-line/50'
                      }`}
                    >
                      {renderCell(module, action, scope)}
                    </td>
                  ))
                )}
                <td className="p-2 text-center border-l border-line">
                  <div className="flex gap-1 justify-center">
                    <button
                      onClick={() => handleGrantAll(module)}
                      className="px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50 rounded transition-colors"
                    >
                      Grant All
                    </button>
                    <button
                      onClick={() => handleClearAll(module)}
                      className="px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-secondary rounded transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-ink-muted">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-primary-50 flex items-center justify-center">
              <Check className="h-3 w-3 text-primary-700" />
            </div>
            <span>Granted</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-ink-red/10 flex items-center justify-center">
              <X className="h-3 w-3 text-ink-red" />
            </div>
            <span>Denied</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-line flex items-center justify-center">
              <Minus className="h-3 w-3 text-ink-muted" />
            </div>
            <span>Not Set</span>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={localState.size === 0 || isSaving}
          className={`
            h-9 px-4 text-sm font-medium rounded-md transition-all
            ${
              localState.size === 0 || isSaving
                ? 'bg-surface-secondary text-ink-muted cursor-not-allowed'
                : 'bg-primary-600 text-white hover:bg-primary-700'
            }
          `}
        >
          {isSaving ? 'Saving...' : `Save Changes (${localState.size})`}
        </button>
      </div>
    </div>
  );
};
