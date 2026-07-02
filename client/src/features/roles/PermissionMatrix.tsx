// client/src/features/roles/PermissionMatrix.tsx
import { useState, useMemo } from 'react';
import { Check, Minus, X } from 'lucide-react';
import type { Permission, ResolvedPermission, PermissionUpdate } from '@/types';

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
          granted, // Can be boolean or null
        });
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

    const baseStyle = {
      height: 32, width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 8, transition: 'all 0.2s ease', cursor: 'pointer'
    };

    let styleObj: React.CSSProperties = { ...baseStyle };

    if (state === true) {
      styleObj = { ...styleObj, background: 'rgba(245,176,42,0.12)', border: '1px solid rgba(245,176,42,0.25)', color: '#f5b02a' };
    } else if (state === false) {
      styleObj = { ...styleObj, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' };
    } else {
      styleObj = { ...styleObj, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(148,163,184,0.5)' };
    }

    return (
      <button
        key={`${module}:${action}:${scope}`}
        onClick={() => handleCellClick(module, action, scope)}
        style={styleObj}
        className="hover:scale-110 hover:shadow-[0_0_12px_rgba(245,176,42,0.15)] mx-auto"
        aria-label={`${module} ${action} ${scope}: ${state === null ? 'not set' : state ? 'granted' : 'denied'}`}
      >
        {state === true && <Check className="h-4 w-4" />}
        {state === false && <X className="h-4 w-4" />}
        {state === null && <Minus className="h-3 w-3" />}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto" style={{
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
        backdropFilter: 'blur(12px)',
        overflow: 'hidden',
      }}>
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <th className="sticky left-0 z-10" style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(148,163,184,0.5)', textAlign: 'left', padding: '12px 8px', background: 'rgba(255,255,255,0.03)' }}>
                Module
              </th>
              {actions.map((action) => (
                <th
                  key={action}
                  colSpan={3}
                  className="border-l border-white/5"
                  style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(148,163,184,0.5)', textAlign: 'center', padding: '12px 8px' }}
                >
                  {action}
                </th>
              ))}
              <th className="border-l border-white/5" style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(148,163,184,0.5)', textAlign: 'center', padding: '12px 8px' }}>
                Actions
              </th>
            </tr>
            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <th className="sticky left-0 z-10" style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(148,163,184,0.5)', textAlign: 'left', padding: '12px 8px', background: 'rgba(255,255,255,0.02)' }}>
                Data Scope →
              </th>
              {actions.map((action) =>
                dataScopes.map((scope, idx) => (
                  <th
                    key={`${action}:${scope}`}
                    className={`border-l ${idx % 3 === 0 ? 'border-white/10' : 'border-white/5'}`}
                    style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(148,163,184,0.5)', textAlign: 'center', padding: '12px 8px' }}
                  >
                    {scope}
                  </th>
                ))
              )}
              <th className="border-l border-white/5"></th>
            </tr>
          </thead>
          <tbody>
            {modules.map((module, moduleIdx) => (
              <tr
                key={module}
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease', background: 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td className="sticky left-0 z-10 border-r border-white/5" style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', padding: '14px 20px', background: 'rgba(255,255,255,0.02)' }}>
                  <span className="capitalize">{module.replace('_', ' ')}</span>
                </td>
                {actions.map((action) =>
                  dataScopes.map((scope, idx) => (
                    <td
                      key={`${module}:${action}:${scope}`}
                      className={`p-2 text-center border-l ${
                        idx % 3 === 0 ? 'border-white/10' : 'border-white/5'
                      }`}
                    >
                      {renderCell(module, action, scope)}
                    </td>
                  ))
                )}
                <td className="p-2 text-center border-l border-white/5">
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => handleGrantAll(module)}
                      style={{ fontSize: 11, fontWeight: 700, color: '#f5b02a', cursor: 'pointer', background: 'transparent', border: 'none' }}
                      className="hover:text-white transition-colors"
                    >
                      Grant All
                    </button>
                    <button
                      onClick={() => handleClearAll(module)}
                      style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', cursor: 'pointer', background: 'transparent', border: 'none' }}
                      className="hover:text-white transition-colors"
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
              <X className="h-3 w-3 text-error" />
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

        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocalState(new Map())}
            disabled={localState.size === 0 || isSaving}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={localState.size === 0 || isSaving}
            className={`
              h-9 px-4 text-sm font-medium rounded-md transition-all
              ${
                localState.size === 0 || isSaving
                  ? 'bg-surface-alt text-ink-muted cursor-not-allowed'
                  : 'bg-primary text-white hover:bg-primary-700'
              }
            `}
          >
            {isSaving ? 'Saving...' : `Save Changes (${localState.size})`}
          </button>
        </div>
      </div>
    </div>
  );
};
