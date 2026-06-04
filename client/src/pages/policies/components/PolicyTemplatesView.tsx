import { useState } from 'react';
import { Plus, Copy, Trash2, FileText } from 'lucide-react';
import { usePolicyTemplates, useCreatePolicyTemplate, useDeletePolicyTemplate } from '@/features/policies/hooks/useAdvancedPolicies';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import type { PolicyTemplate } from '@/types';

export const PolicyTemplatesView = () => {
  const { data: templates, isLoading } = usePolicyTemplates();
  const createMutation = useCreatePolicyTemplate();
  const deleteMutation = useDeletePolicyTemplate();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [newTemplate, setNewTemplate] = useState<Partial<PolicyTemplate>>({
    name: '',
    description: '',
    category: 'hr',
    content_template: '',
    default_rules: [],
    variables: [],
  });

  const handleCreate = () => {
    createMutation.mutate(newTemplate, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setNewTemplate({ name: '', description: '', category: 'hr', content_template: '', default_rules: [], variables: [] });
      }
    });
  };

  if (isLoading) return <TableSkeleton rows={4} columns={4} />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold text-ink">Policy Templates</h2>
          <p className="text-sm text-ink-secondary mt-0.5">Standardized policy templates to ensure company-wide consistency.</p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors duration-150 flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Template
        </button>
      </div>

      {!templates?.length ? (
        <EmptyState
          icon={FileText}
          title="No Policy Templates"
          description="Create your first reusable policy template."
          action={{ label: 'Create Template', onClick: () => setIsCreateOpen(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {templates.map((t) => (
            <div key={t._id} className="bg-white rounded-lg border border-line shadow-card p-5 flex flex-col h-full hover:shadow-card-hover transition-all duration-200">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-ink">{t.name}</h3>
                  <span className="inline-block px-2 py-0.5 mt-1.5 bg-surface-alt text-ink-secondary border border-line rounded-md text-[10px] uppercase font-bold tracking-wider">
                    {t.category}
                  </span>
                </div>
                <button onClick={() => setDeleteId(t._id)} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-secondary hover:text-error hover:bg-red-50 transition-colors duration-150">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <p className="text-sm text-ink-secondary mb-6 flex-grow">{t.description}</p>
              
              <button className="w-full h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors duration-150 flex items-center justify-center">
                <Copy className="w-4 h-4 mr-2 text-ink-muted" />
                Use Template
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Policy Template" size="lg">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Template Name <span className="text-error">*</span></label>
            <input
              type="text"
              value={newTemplate.name}
              onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              placeholder="e.g. Standard Remote Work Policy"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Description</label>
            <input
              type="text"
              value={newTemplate.description}
              onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Category</label>
              <select
                value={newTemplate.category}
                onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              >
                <option value="hr">HR</option>
                <option value="it">IT</option>
                <option value="security">Security</option>
                <option value="compliance">Compliance</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Template Content <span className="text-error">*</span></label>
            <textarea
              value={newTemplate.content_template}
              onChange={(e) => setNewTemplate({ ...newTemplate, content_template: e.target.value })}
              rows={8}
              className="w-full p-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 font-mono"
              placeholder="Enter markdown content here. Use {{variable}} for placeholders."
            />
          </div>
          <div className="pt-4 flex justify-end space-x-2 border-t border-line mt-6">
            <button onClick={() => setIsCreateOpen(false)} className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors duration-150">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newTemplate.name || !newTemplate.content_template || createMutation.isPending}
              className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors duration-150 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Template'}
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
        title="Delete Template"
        message="Are you sure you want to delete this template?"
        confirmText="Delete"
        isDestructive
      />
    </div>
  );
};
