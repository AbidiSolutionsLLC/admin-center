import { useState } from 'react';
import { Plus, Database, Trash2 } from 'lucide-react';
import { useDataGovernancePolicies, useCreateDataGovernancePolicy, useDeleteDataGovernancePolicy, useUpdateDataGovernancePolicy } from '@/features/policies/hooks/useAdvancedPolicies';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import type { DataGovernancePolicy } from '@/types';

export const DataGovernancePoliciesView = () => {
  const { data: policies, isLoading } = useDataGovernancePolicies();
  const createMutation = useCreateDataGovernancePolicy();
  const deleteMutation = useDeleteDataGovernancePolicy();
  const updateMutation = useUpdateDataGovernancePolicy();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [newPolicy, setNewPolicy] = useState<Partial<DataGovernancePolicy>>({
    name: '',
    description: '',
    resource: 'User',
    granularity: 'column',
    rules: [{ action: 'mask', fields: [] }],
    applied_to: { roles: [] },
    is_active: true,
  });

  const handleCreate = () => {
    createMutation.mutate(newPolicy, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setNewPolicy({
          name: '',
          description: '',
          resource: 'User',
          granularity: 'column',
          rules: [{ action: 'mask', fields: [] }],
          applied_to: { roles: [] },
          is_active: true,
        });
      }
    });
  };

  const toggleActive = (policy: DataGovernancePolicy) => {
    updateMutation.mutate({ id: policy._id, data: { is_active: !policy.is_active } });
  };

  if (isLoading) return <TableSkeleton rows={4} columns={6} />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold text-ink">Data Governance Policies</h2>
          <p className="text-sm text-ink-secondary mt-0.5">Define data masking and field-level encryption rules.</p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors duration-150 flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Masking Rule
        </button>
      </div>

      {!policies?.length ? (
        <EmptyState
          icon={Database}
          title="No Data Governance Policies"
          description="Create your first data masking rule to protect sensitive fields like SSN or Salary."
          action={{ label: 'Create Rule', onClick: () => setIsCreateOpen(true) }}
        />
      ) : (
        <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-white/5 border-b border-line">
              <tr>
                <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Rule Name</th>
                <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Resource</th>
                <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Fields</th>
                <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Action</th>
                <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Status</th>
                <th className="h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p._id} className="border-b border-line last:border-0 hover:bg-white/5 transition-colors duration-100">
                  <td className="h-14 px-4">
                    <div className="text-sm font-medium text-ink">{p.name}</div>
                    <div className="text-xs text-ink-secondary mt-0.5">{p.description}</div>
                  </td>
                  <td className="h-14 px-4 text-sm text-ink capitalize">{p.resource}</td>
                  <td className="h-14 px-4 font-mono text-[11px] text-accent">
                    {p.rules?.[0]?.fields?.join(', ') || 'N/A'}
                  </td>
                  <td className="h-14 px-4 capitalize">
                    <span className="inline-flex items-center text-[11px] font-semibold tracking-wide rounded-full px-2.5 py-0.5 bg-surface-alt text-ink-secondary border border-line">
                      {p.rules?.[0]?.action || 'Unknown'}
                    </span>
                  </td>
                  <td className="h-14 px-4">
                    <button
                      onClick={() => toggleActive(p)}
                      className={`inline-flex items-center text-[11px] font-semibold tracking-wide rounded-full px-2.5 py-0.5 border transition-colors duration-150 ${p.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-[#F1F3F7] text-ink-secondary border-[#C8CDD8] hover:bg-[#E5E7EB]'}`}
                    >
                      {p.is_active ? 'Active' : 'Inactive'}
                    </button>
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

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Data Governance Rule" size="lg">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Rule Name <span className="text-error">*</span></label>
            <input
              type="text"
              value={newPolicy.name}
              onChange={(e) => setNewPolicy({ ...newPolicy, name: e.target.value })}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              placeholder="e.g. Mask Employee SSN"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Description</label>
            <input
              type="text"
              value={newPolicy.description}
              onChange={(e) => setNewPolicy({ ...newPolicy, description: e.target.value })}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Resource</label>
              <select
                value={newPolicy.resource}
                onChange={(e) => setNewPolicy({ ...newPolicy, resource: e.target.value })}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              >
                <option value="User">User</option>
                <option value="Department">Department</option>
                <option value="Team">Team</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Granularity</label>
              <select
                value={newPolicy.granularity}
                onChange={(e) => setNewPolicy({ ...newPolicy, granularity: e.target.value as any })}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              >
                <option value="column">Column (Field Level)</option>
                <option value="row">Row (Record Level)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Target Fields (comma separated) <span className="text-error">*</span></label>
              <input
                type="text"
                value={newPolicy.rules?.[0]?.fields?.join(', ') || ''}
                onChange={(e) => {
                  const fields = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                  setNewPolicy({
                    ...newPolicy,
                    rules: [{ ...newPolicy.rules?.[0]!, fields }]
                  });
                }}
                className="w-full h-9 px-3 font-mono text-xs rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
                placeholder="e.g. ssn, salary, custom_fields.dob"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Masking Action</label>
              <select
                value={newPolicy.rules?.[0]?.action || 'mask'}
                onChange={(e) => {
                  setNewPolicy({
                    ...newPolicy,
                    rules: [{ ...newPolicy.rules?.[0]!, action: e.target.value as any }]
                  });
                }}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              >
                <option value="mask">Mask Data</option>
                <option value="hide">Hide Data (Strip entirely)</option>
                <option value="encrypt">Encrypt Data</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Authorized Role IDs (comma separated)</label>
            <p className="text-[11px] text-ink-muted mb-1">If empty, NO roles (except Super Admins) are authorized. Specify role IDs that CAN see this data.</p>
            <input
              type="text"
              value={newPolicy.applied_to?.roles?.join(', ') || ''}
              onChange={(e) => {
                const roles = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                setNewPolicy({
                  ...newPolicy,
                  applied_to: { ...newPolicy.applied_to, roles }
                });
              }}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              placeholder="e.g. 64b8f0..."
            />
          </div>
          <div className="pt-4 flex justify-end space-x-2 border-t border-line mt-6">
            <button onClick={() => setIsCreateOpen(false)} className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors duration-150">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newPolicy.name || (newPolicy.rules?.[0]?.fields?.length || 0) === 0 || createMutation.isPending}
              className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors duration-150 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Rule'}
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
        title="Delete Data Governance Rule"
        description="Are you sure you want to delete this masking rule? Sensitive data may become exposed."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
};


