import { useState } from 'react';
import { Plus, Shield, Settings, Trash2 } from 'lucide-react';
import { useAccessControlPolicies, useCreateAccessControlPolicy, useDeleteAccessControlPolicy } from '@/features/policies/hooks/useAdvancedPolicies';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/utils/formatDate';
import type { AccessControlPolicy } from '@/types';

export const AccessControlPoliciesView = () => {
  const { data: policies, isLoading } = useAccessControlPolicies();
  const createMutation = useCreateAccessControlPolicy();
  const deleteMutation = useDeleteAccessControlPolicy();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [newPolicy, setNewPolicy] = useState<Partial<AccessControlPolicy>>({
    name: '',
    description: '',
    target_type: 'role',
    priority: 1,
    is_active: true,
    conditions: [],
    permissions: [],
  });

  const handleCreate = () => {
    createMutation.mutate(newPolicy, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setNewPolicy({ name: '', description: '', target_type: 'role', priority: 1, is_active: true, conditions: [], permissions: [] });
      }
    });
  };

  if (isLoading) return <TableSkeleton rows={4} columns={5} />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold text-ink">Access Control Policies</h2>
          <p className="text-sm text-ink-secondary mt-0.5">Define fine-grained attribute-based access controls (PBAC).</p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors duration-150 flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create PBAC Policy
        </button>
      </div>

      {!policies?.length ? (
        <EmptyState
          icon={Shield}
          title="No Access Control Policies"
          description="Create your first PBAC policy to enforce fine-grained permissions."
          action={{ label: 'Create Policy', onClick: () => setIsCreateOpen(true) }}
        />
      ) : (
        <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-[#F7F8FA] border-b border-line">
              <tr>
                <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Policy Name</th>
                <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Target Type</th>
                <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Priority</th>
                <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Status</th>
                <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p._id} className="border-b border-line last:border-0 hover:bg-[#F7F8FA] transition-colors duration-100">
                  <td className="h-14 px-4">
                    <div className="text-sm font-medium text-ink">{p.name}</div>
                    <div className="text-xs text-ink-secondary mt-0.5">{p.description}</div>
                  </td>
                  <td className="h-14 px-4 text-sm text-ink capitalize">{p.target_type}</td>
                  <td className="h-14 px-4 text-sm text-ink">{p.priority}</td>
                  <td className="h-14 px-4">
                    <span className={`inline-flex items-center text-[11px] font-semibold tracking-wide rounded-full px-2.5 py-0.5 border ${p.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-[#F1F3F7] text-ink-secondary border-[#C8CDD8]'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="h-14 px-4 text-right">
                    <button onClick={() => setDeleteId(p._id)} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-secondary hover:text-error hover:bg-red-50 transition-colors duration-150">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Access Control Policy" size="lg">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Name <span className="text-error">*</span></label>
            <input
              type="text"
              value={newPolicy.name}
              onChange={(e) => setNewPolicy({ ...newPolicy, name: e.target.value })}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              placeholder="e.g. Finance Data Access"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Description</label>
            <input
              type="text"
              value={newPolicy.description}
              onChange={(e) => setNewPolicy({ ...newPolicy, description: e.target.value })}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              placeholder="Restricts access to financial records"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Target Type</label>
              <select
                value={newPolicy.target_type}
                onChange={(e) => setNewPolicy({ ...newPolicy, target_type: e.target.value as any })}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              >
                <option value="role">Role</option>
                <option value="department">Department</option>
                <option value="group">Group</option>
                <option value="all">All Users</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Priority</label>
              <input
                type="number"
                value={newPolicy.priority}
                onChange={(e) => setNewPolicy({ ...newPolicy, priority: parseInt(e.target.value) })}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              />
            </div>
          </div>
          <div className="pt-4 flex justify-end space-x-2 border-t border-line mt-6">
            <button onClick={() => setIsCreateOpen(false)} className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors duration-150">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newPolicy.name || createMutation.isPending}
              className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors duration-150 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Policy'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
          setDeleteId(null);
        }}
        title="Delete Access Control Policy"
        message="Are you sure you want to delete this policy? This action cannot be undone and will immediately affect access rules."
        confirmText="Delete"
        isDestructive
      />
    </div>
  );
};
