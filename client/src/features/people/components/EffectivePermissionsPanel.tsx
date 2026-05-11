import React, { useState, useMemo } from 'react';
import { useUserEffectivePermissions } from '../hooks/useUserEffectivePermissions';
import { ShieldCheck, ShieldAlert, Search, Key, CheckCircle2, XCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface EffectivePermissionsPanelProps {
  userId: string;
}

export const EffectivePermissionsPanel: React.FC<EffectivePermissionsPanelProps> = ({ userId }) => {
  const { data: effectiveData, isLoading, isError, refetch } = useUserEffectivePermissions(userId);
  const [searchTerm, setSearchTerm] = useState('');

  // Count high-risk permissions for UI warning
  const highRiskCount = useMemo(() => {
    if (!effectiveData?.permissions) return 0;
    let count = 0;
    for (const [key, granted] of Object.entries(effectiveData.permissions)) {
      if (!granted) continue;
      const parts = key.split(':');
      if (parts.length >= 3) {
        const action = parts[1];
        const scope = parts[2];
        if ((action === 'delete' || action === 'export') && scope === 'all') {
          count++;
        }
      }
    }
    return count;
  }, [effectiveData]);

  // Group permissions by module
  const groupedPermissions = useMemo(() => {
    if (!effectiveData?.permissions) return {};
    const groups: Record<string, Array<{ key: string; module: string; action: string; scope: string; granted: boolean }>> = {};

    for (const [key, granted] of Object.entries(effectiveData.permissions)) {
      const parts = key.split(':');
      if (parts.length >= 3) {
        const moduleName = parts[0];
        const action = parts[1];
        const scope = parts[2];

        // Search filter
        if (
          searchTerm &&
          !moduleName.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !action.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !scope.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          continue;
        }

        if (!groups[moduleName]) {
          groups[moduleName] = [];
        }

        groups[moduleName].push({
          key,
          module: moduleName,
          action,
          scope,
          granted,
        });
      }
    }

    return groups;
  }, [effectiveData, searchTerm]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card p-6 animate-pulse space-y-4">
        <div className="h-5 bg-surface-alt rounded w-1/4" />
        <div className="h-10 bg-surface-alt rounded" />
        <div className="h-32 bg-surface-alt rounded" />
      </div>
    );
  }

  if (isError || !effectiveData) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card p-6 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 text-red-500 mx-auto" />
        <h3 className="font-semibold text-ink">Failed to load effective permissions</h3>
        <p className="text-sm text-ink-muted">There was an issue fetching user permissions. Please try again.</p>
        <button
          onClick={() => refetch()}
          className="h-9 px-4 text-sm font-medium rounded-md bg-primary text-white hover:bg-primary-hover transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-line shadow-card p-6 space-y-6">
      {/* Header section with assigned roles */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-ink text-base">Effective Permissions</h3>
          </div>
          <p className="text-xs text-ink-secondary">
            Resolved permissions across all assigned roles. Deny overrides grant.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-ink-muted mr-1">Assigned Roles:</span>
          {effectiveData.roles && effectiveData.roles.length > 0 ? (
            effectiveData.roles.map((role) => (
              <StatusBadge key={role._id} variant="neutral">
                {role.name}
              </StatusBadge>
            ))
          ) : (
            <span className="text-xs text-amber-600 font-medium">No roles assigned</span>
          )}
        </div>
      </div>

      {/* Over-permissioned least-privilege risk warning alert */}
      {highRiskCount > 10 && (
        <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <h4 className="text-sm font-bold text-amber-800">Least-Privilege Warning: Excessive Permissions Detected</h4>
            <p className="text-xs text-amber-700 leading-relaxed">
              This user possesses <strong>{highRiskCount} high-risk permissions</strong> (delete or export actions scoped to <strong>all</strong> data). 
              To conform to least-privilege standards, we highly recommend auditing their assigned roles and reducing scopes to <strong>department</strong> or <strong>own</strong>.
            </p>
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 hover:text-amber-900 cursor-pointer pt-0.5">
              <span>Remediation action: Optimize Role Assignments</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
        <input
          type="text"
          placeholder="Search permissions by module, action, or scope..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 h-9 w-full rounded-md border border-line bg-white text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Permissions Matrix */}
      <div className="space-y-6">
        {Object.keys(groupedPermissions).length > 0 ? (
          Object.entries(groupedPermissions).map(([moduleName, perms]) => (
            <div key={moduleName} className="space-y-2">
              <h4 className="text-xs font-bold text-ink-secondary uppercase tracking-wider bg-surface-alt py-1.5 px-3 rounded-md">
                {moduleName} Module
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-1">
                {perms.map((p) => (
                  <div
                    key={p.key}
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors ${
                      p.granted
                        ? 'bg-emerald-50/10 border-emerald-100 hover:bg-emerald-50/20'
                        : 'bg-red-50/10 border-red-100 hover:bg-red-50/20'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {p.granted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-ink truncate capitalize">
                          {p.action.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-ink-muted font-mono uppercase">
                          Scope: {p.scope}
                        </span>
                      </div>
                    </div>
                    <div>
                      {p.granted ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5 capitalize">
                          Granted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100 rounded px-1.5 py-0.5 capitalize">
                          Denied
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-6 border border-dashed border-line rounded-lg">
            <Key className="w-8 h-8 text-ink-muted mx-auto mb-2" />
            <p className="text-sm text-ink-secondary">No matching permissions found.</p>
          </div>
        )}
      </div>
    </div>
  );
};
