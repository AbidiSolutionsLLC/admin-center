import { useState } from 'react';
import { Shield, Plus, Edit2, Trash2, Globe } from 'lucide-react';
import { useIpRestrictions, useGlobalIpRestrictionsStatus, useToggleGlobalIpRestrictions, useDeleteIpRestriction } from '../hooks/useIpRestrictions';
import type { IpRestriction } from '../hooks/useIpRestrictions';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IpRestrictionDialog } from './IpRestrictionDialog';
import { Switch } from '@/components/ui/switch';
import { useAuthStore } from '@/store/useAuthStore';
import { PERMISSION_GROUPS } from '@/constants/roles';

export function IpRestrictionsTable() {
  const { data: restrictions, isLoading } = useIpRestrictions();
  const { data: globalStatus } = useGlobalIpRestrictionsStatus();
  const toggleGlobalMutation = useToggleGlobalIpRestrictions();
  const deleteMutation = useDeleteIpRestriction();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRestriction, setSelectedRestriction] = useState<IpRestriction | null>(null);
  const [restrictionToDelete, setRestrictionToDelete] = useState<IpRestriction | null>(null);

  const userRole = useAuthStore((state) => state.userRole);
  const canMutate = userRole ? (PERMISSION_GROUPS.IT_ADMINS as readonly string[]).includes(userRole) : false;

  const handleEdit = (restriction: IpRestriction) => {
    setSelectedRestriction(restriction);
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (restrictionToDelete) {
      await deleteMutation.mutateAsync(restrictionToDelete._id);
      setRestrictionToDelete(null);
    }
  };

  const getTargetBadge = (type: string, label?: string) => {
    if (type === 'portal') {
      return <span className="inline-flex items-center text-[11px] font-semibold tracking-wide rounded-full px-2.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200">Admin Portal</span>;
    }
    if (type === 'all_apps') {
      return <span className="inline-flex items-center text-[11px] font-semibold tracking-wide rounded-full px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200">All Apps</span>;
    }
    return (
      <span className="inline-flex items-center text-[11px] font-semibold tracking-wide rounded-full px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200">
        App: {label || 'Specific App'}
      </span>
    );
  };

  const getSubjectBadge = (type: string, label?: string) => {
    if (type === 'all_users') {
      return <span className="inline-flex items-center text-[11px] font-semibold tracking-wide rounded-full px-2.5 py-0.5 bg-gray-50 text-gray-700 border border-gray-200">All Users</span>;
    }
    const colorClass = type === 'user' ? 'bg-blue-50 text-blue-700 border-blue-200'
                     : type === 'group' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                     : type === 'role' ? 'bg-amber-50 text-amber-700 border-amber-200'
                     : 'bg-orange-50 text-orange-700 border-orange-200';
    return (
      <span className={`inline-flex items-center text-[11px] font-semibold tracking-wide rounded-full px-2.5 py-0.5 border ${colorClass}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}: {label || 'Specific Subject'}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Global Setting Bar */}
      <div className="bg-white rounded-lg border border-line shadow-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${globalStatus ? 'bg-primary-light text-primary' : 'bg-surface-alt text-ink-muted'}`}>
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">IP-Based Access Restrictions</h3>
            <p className="text-xs text-ink-secondary mt-0.5">
              {globalStatus 
                ? 'Restrictions are currently active. Users from unapproved IPs will be blocked.' 
                : 'Restrictions are disabled. IP rules are configured but not enforced.'}
            </p>
          </div>
        </div>
        {canMutate && (
          <Switch
            checked={globalStatus || false}
            onCheckedChange={(checked: boolean) => toggleGlobalMutation.mutate(checked)}
            disabled={toggleGlobalMutation.isPending}
          />
        )}
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface">
          <div>
            <h2 className="text-base font-semibold text-ink">Configured IP Addresses</h2>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Manage allowed IP addresses and CIDR blocks for your organization.
            </p>
          </div>
          {canMutate && (
            <button
              onClick={() => {
                setSelectedRestriction(null);
                setIsDialogOpen(true);
              }}
              className="h-9 px-4 flex items-center gap-2 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add IP Address
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-alt">
                <th className="px-6 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Label</th>
                <th className="px-6 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">IP Address / Range</th>
                <th className="px-6 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Target</th>
                <th className="px-6 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Applies To</th>
                {canMutate && <th className="px-6 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-ink-muted">
                    Loading IP restrictions...
                  </td>
                </tr>
              ) : !restrictions || restrictions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center">
                    <Shield className="w-8 h-8 text-ink-muted mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium text-ink">No IP restrictions found</p>
                    <p className="text-xs text-ink-secondary mt-1">Add an IP address to restrict access.</p>
                  </td>
                </tr>
              ) : (
                restrictions.map((restriction) => (
                  <tr key={restriction._id} className="hover:bg-surface transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {restriction.is_enabled ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted bg-surface-alt px-2 py-1 rounded-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-ink-muted" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-ink">
                      {restriction.label}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-ink-secondary font-mono">
                      {restriction.ip_address}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getTargetBadge(restriction.target_type, restriction.target_label)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getSubjectBadge(restriction.subject_type || 'all_users', restriction.subject_label)}
                    </td>
                    {canMutate && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(restriction)}
                            className="p-1.5 text-ink-muted hover:text-ink hover:bg-line rounded transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setRestrictionToDelete(restriction)}
                            className="p-1.5 text-ink-muted hover:text-error hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <IpRestrictionDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        restriction={selectedRestriction}
      />

      <ConfirmDialog
        isOpen={!!restrictionToDelete}
        onClose={() => setRestrictionToDelete(null)}
        onConfirm={handleDelete}
        title="Delete IP Restriction"
        description={`Are you sure you want to delete the IP restriction "${restrictionToDelete?.label}"? Users from this IP may lose access if no other rules match.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
