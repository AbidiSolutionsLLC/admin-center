// src/pages/workflows/WorkflowsPage.tsx
import { useState, useMemo, useCallback, Fragment } from 'react';
import {
  GitBranch, Plus, Eye, Play, Power, PowerOff, Trash2, Search, X,
  ChevronDown, ChevronRight, GripVertical, Save, FlaskConical, History, AlertTriangle,
  CheckCircle, XCircle, Clock, Edit2,
} from 'lucide-react';
import {
  useWorkflows,
  useCreateWorkflow,
  usePublishWorkflow,
  useArchiveWorkflow,
  useCreateDraftWorkflow,
  useRollbackWorkflow,
  useWorkflowVersions,
  useDeleteWorkflow,
  useWorkflowDetail,
  useAddWorkflowStep,
  useUpdateWorkflowStep,
  useDeleteWorkflowStep,
  useReorderWorkflowSteps,
  useWorkflowRuns,
  useSimulateWorkflow,
  useUpdateWorkflow,
} from '@/features/workflows/hooks/useWorkflows';
import { useSaveWorkflowAsTemplate } from '@/features/workflows/hooks/useWorkflowTemplates';
import { WorkflowTemplatesView } from './components/WorkflowTemplatesView';
import { MultiUserSelect } from '@/components/ui/MultiUserSelect';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { UserSelect } from '@/components/ui/UserSelect';
import { useUsers } from '@/features/people/hooks/useUsers';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatDate';
import type {
  Workflow,
  WorkflowStep,
  WorkflowStatus,
  WorkflowTrigger,
  WorkflowActionType,
  WorkflowRun,
  WorkflowSimulationResult,
} from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_COLORS: Record<WorkflowStatus, string> = {
  draft: 'bg-sky-500',
  published: 'bg-emerald-500',
  archived: 'bg-ink-muted',
};

const ACTION_TYPE_LABELS: Record<WorkflowActionType, string> = {
  send_email: 'Send Email',
  assign_role: 'Assign Role',
  revoke_access: 'Revoke Access',
  notify_manager: 'Notify Manager',
  update_field: 'Update Field',
  create_task: 'Create Task',
  webhook: 'Trigger Webhook',
  require_approval: 'Require Approval',
};

const LIFECYCLE_STATES = [
  'invited', 'onboarding', 'active', 'probation', 'on_leave', 'deactivated', 'terminated', 'archived',
];

const RUN_STATUS_ICONS: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  success: { icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'text-emerald-600', label: 'Success' },
  failure: { icon: <XCircle className="w-3.5 h-3.5" />, color: 'text-error', label: 'Failed' },
  partial: { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'text-warning', label: 'Partial' },
};

/**
 * WorkflowsPage Component
 * Full workflow lifecycle management: create draft → add steps → enable → disable → delete.
 * Features:
 * - Step builder with drag-handle reordering
 * - Execution history (WorkflowRun log)
 * - Test endpoint with mock payload
 * - All mutations produce audit events
 */
export default function WorkflowsPage() {
  // ── Server data ──────────────────────────────────────────────────────
  const { data: workflows, isLoading, isError, refetch } = useWorkflows();
  const createMutation = useCreateWorkflow();
  const deleteMutation = useDeleteWorkflow();

  // ── Modal state ──────────────────────────────────────────────────────
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'steps' | 'runs' | 'config' | 'versions'>('steps');
  const [activeTab, setActiveTab] = useState<'workflows' | 'templates'>('workflows');

  // ── Filters ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | ''>('');

  // ── Derived: filter workflows ───────────────────────────────────────
  const filteredWorkflows = useMemo(() => {
    return workflows?.filter((wf) => {
      const matchesSearch =
        !search ||
        wf.name.toLowerCase().includes(search.toLowerCase()) ||
        (wf.description?.toLowerCase().includes(search.toLowerCase()) ?? false);
      const matchesStatus = !statusFilter || wf.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [workflows, search, statusFilter]);

  // ── Render: Loading ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader onCreateClick={() => setIsCreateModalOpen(true)} />
        <TableSkeleton rows={6} columns={5} />
      </div>
    );
  }

  // ── Render: Error ──────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-5">
        <PageHeader onCreateClick={() => setIsCreateModalOpen(true)} />
        <ErrorState
          title="Failed to load workflows"
          description="Something went wrong fetching workflow data. Please try again."
          onRetry={refetch}
        />
      </div>
    );
  }

  const hasData = workflows && workflows.length > 0;

  return (
    <div className="space-y-5">
      {/* ── Page Header ── */}
      <PageHeader
        onCreateClick={() => setIsCreateModalOpen(true)}
        workflowCount={workflows?.length}
      />

      <div className="flex space-x-1 border-b border-line mb-6">
        <button
          onClick={() => setActiveTab('workflows')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-150',
            activeTab === 'workflows'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-secondary hover:text-ink hover:border-line'
          )}
        >
          Workflows
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-150',
            activeTab === 'templates'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-secondary hover:text-ink hover:border-line'
          )}
        >
          Templates
        </button>
      </div>

      {activeTab === 'templates' ? (
        <WorkflowTemplatesView />
      ) : (
        <>
          {/* ── Empty State ── */}
          {!hasData ? (
        <EmptyState
          icon={GitBranch}
          title="No workflows yet"
          description="Create your first workflow to automate lifecycle actions."
          action={{ label: 'Create Workflow', onClick: () => setIsCreateModalOpen(true) }}
        />
      ) : (
        <>
          {/* ── Filter Bar ── */}
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            activeFilterCount={[search, statusFilter].filter(Boolean).length}
            onClearFilters={() => {
              setSearch('');
              setStatusFilter('');
            }}
          />

          {/* ── Workflows Table ── */}
          {filteredWorkflows?.length === 0 ? (
            <div className="bg-white rounded-lg border border-line shadow-card p-16 text-center">
              <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center mx-auto mb-3">
                <Search className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-ink mb-1">No results found</h3>
              <p className="text-sm text-ink-secondary">
                Try adjusting your search or filter criteria.
              </p>
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                }}
                className="mt-4 h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
              <table className="w-full">
                <thead className="bg-white/5 border-b border-line">
                  <tr>
                    <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                      Workflow
                    </th>
                    <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                      Version
                    </th>
                    <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                      Trigger
                    </th>
                    <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                      Status
                    </th>
                    <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                      Created
                    </th>
                    <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkflows?.map((wf) => (
                    <WorkflowRow
                      key={wf._id}
                      workflow={wf}
                      onView={() => {
                        setSelectedWorkflow(wf);
                        setActiveDetailTab('steps');
                      }}
                      onEdit={() => {
                        setEditingWorkflow(wf);
                        setIsEditModalOpen(true);
                      }}
                      onDelete={() => deleteMutation.mutate({ workflow_id: wf._id })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      </>
    )}

      {/* ── Create Workflow Modal ── */}
      <CreateWorkflowModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        createMutation={createMutation}
      />

      {/* ── Edit Workflow Modal ── */}
      {isEditModalOpen && editingWorkflow && (
        <EditWorkflowModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingWorkflow(null);
          }}
          workflow={editingWorkflow}
        />
      )}

      {/* ── Workflow Detail Modal ── */}
      {selectedWorkflow && (
        <WorkflowDetailModal
          workflow={selectedWorkflow}
          isOpen={!!selectedWorkflow}
          onClose={() => setSelectedWorkflow(null)}
          activeTab={activeDetailTab}
          onTabChange={setActiveDetailTab}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface PageHeaderProps {
  onCreateClick: () => void;
  workflowCount?: number;
}

function PageHeader({ onCreateClick, workflowCount }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">
          Workflows
        </h1>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-sm text-ink-secondary">
            Automate actions triggered by lifecycle changes.
          </p>
          {workflowCount !== undefined && (
            <span className="text-xs text-ink-muted">
              {workflowCount} {workflowCount === 1 ? 'workflow' : 'workflows'}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onCreateClick}
        className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-2 flex-shrink-0"
      >
        <Plus className="w-4 h-4" />
        Create Workflow
      </button>
    </div>
  );
}

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: WorkflowStatus | '';
  onStatusChange: (value: WorkflowStatus | '') => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

function FilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  activeFilterCount,
  onClearFilters,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search workflows..."
          className="w-full h-9 pl-9 pr-8 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Status filter */}
      <div className="relative">
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value as WorkflowStatus | '')}
          className="h-9 pl-3 pr-8 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 appearance-none cursor-pointer"
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
      </div>

      {/* Clear filters */}
      {activeFilterCount > 0 && (
        <button
          onClick={onClearFilters}
          className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
        >
          Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}

// ── Workflow Row (with inline enable/disable/delete) ────────────────────────

interface WorkflowRowProps {
  workflow: Workflow;
  onView: () => void;
  onEdit?: () => void;
  onDelete: () => void;
}

function WorkflowRow({ workflow, onView, onEdit, onDelete }: WorkflowRowProps) {
  const publishMutation = usePublishWorkflow(workflow._id);
  const archiveMutation = useArchiveWorkflow(workflow._id);
  const draftMutation = useCreateDraftWorkflow(workflow._id);
  const saveTemplateMutation = useSaveWorkflowAsTemplate();

  const handleSaveAsTemplate = () => {
    const templateName = prompt('Enter a name for the new template:', `${workflow.name} Template`);
    if (templateName) {
      saveTemplateMutation.mutate({ id: workflow._id, name: templateName });
    }
  };

  return (
    <tr className="border-b border-line last:border-0 hover:bg-white/5 transition-colors duration-100">
      <td className="h-14 px-4">
        <div>
          <p className="text-sm font-medium text-ink">{workflow.name}</p>
          {workflow.description && (
            <p className="text-xs text-ink-secondary truncate max-w-xs">
              {workflow.description}
            </p>
          )}
        </div>
      </td>
      <td className="h-14 px-4 text-sm text-ink-secondary font-medium">
        v{workflow.version_number || 1}
      </td>
      <td className="h-14 px-4 text-sm text-ink-secondary">
        <span className="text-xs font-mono text-accent bg-accent-light px-2 py-0.5 rounded">
          {workflow.trigger}
        </span>
      </td>
      <td className="h-14 px-4">
        <div className="flex items-center gap-1.5">
          <div className={cn("w-1.5 h-1.5 rounded-full", STATUS_COLORS[workflow.status || 'draft'])} />
          <span className="text-sm text-ink-secondary">{STATUS_LABELS[workflow.status || 'draft']}</span>
        </div>
      </td>
      <td className="h-14 px-4 text-sm text-ink-secondary">
        {formatDate(workflow.created_at)}
      </td>
      <td className="h-14 px-4 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={onView}
            className="h-7 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors inline-flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            View
          </button>
          {workflow.status === 'draft' && (
            <>
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="h-7 px-2 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors inline-flex items-center gap-1"
                  title="Edit workflow"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending}
                className="h-7 px-2 text-xs font-medium rounded-md border border-line bg-white text-emerald-600 hover:bg-emerald-50 transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                title="Publish workflow"
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {workflow.status === 'published' && (
            <>
              <button
                onClick={() => draftMutation.mutate()}
                disabled={draftMutation.isPending}
                className="h-7 px-2 text-xs font-medium rounded-md border border-line bg-white text-primary hover:bg-primary-light transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                title="Create new draft from this version"
              >
                <GitBranch className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => archiveMutation.mutate()}
                disabled={archiveMutation.isPending}
                className="h-7 px-2 text-xs font-medium rounded-md border border-line bg-white text-warning hover:bg-warning-light transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                title="Archive workflow"
              >
                <PowerOff className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleSaveAsTemplate}
                disabled={saveTemplateMutation.isPending}
                className="h-7 px-2 text-xs font-medium rounded-md border border-line bg-white text-ink-secondary hover:bg-surface-alt transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                title="Save as Template"
              >
                <Save className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {workflow.status === 'archived' && (
            <button
              onClick={() => draftMutation.mutate()}
              disabled={draftMutation.isPending}
              className="h-7 px-2 text-xs font-medium rounded-md border border-line bg-white text-primary hover:bg-primary-light transition-colors inline-flex items-center gap-1 disabled:opacity-50"
              title="Create new draft from this version"
            >
              <GitBranch className="w-3.5 h-3.5" />
            </button>
          )}
          {workflow.status === 'draft' && (
            <button
              onClick={onDelete}
              className="h-7 px-2 text-xs font-medium rounded-md border border-line bg-white text-ink-secondary hover:text-error hover:border-error/30 hover:bg-error-light transition-colors inline-flex items-center gap-1"
              title="Delete draft workflow"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Create Workflow Modal ───────────────────────────────────────────────────

interface CreateWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  createMutation: ReturnType<typeof useCreateWorkflow>;
}

function CreateWorkflowModal({ isOpen, onClose, createMutation }: CreateWorkflowModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    trigger: 'user.lifecycle_changed' as WorkflowTrigger,
    lifecycle_from: [] as string[],
    lifecycle_to: [] as string[],
    role_from: [] as string[],
    role_to: [] as string[],
    department_from: [] as string[],
    department_to: [] as string[],
    sla_threshold_minutes: '',
    sla_notify_on_breach: false,
  });

  const handleSubmit = () => {
    createMutation.mutate(
      {
        name: formData.name,
        description: formData.description || undefined,
        trigger: formData.trigger,
        trigger_config: {
          ...(formData.trigger === 'user.lifecycle_changed' && {
            lifecycle_from: formData.lifecycle_from,
            lifecycle_to: formData.lifecycle_to,
          }),
          ...(formData.trigger === 'user.role_changed' && {
            role_from: formData.role_from,
            role_to: formData.role_to,
          }),
          ...(formData.trigger === 'user.department_changed' && {
            department_from: formData.department_from,
            department_to: formData.department_to,
          }),
        },
        sla_config: formData.sla_threshold_minutes ? {
          threshold_minutes: parseInt(formData.sla_threshold_minutes, 10),
          notify_on_breach: formData.sla_notify_on_breach,
        } : undefined,
      },
      {
        onSuccess: () => {
          onClose();
          setFormData({
            name: '',
            description: '',
            trigger: 'user.lifecycle_changed',
            lifecycle_from: [],
            lifecycle_to: [],
            role_from: [],
            role_to: [],
            department_from: [],
            department_to: [],
            sla_threshold_minutes: '',
            sla_notify_on_breach: false,
          });
        },
      }
    );
  };

  const toggleArrayItem = (
    field: 'lifecycle_from' | 'lifecycle_to' | 'role_from' | 'role_to' | 'department_from' | 'department_to',
    value: string
  ) => {
    const current = formData[field];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setFormData({ ...formData, [field]: updated });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Workflow"
      description="Define a new automation triggered by lifecycle changes."
      size="lg"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={createMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              createMutation.isPending ||
              !formData.name ||
              (formData.trigger === 'user.lifecycle_changed' && (formData.lifecycle_from.length === 0 || formData.lifecycle_to.length === 0)) ||
              (formData.trigger === 'user.role_changed' && (formData.role_from.length === 0 || formData.role_to.length === 0)) ||
              (formData.trigger === 'user.department_changed' && (formData.department_from.length === 0 || formData.department_to.length === 0))
            }
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {createMutation.isPending ? 'Creating...' : 'Create Workflow'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">
            Name <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Offboarding Automation"
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">
            Description (optional)
          </label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            placeholder="Brief description of this workflow"
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">
            Trigger Event <span className="text-error">*</span>
          </label>
          <select
            value={formData.trigger}
            onChange={(e) => setFormData({ ...formData, trigger: e.target.value as WorkflowTrigger })}
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          >
            <option value="user.created">User Created (Invited)</option>
            <option value="user.lifecycle_changed">Lifecycle Status Changed</option>
            <option value="user.role_changed">Role Changed</option>
            <option value="user.department_changed">Department Changed</option>
          </select>
        </div>

        {formData.trigger === 'user.lifecycle_changed' && (
          <>
            <div>
              <label className="text-sm font-medium text-ink block mb-1.5">
                Trigger From (source states) <span className="text-error">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {LIFECYCLE_STATES.map((state) => (
                  <button
                    key={`from-${state}`}
                    type="button"
                    onClick={() => toggleArrayItem('lifecycle_from', state)}
                    className={cn(
                      'h-7 px-3 text-xs font-medium rounded-full border transition-colors',
                      formData.lifecycle_from.includes(state)
                        ? 'bg-primary-light border-primary text-primary'
                        : 'border-line text-ink-secondary hover:border-line-strong'
                    )}
                  >
                    {state}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-ink block mb-1.5">
                Trigger To (target states) <span className="text-error">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {LIFECYCLE_STATES.map((state) => (
                  <button
                    key={`to-${state}`}
                    type="button"
                    onClick={() => toggleArrayItem('lifecycle_to', state)}
                    className={cn(
                      'h-7 px-3 text-xs font-medium rounded-full border transition-colors',
                      formData.lifecycle_to.includes(state)
                        ? 'bg-accent-light border-accent text-accent'
                        : 'border-line text-ink-secondary hover:border-line-strong'
                    )}
                  >
                    {state}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {formData.trigger === 'user.role_changed' && (
          <div className="p-3 bg-surface border border-line rounded-md">
            <p className="text-sm text-ink-secondary mb-2">Note: Configured role transitions (e.g. from Employee to Manager) can be mapped using exact Role IDs. For MVP, please leave empty to trigger on ANY role change, or use the detailed workflow editor after creation.</p>
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="text-sm font-medium text-ink block mb-1.5">From Role IDs</label>
                  <input type="text" placeholder="e.g. role_id_1, role_id_2" value={formData.role_from.join(',')} onChange={(e) => setFormData({...formData, role_from: e.target.value.split(',').filter(Boolean)})} className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white" />
               </div>
               <div>
                  <label className="text-sm font-medium text-ink block mb-1.5">To Role IDs</label>
                  <input type="text" placeholder="e.g. role_id_3" value={formData.role_to.join(',')} onChange={(e) => setFormData({...formData, role_to: e.target.value.split(',').filter(Boolean)})} className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white" />
               </div>
            </div>
          </div>
        )}

        {formData.trigger === 'user.department_changed' && (
          <div className="p-3 bg-surface border border-line rounded-md">
            <p className="text-sm text-ink-secondary mb-2">Note: Configured department transitions can be mapped using exact Department IDs. For MVP, please leave empty to trigger on ANY department change, or use the detailed workflow editor after creation.</p>
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="text-sm font-medium text-ink block mb-1.5">From Dept IDs</label>
                  <input type="text" placeholder="e.g. dept_id_1" value={formData.department_from.join(',')} onChange={(e) => setFormData({...formData, department_from: e.target.value.split(',').filter(Boolean)})} className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white" />
               </div>
               <div>
                  <label className="text-sm font-medium text-ink block mb-1.5">To Dept IDs</label>
                  <input type="text" placeholder="e.g. dept_id_2" value={formData.department_to.join(',')} onChange={(e) => setFormData({...formData, department_to: e.target.value.split(',').filter(Boolean)})} className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white" />
               </div>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-line">
          <label className="text-sm font-medium text-ink block mb-1.5">
            SLA Configuration (optional)
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-ink-secondary block mb-1">
                Threshold (Minutes)
              </label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 60"
                value={formData.sla_threshold_minutes}
                onChange={(e) => setFormData({ ...formData, sla_threshold_minutes: e.target.value })}
                className="w-full h-8 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              />
            </div>
            <div className="flex items-center mt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.sla_notify_on_breach}
                  onChange={(e) => setFormData({ ...formData, sla_notify_on_breach: e.target.checked })}
                  className="rounded border-line text-primary focus:ring-primary"
                />
                <span className="text-xs text-ink">Notify Admin on Breach</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Edit Workflow Modal ─────────────────────────────────────────────────────

interface EditWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflow: Workflow;
}

function EditWorkflowModal({ isOpen, onClose, workflow }: EditWorkflowModalProps) {
  const updateMutation = useUpdateWorkflow(workflow._id);

  const [formData, setFormData] = useState({
    name: workflow.name,
    description: workflow.description || '',
    trigger: workflow.trigger,
    lifecycle_from: workflow.trigger_config.lifecycle_from || [],
    lifecycle_to: workflow.trigger_config.lifecycle_to || [],
    role_from: workflow.trigger_config.role_from || [],
    role_to: workflow.trigger_config.role_to || [],
    department_from: workflow.trigger_config.department_from || [],
    department_to: workflow.trigger_config.department_to || [],
    sla_threshold_minutes: workflow.sla_config?.threshold_minutes?.toString() || '',
    sla_notify_on_breach: workflow.sla_config?.notify_on_breach || false,
  });

  const handleSubmit = () => {
    updateMutation.mutate(
      {
        name: formData.name,
        description: formData.description || undefined,
        trigger_config: {
          ...(formData.trigger === 'user.lifecycle_changed' && {
            lifecycle_from: formData.lifecycle_from,
            lifecycle_to: formData.lifecycle_to,
          }),
          ...(formData.trigger === 'user.role_changed' && {
            role_from: formData.role_from,
            role_to: formData.role_to,
          }),
          ...(formData.trigger === 'user.department_changed' && {
            department_from: formData.department_from,
            department_to: formData.department_to,
          }),
        },
        sla_config: formData.sla_threshold_minutes ? {
          threshold_minutes: parseInt(formData.sla_threshold_minutes, 10),
          notify_on_breach: formData.sla_notify_on_breach,
        } : undefined,
      },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  const toggleArrayItem = (
    field: 'lifecycle_from' | 'lifecycle_to' | 'role_from' | 'role_to' | 'department_from' | 'department_to',
    value: string
  ) => {
    const current = formData[field];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setFormData({ ...formData, [field]: updated });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Workflow"
      description="Modify the details and trigger conditions for this workflow."
      size="lg"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={updateMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={updateMutation.isPending || !formData.name}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-sm font-medium text-ink block mb-1.5">
              Workflow Name <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Onboarding Approvals"
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium text-ink block mb-1.5">
              Description (optional)
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Briefly describe what this workflow does..."
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>
        </div>

        <div className="border-t border-line pt-5">
          <label className="text-sm font-medium text-ink block mb-3">
            Trigger <span className="text-error">*</span>
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'user.lifecycle_changed', label: 'Lifecycle Change', desc: 'When employment status changes' },
              { id: 'user.role_changed', label: 'Role Change', desc: 'When access role is modified' },
              { id: 'user.department_changed', label: 'Department Change', desc: 'When team assignment changes' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setFormData({ ...formData, trigger: t.id as WorkflowTrigger })}
                className={cn(
                  'text-left p-3 rounded-lg border transition-all',
                  formData.trigger === t.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-line bg-white hover:border-primary/50'
                )}
              >
                <div className="text-sm font-medium text-ink mb-1">{t.label}</div>
                <div className="text-[10px] text-ink-secondary">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {formData.trigger === 'user.lifecycle_changed' && (
          <div className="grid grid-cols-2 gap-4 border-t border-line pt-5">
            <div>
              <label className="text-sm font-medium text-ink block mb-2">From States (Optional)</label>
              <div className="flex flex-wrap gap-2">
                {['pre_boarding', 'onboarding', 'active', 'offboarding', 'terminated'].map((state) => (
                  <button
                    key={state}
                    onClick={() => toggleArrayItem('lifecycle_from', state)}
                    className={cn(
                      'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
                      formData.lifecycle_from.includes(state)
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-ink-secondary border-line hover:border-primary/50'
                    )}
                  >
                    {state}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-ink-muted mt-2">Leave empty to trigger from ANY state.</p>
            </div>
            <div>
              <label className="text-sm font-medium text-ink block mb-2">To States (Optional)</label>
              <div className="flex flex-wrap gap-2">
                {['pre_boarding', 'onboarding', 'active', 'offboarding', 'terminated'].map((state) => (
                  <button
                    key={state}
                    onClick={() => toggleArrayItem('lifecycle_to', state)}
                    className={cn(
                      'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
                      formData.lifecycle_to.includes(state)
                        ? 'bg-accent text-white border-accent'
                        : 'bg-white text-ink-secondary border-line hover:border-accent/50'
                    )}
                  >
                    {state}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-ink-muted mt-2">Leave empty to trigger to ANY state.</p>
            </div>
          </div>
        )}

        <div className="border-t border-line pt-5">
          <h4 className="text-sm font-medium text-ink mb-3">Service Level Agreement (SLA)</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-ink-secondary block mb-1">
                Threshold (minutes)
              </label>
              <input
                type="number"
                min="0"
                value={formData.sla_threshold_minutes}
                onChange={(e) => setFormData({ ...formData, sla_threshold_minutes: e.target.value })}
                placeholder="e.g., 1440 for 24h"
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>
            <div className="flex items-center mt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.sla_notify_on_breach}
                  onChange={(e) => setFormData({ ...formData, sla_notify_on_breach: e.target.checked })}
                  className="rounded border-line text-primary focus:ring-primary"
                />
                <span className="text-sm text-ink">Notify Ops Admins on Breach</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Workflow Detail Modal ───────────────────────────────────────────────────

interface WorkflowDetailModalProps {
  workflow: Workflow;
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'steps' | 'runs' | 'config' | 'versions';
  onTabChange: (tab: 'steps' | 'runs' | 'config' | 'versions') => void;
}

const WORKFLOW_TABS = [
  { key: 'steps' as const, label: 'Steps', icon: GitBranch },
  { key: 'runs' as const, label: 'Run History', icon: History },
  { key: 'config' as const, label: 'Config', icon: Edit2 },
  { key: 'versions' as const, label: 'Versions', icon: GitBranch },
];

function WorkflowDetailModal({
  workflow,
  isOpen,
  onClose,
  activeTab,
  onTabChange,
}: WorkflowDetailModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={workflow.name}
      description={STATUS_LABELS[workflow.status]}
      size="xl"
      footer={
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors ml-auto"
          >
            Close
          </button>
        </div>
      }
    >
      {/* Tab Bar */}
      <div className="flex items-center gap-1 mb-5 border-b border-line">
        {WORKFLOW_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-ink-secondary hover:text-ink'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'steps' && <WorkflowStepsView workflowId={workflow._id} status={workflow.status} />}
      {activeTab === 'runs' && <WorkflowRunsView workflowId={workflow._id} />}
      {activeTab === 'config' && <WorkflowConfigView workflow={workflow} />}
      {activeTab === 'versions' && <WorkflowVersionsView workflow={workflow} />}
    </Modal>
  );
}

// ── Tab: Versions View ────────────────────────────────────────────────────────
function WorkflowVersionsView({ workflow }: { workflow: Workflow }) {
  const { data: versions, isLoading } = useWorkflowVersions(workflow.workflow_key);
  const rollbackMutation = useRollbackWorkflow(workflow._id);

  if (isLoading) return <TableSkeleton rows={4} columns={5} />;

  return (
    <div className="space-y-3">
      {versions && versions.length > 0 ? (
        <div className="border border-line rounded-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-white/5 border-b border-line">
              <tr>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Version
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Status
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Created By
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Created At
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v._id} className="border-b border-line last:border-0 hover:bg-white/5 transition-colors">
                  <td className="h-10 px-4 text-sm font-medium text-ink">
                    v{v.version_number || 1} {v._id === workflow._id && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded ml-1">Current</span>}
                  </td>
                  <td className="h-10 px-4">
                    <div className="flex items-center gap-1.5">
                      <div className={cn("w-1.5 h-1.5 rounded-full", STATUS_COLORS[v.status || 'draft'])} />
                      <span className="text-sm text-ink-secondary">{STATUS_LABELS[v.status || 'draft']}</span>
                    </div>
                  </td>
                  <td className="h-10 px-4 text-sm text-ink-secondary">
                    {v.created_by?.full_name ?? 'Unknown'}
                  </td>
                  <td className="h-10 px-4 text-sm text-ink-secondary">
                    {formatDate(v.created_at)}
                  </td>
                  <td className="h-10 px-4 text-right">
                    {v.status === 'archived' && (
                      <button
                        onClick={() => rollbackMutation.mutate()}
                        disabled={rollbackMutation.isPending}
                        className="h-7 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors inline-flex items-center gap-1.5"
                      >
                        <History className="w-3.5 h-3.5" />
                        Rollback
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center border border-line rounded-md bg-surface-alt">
          <History className="w-8 h-8 text-ink-muted mx-auto mb-2" />
          <p className="text-sm text-ink-secondary">No version history available</p>
        </div>
      )}
    </div>
  );
}

// ── Tab: Steps View (with drag-handle reordering) ───────────────────────────

function WorkflowStepsView({ workflowId, status }: { workflowId: string; status: WorkflowStatus }) {
  const { data: workflowData, isLoading } = useWorkflowDetail(workflowId);
  const addStepMutation = useAddWorkflowStep(workflowId);
  const deleteStepMutation = useDeleteWorkflowStep(workflowId);
  const reorderMutation = useReorderWorkflowSteps(workflowId);
  const simulateMutation = useSimulateWorkflow(workflowId);

  const steps = workflowData?.steps ?? [];
  const isEditable = status === 'draft';

  const [isAddStepOpen, setIsAddStepOpen] = useState(false);
  const [isEditStepOpen, setIsEditStepOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<WorkflowStep | null>(null);
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);

  // Drag-and-drop reordering
  const handleDragStart = useCallback(
    (index: number) => {
      (window as unknown as Record<string, number>).dragIndex = index;
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (dropIndex: number) => {
      const dragIndex = (window as unknown as Record<string, number>).dragIndex;
      if (dragIndex === undefined || dragIndex === dropIndex || !isEditable) return;

      const reorderedSteps = [...steps];
      const [movedStep] = reorderedSteps.splice(dragIndex, 1);
      reorderedSteps.splice(dropIndex, 0, movedStep);

      // Calculate new step_order values
      const updates = reorderedSteps.map((step, idx) => ({
        step_id: step._id,
        step_order: idx,
      }));

      reorderMutation.mutate({ steps: updates });
    },
    [steps, isEditable, reorderMutation]
  );

  if (isLoading) return <TableSkeleton rows={4} columns={4} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-secondary">
          Steps execute sequentially in order. Drag to reorder.
        </p>
        <div className="flex items-center gap-2">
          {isEditable && (
            <button
              onClick={() => setIsAddStepOpen(true)}
              className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Step
            </button>
          )}
          <button
            onClick={() => setIsSimulateModalOpen(true)}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors flex items-center gap-2"
          >
            <FlaskConical className="w-4 h-4" />
            Simulate
          </button>
        </div>
      </div>

      {steps.length === 0 ? (
        <div className="p-8 text-center border border-line rounded-md bg-surface-alt">
          <GitBranch className="w-8 h-8 text-ink-muted mx-auto mb-2" />
          <p className="text-sm text-ink-secondary mb-1">No steps configured</p>
          {isEditable && (
            <p className="text-xs text-ink-muted">
              Click "Add Step" to define actions for this workflow.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col relative">
          {/* Start Node */}
          <div className="flex items-center gap-3 p-3 bg-surface-alt border border-line rounded-md border-dashed opacity-80">
            {isEditable && <div className="w-4 flex-shrink-0" />}
            <span className="h-6 w-6 flex items-center justify-center rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold flex-shrink-0 border border-emerald-200">
              S
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">Start: {workflowData?.trigger}</p>
              <p className="text-xs text-ink-secondary">Workflow is triggered</p>
            </div>
          </div>

          {/* Connective Line */}
          <div className="w-0.5 h-3 bg-line ml-[3.25rem]" />

          <div className="space-y-2">
            {steps.map((step, index) => (
              <div
                key={step._id}
                draggable={isEditable}
                onDragStart={isEditable ? () => handleDragStart(index) : undefined}
                onDragOver={isEditable ? handleDragOver : undefined}
                onDrop={isEditable ? () => handleDrop(index) : undefined}
                className={cn(
                  'flex items-center gap-3 p-3 bg-white border border-line rounded-md transition-colors',
                  isEditable ? 'cursor-grab hover:bg-surface-alt' : 'cursor-default'
                )}
              >
                {/* Drag handle */}
                {isEditable && (
                  <div className="text-ink-muted flex-shrink-0">
                    <GripVertical className="w-4 h-4" />
                  </div>
                )}

                {/* Step order badge */}
                <span className="h-6 w-6 flex items-center justify-center rounded-full bg-surface-alt text-xs font-semibold text-ink-secondary flex-shrink-0 border border-line">
                  {index + 1}
                </span>

                {/* Step info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink flex items-center gap-2">
                    {step.name}
                    {step.conditions && step.conditions.length > 0 && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">
                        Conditional
                      </span>
                    )}
                    {step.action_type === 'require_approval' && step.action_config && (step.action_config.escalations as unknown[])?.length > 0 && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200">
                        Escalation
                      </span>
                    )}
                    {step.sla_config && step.sla_config.threshold_minutes > 0 && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200">
                        SLA: {step.sla_config.threshold_minutes}m
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-secondary">
                    {ACTION_TYPE_LABELS[step.action_type]}
                    {step.description && ` — ${step.description}`}
                  </p>
                </div>

                {/* Actions (editable only) */}
                {isEditable && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => { setEditingStep(step); setIsEditStepOpen(true); }}
                      className="h-7 w-7 flex items-center justify-center rounded text-ink-secondary hover:text-primary hover:bg-primary-light transition-colors"
                      aria-label="Edit step"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteStepMutation.mutate({ step_id: step._id })}
                      className="h-7 w-7 flex items-center justify-center rounded text-ink-secondary hover:text-error hover:bg-error-light transition-colors"
                      aria-label="Delete step"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Connective Line */}
          <div className="w-0.5 h-3 bg-line ml-[3.25rem]" />

          {/* End Node */}
          <div className="flex items-center gap-3 p-3 bg-surface-alt border border-line rounded-md border-dashed opacity-80">
            {isEditable && <div className="w-4 flex-shrink-0" />}
            <span className="h-6 w-6 flex items-center justify-center rounded-full bg-error-light text-error text-xs font-semibold flex-shrink-0 border border-error/30">
              E
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">End</p>
              <p className="text-xs text-ink-secondary">Workflow execution completes</p>
            </div>
          </div>
        </div>
      )}

      {/* Add Step Modal */}
      {isAddStepOpen && (
        <AddStepModal
          isOpen={isAddStepOpen}
          onClose={() => setIsAddStepOpen(false)}
          addMutation={addStepMutation}
          currentStepCount={steps.length}
        />
      )}

      {/* Edit Step Modal */}
      {isEditStepOpen && editingStep && (
        <EditStepModal
          isOpen={isEditStepOpen}
          onClose={() => {
            setIsEditStepOpen(false);
            setEditingStep(null);
          }}
          workflowId={workflowId}
          step={editingStep}
        />
      )}

      {/* Simulate Modal */}
      {isSimulateModalOpen && (
        <SimulateWorkflowModal
          isOpen={isSimulateModalOpen}
          onClose={() => setIsSimulateModalOpen(false)}
          simulateMutation={simulateMutation}
          workflow={workflowData!}
        />
      )}
    </div>
  );
}

// ── Add Step Modal ──────────────────────────────────────────────────────────

interface AddStepModalProps {
  isOpen: boolean;
  onClose: () => void;
  addMutation: ReturnType<typeof useAddWorkflowStep>;
  currentStepCount: number;
}

function AddStepModal({ isOpen, onClose, addMutation, currentStepCount }: AddStepModalProps) {

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    action_type: 'send_email' as WorkflowActionType,
    approver_user_ids: [] as string[],
    approval_condition: 'any' as 'any' | 'all',
    conditions: [] as { field: string; operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than'; value: string }[],
    escalation_timeout_hours: '',
    escalation_fallback_ids: [] as string[],
    sla_threshold_minutes: '',
    sla_notify_on_breach: false,
  });

  const handleSubmit = () => {
    addMutation.mutate(
      {
        name: formData.name,
        description: formData.description || undefined,
        action_type: formData.action_type,
        action_config: formData.action_type === 'require_approval' 
          ? { 
              approver_user_ids: formData.approver_user_ids,
              approval_condition: formData.approval_condition,
              escalations: formData.escalation_timeout_hours ? [{
                timeout_hours: parseInt(formData.escalation_timeout_hours, 10),
                fallback_approver_ids: formData.escalation_fallback_ids,
                notify_fallback: true
              }] : [],
            } 
          : {},
        conditions: formData.conditions,
        step_order: currentStepCount,
        sla_config: formData.sla_threshold_minutes ? {
          threshold_minutes: parseInt(formData.sla_threshold_minutes, 10),
          notify_on_breach: formData.sla_notify_on_breach,
        } : undefined,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Workflow Step"
      description="Define the action this step will execute."
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={addMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={addMutation.isPending || !formData.name}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {addMutation.isPending ? 'Adding...' : 'Add Step'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">
            Step Name <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Send termination email"
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">
            Description (optional)
          </label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            placeholder="What does this step do?"
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">
            Action Type <span className="text-error">*</span>
          </label>
          <select
            value={formData.action_type}
            onChange={(e) =>
              setFormData({
                ...formData,
                action_type: e.target.value as WorkflowActionType,
              })
            }
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          >
            {Object.entries(ACTION_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {formData.action_type === 'require_approval' && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-ink block mb-1.5">
                Approvers <span className="text-error">*</span>
              </label>
              <MultiUserSelect
                value={formData.approver_user_ids}
                onChange={(values) => setFormData({ ...formData, approver_user_ids: values })}
                placeholder="Select specific users..."
                onlyActive={true}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink block mb-1.5">
                Approval Condition <span className="text-error">*</span>
              </label>
              <select
                value={formData.approval_condition}
                onChange={(e) => setFormData({ ...formData, approval_condition: e.target.value as 'any' | 'all' })}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              >
                <option value="any">Any one approves (First responder decides)</option>
                <option value="all">All must approve (Everyone must approve)</option>
              </select>
              <p className="text-xs text-ink-muted mt-1">
                {formData.approval_condition === 'any' 
                  ? 'The workflow will proceed as soon as any assigned user approves. A single rejection will reject the step.' 
                  : 'The workflow will only proceed when all assigned users approve. A single rejection will reject the step.'}
              </p>
            </div>
            <div className="pt-4 border-t border-line">
              <label className="text-sm font-medium text-ink block mb-1.5">
                Escalation Rules (optional)
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-ink-secondary block mb-1">
                    Timeout (Hours)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 24"
                    value={formData.escalation_timeout_hours}
                    onChange={(e) => setFormData({ ...formData, escalation_timeout_hours: e.target.value })}
                    className="w-full h-8 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-secondary block mb-1">
                    Fallback Approvers
                  </label>
                  <MultiUserSelect
                    value={formData.escalation_fallback_ids}
                    onChange={(values) => setFormData({ ...formData, escalation_fallback_ids: values })}
                    placeholder="Select fallback..."
                    onlyActive={true}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-line">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-ink">
              Conditions (optional)
            </label>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, conditions: [...prev.conditions, { field: 'department_id', operator: 'equals', value: '' }] }))}
              className="text-xs font-medium text-primary hover:text-primary-hover"
            >
              + Add Condition
            </button>
          </div>
          {formData.conditions.length > 0 && (
            <div className="space-y-2 mb-2">
              {formData.conditions.map((cond, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Field (e.g. department_id)"
                    value={cond.field}
                    onChange={(e) => {
                      const newConds = [...formData.conditions];
                      newConds[idx].field = e.target.value;
                      setFormData({ ...formData, conditions: newConds });
                    }}
                    className="flex-1 h-8 px-2 text-xs rounded border border-line focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                  <select
                    value={cond.operator}
                    onChange={(e) => {
                      const newConds = [...formData.conditions];
                      newConds[idx].operator = e.target.value as any;
                      setFormData({ ...formData, conditions: newConds });
                    }}
                    className="w-24 h-8 px-2 text-xs rounded border border-line focus:ring-1 focus:ring-primary focus:border-primary"
                  >
                    <option value="equals">Equals</option>
                    <option value="not_equals">Not Equals</option>
                    <option value="contains">Contains</option>
                    <option value="greater_than">Greater</option>
                    <option value="less_than">Less</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Value"
                    value={cond.value}
                    onChange={(e) => {
                      const newConds = [...formData.conditions];
                      newConds[idx].value = e.target.value;
                      setFormData({ ...formData, conditions: newConds });
                    }}
                    className="flex-1 h-8 px-2 text-xs rounded border border-line focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newConds = formData.conditions.filter((_, i) => i !== idx);
                      setFormData({ ...formData, conditions: newConds });
                    }}
                    className="text-ink-secondary hover:text-error px-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-line">
          <label className="text-sm font-medium text-ink block mb-1.5">
            SLA Configuration (optional)
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-ink-secondary block mb-1">
                Threshold (Minutes)
              </label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 15"
                value={formData.sla_threshold_minutes}
                onChange={(e) => setFormData({ ...formData, sla_threshold_minutes: e.target.value })}
                className="w-full h-8 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              />
            </div>
            <div className="flex items-center mt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.sla_notify_on_breach}
                  onChange={(e) => setFormData({ ...formData, sla_notify_on_breach: e.target.checked })}
                  className="rounded border-line text-primary focus:ring-primary"
                />
                <span className="text-xs text-ink">Notify Admin on Breach</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Edit Step Modal ─────────────────────────────────────────────────────────

interface EditStepModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string;
  step: WorkflowStep;
}

function EditStepModal({ isOpen, onClose, workflowId, step }: EditStepModalProps) {
  const updateMutation = useUpdateWorkflowStep(workflowId, step._id);

  const [formData, setFormData] = useState({
    name: step.name,
    description: step.description || '',
    action_type: step.action_type,
    approver_user_ids: (step.action_config?.approver_user_ids as string[]) || [],
    approval_condition: (step.action_config?.approval_condition as 'any' | 'all') || 'any',
    conditions: step.conditions || [],
    escalation_timeout_hours: (step.action_config?.escalations as any[])?.[0]?.timeout_hours?.toString() || '',
    escalation_fallback_ids: (step.action_config?.escalations as any[])?.[0]?.fallback_approver_ids || [],
    sla_threshold_minutes: step.sla_config?.threshold_minutes?.toString() || '',
    sla_notify_on_breach: step.sla_config?.notify_on_breach || false,
  });

  const handleSubmit = () => {
    updateMutation.mutate(
      {
        name: formData.name,
        description: formData.description || undefined,
        action_type: formData.action_type,
        action_config: formData.action_type === 'require_approval' 
          ? { 
              approver_user_ids: formData.approver_user_ids,
              approval_condition: formData.approval_condition,
              escalations: formData.escalation_timeout_hours ? [{
                timeout_hours: parseInt(formData.escalation_timeout_hours, 10),
                fallback_approver_ids: formData.escalation_fallback_ids,
                notify_fallback: true
              }] : [],
            } 
          : {},
        conditions: formData.conditions,
        sla_config: formData.sla_threshold_minutes ? {
          threshold_minutes: parseInt(formData.sla_threshold_minutes, 10),
          notify_on_breach: formData.sla_notify_on_breach,
        } : undefined,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Workflow Step"
      description="Modify the details and actions of this step."
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={updateMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={updateMutation.isPending || !formData.name}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">
            Step Name <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Send termination email"
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">
            Description (optional)
          </label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          />
        </div>

        <div className="border-t border-line pt-4">
          <label className="text-sm font-medium text-ink block mb-1.5">
            Action Type <span className="text-error">*</span>
          </label>
          <select
            value={formData.action_type}
            onChange={(e) => setFormData({ ...formData, action_type: e.target.value as WorkflowActionType })}
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="send_email">Send Email</option>
            <option value="assign_role">Assign Role</option>
            <option value="remove_role">Remove Role</option>
            <option value="require_approval">Require Approval</option>
            <option value="webhook">Trigger Webhook</option>
          </select>
        </div>

        {formData.action_type === 'require_approval' && (
          <div className="space-y-4 bg-surface-alt p-4 rounded-md border border-line">
            <div>
              <label className="text-sm font-medium text-ink block mb-1.5">Approvers (Users) <span className="text-error">*</span></label>
              <MultiUserSelect
                value={formData.approver_user_ids}
                onChange={(ids) => setFormData({ ...formData, approver_user_ids: ids })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink block mb-1.5">Approval Condition</label>
              <select
                value={formData.approval_condition}
                onChange={(e) => setFormData({ ...formData, approval_condition: e.target.value as 'any' | 'all' })}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink"
              >
                <option value="any">Any approver can approve</option>
                <option value="all">All approvers must approve</option>
              </select>
            </div>
            <div className="border-t border-line pt-4">
              <label className="text-sm font-medium text-ink block mb-1.5">Escalation Timeout (Hours)</label>
              <input
                type="number"
                min="0"
                value={formData.escalation_timeout_hours}
                onChange={(e) => setFormData({ ...formData, escalation_timeout_hours: e.target.value })}
                placeholder="e.g., 48"
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink mb-3"
              />
              {formData.escalation_timeout_hours && (
                <div>
                  <label className="text-sm font-medium text-ink block mb-1.5">Fallback Approvers</label>
                  <MultiUserSelect
                    value={formData.escalation_fallback_ids}
                    onChange={(ids) => setFormData({ ...formData, escalation_fallback_ids: ids })}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-line pt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-ink">Conditions</label>
            <button
              onClick={() => setFormData({
                ...formData,
                conditions: [...formData.conditions, { field: '', operator: 'equals', value: '' }]
              })}
              className="text-xs font-medium text-primary hover:text-primary-hover flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add Condition
            </button>
          </div>
          {formData.conditions.length === 0 ? (
            <p className="text-xs text-ink-muted italic">Always execute this step.</p>
          ) : (
            <div className="space-y-2">
              {formData.conditions.map((cond: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Field (e.g. user.department)"
                    value={cond.field}
                    onChange={(e) => {
                      const newConds = [...formData.conditions];
                      newConds[idx].field = e.target.value;
                      setFormData({ ...formData, conditions: newConds });
                    }}
                    className="flex-1 h-8 px-2 text-xs rounded border border-line bg-white"
                  />
                  <select
                    value={cond.operator}
                    onChange={(e) => {
                      const newConds = [...formData.conditions];
                      newConds[idx].operator = e.target.value as any;
                      setFormData({ ...formData, conditions: newConds });
                    }}
                    className="w-24 h-8 px-2 text-xs rounded border border-line bg-white"
                  >
                    <option value="equals">Equals</option>
                    <option value="not_equals">Not Equals</option>
                    <option value="contains">Contains</option>
                    <option value="greater_than">Greater</option>
                    <option value="less_than">Less</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Value"
                    value={cond.value}
                    onChange={(e) => {
                      const newConds = [...formData.conditions];
                      newConds[idx].value = e.target.value;
                      setFormData({ ...formData, conditions: newConds });
                    }}
                    className="flex-1 h-8 px-2 text-xs rounded border border-line bg-white"
                  />
                  <button
                    onClick={() => {
                      const newConds = [...formData.conditions];
                      newConds.splice(idx, 1);
                      setFormData({ ...formData, conditions: newConds });
                    }}
                    className="p-1.5 text-ink-muted hover:text-error rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-line pt-4">
          <h4 className="text-sm font-medium text-ink mb-3">Step SLA</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-ink-secondary block mb-1">
                Threshold (minutes)
              </label>
              <input
                type="number"
                min="0"
                value={formData.sla_threshold_minutes}
                onChange={(e) => setFormData({ ...formData, sla_threshold_minutes: e.target.value })}
                placeholder="e.g., 60 for 1h"
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>
            <div className="flex items-center mt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.sla_notify_on_breach}
                  onChange={(e) => setFormData({ ...formData, sla_notify_on_breach: e.target.checked })}
                  className="rounded border-line text-primary focus:ring-primary"
                />
                <span className="text-sm text-ink">Notify on Breach</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Simulate Workflow Modal ─────────────────────────────────────────────────────

interface SimulateWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  simulateMutation: ReturnType<typeof useSimulateWorkflow>;
  workflow: Workflow;
}

function SimulateWorkflowModal({ isOpen, onClose, simulateMutation, workflow }: SimulateWorkflowModalProps) {
  const [formData, setFormData] = useState({
    user_id: '',
    user_name: '',
    user_email: '',
    lifecycle_from: 'active',
    lifecycle_to: 'terminated',
    role_from: '',
    role_to: '',
    department_from: '',
    department_to: '',
  });

  const [simulationResult, setSimulationResult] = useState<WorkflowSimulationResult | null>(null);

  const { data: users } = useUsers();

  const handleUserChange = (userId: string) => {
    const user = users?.find(u => u._id === userId);
    if (user) {
      setFormData({
        ...formData,
        user_id: userId,
        user_name: user.full_name,
        user_email: user.email,
      });
    } else {
      setFormData({
        ...formData,
        user_id: '',
        user_name: '',
        user_email: '',
      });
    }
  };

  const handleSubmit = () => {
    simulateMutation.mutate({
      ...formData,
      trigger: workflow.trigger
    }, { 
      onSuccess: (res) => {
        setSimulationResult(res);
      }
    });
  };

  if (simulationResult) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Simulation Results"
        description="Review the execution path based on sample inputs."
        size="md"
        footer={
          <button
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors ml-auto"
          >
            Close
          </button>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-4 mb-4 border-b border-line pb-4">
            <div className="flex-1 text-center border-r border-line">
               <p className="text-xl font-semibold text-ink">{simulationResult.stepsEvaluated}</p>
               <p className="text-xs text-ink-secondary uppercase">Evaluated</p>
            </div>
            <div className="flex-1 text-center border-r border-line">
               <p className="text-xl font-semibold text-emerald-600">{simulationResult.stepsTriggered}</p>
               <p className="text-xs text-emerald-600/80 uppercase">Triggered</p>
            </div>
            <div className="flex-1 text-center">
               <p className="text-xl font-semibold text-ink-secondary">{simulationResult.stepsSkipped}</p>
               <p className="text-xs text-ink-muted uppercase">Skipped</p>
            </div>
          </div>
          
          <div className="relative border-l-2 border-line ml-3 space-y-6 pb-2">
            {simulationResult.stepResults.map((result, idx) => (
              <div key={idx} className="relative pl-6">
                <div className={cn("absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-white", result.executed ? "bg-emerald-500" : "bg-line-strong")} />
                <p className="text-sm font-semibold text-ink">{result.stepName}</p>
                <p className="text-xs font-mono bg-surface-alt px-1.5 py-0.5 rounded text-ink-secondary inline-block mt-1 mb-1.5">{result.actionType}</p>
                <div className={cn("text-xs p-2 rounded-md border", result.executed ? "bg-emerald-50 text-emerald-800 border-emerald-100" : "bg-surface-alt text-ink-secondary border-line")}>
                  {result.reason}
                </div>
              </div>
            ))}
            {simulationResult.stepResults.length === 0 && (
              <p className="text-sm text-ink-muted pl-6">No steps evaluated.</p>
            )}
          </div>
          
          <button onClick={() => setSimulationResult(null)} className="text-xs font-medium text-primary mt-2 hover:underline">
            ← Back to Configuration
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Simulate Workflow"
      description="Simulate this workflow with a mock payload to verify conditions without affecting real data."
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={simulateMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              simulateMutation.isPending ||
              !formData.user_id ||
              !formData.user_name ||
              !formData.user_email
            }
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            {simulateMutation.isPending ? 'Simulating...' : 'Run Simulation'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">
              Select User <span className="text-error">*</span>
            </label>
            <UserSelect
              value={formData.user_id}
              onChange={handleUserChange}
              placeholder="Select a mock user..."
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">
              User Name <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={formData.user_name}
              onChange={(e) =>
                setFormData({ ...formData, user_name: e.target.value })
              }
              placeholder="e.g., John Doe"
              readOnly
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-black/5 text-ink-muted placeholder:text-ink-muted focus:outline-none cursor-not-allowed"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">
            User Email <span className="text-error">*</span>
          </label>
          <input
            type="email"
            value={formData.user_email}
            onChange={(e) =>
              setFormData({ ...formData, user_email: e.target.value })
            }
            placeholder="john@example.com"
            readOnly
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-black/5 text-ink-muted placeholder:text-ink-muted focus:outline-none cursor-not-allowed"
          />
        </div>

        {workflow.trigger === 'user.lifecycle_changed' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-ink block mb-1.5">
                Lifecycle From <span className="text-error">*</span>
              </label>
              <select
                value={formData.lifecycle_from}
                onChange={(e) =>
                  setFormData({ ...formData, lifecycle_from: e.target.value })
                }
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              >
                {LIFECYCLE_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-ink block mb-1.5">
                Lifecycle To <span className="text-error">*</span>
              </label>
              <select
                value={formData.lifecycle_to}
                onChange={(e) =>
                  setFormData({ ...formData, lifecycle_to: e.target.value })
                }
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              >
                {LIFECYCLE_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {workflow.trigger === 'user.role_changed' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-ink block mb-1.5">Role From</label>
              <input type="text" value={formData.role_from} onChange={(e) => setFormData({...formData, role_from: e.target.value})} placeholder="e.g. Employee" className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink" />
            </div>
            <div>
              <label className="text-sm font-medium text-ink block mb-1.5">Role To</label>
              <input type="text" value={formData.role_to} onChange={(e) => setFormData({...formData, role_to: e.target.value})} placeholder="e.g. Manager" className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink" />
            </div>
          </div>
        )}

        {workflow.trigger === 'user.department_changed' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-ink block mb-1.5">Department From</label>
              <input type="text" value={formData.department_from} onChange={(e) => setFormData({...formData, department_from: e.target.value})} placeholder="e.g. Engineering" className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink" />
            </div>
            <div>
              <label className="text-sm font-medium text-ink block mb-1.5">Department To</label>
              <input type="text" value={formData.department_to} onChange={(e) => setFormData({...formData, department_to: e.target.value})} placeholder="e.g. Sales" className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink" />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Tab: Run History View ───────────────────────────────────────────────────

function WorkflowRunsView({ workflowId }: { workflowId: string }) {
  const { data: runs, isLoading } = useWorkflowRuns(workflowId);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (runId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(runId)) {
      newExpanded.delete(runId);
    } else {
      newExpanded.add(runId);
    }
    setExpandedRows(newExpanded);
  };

  if (isLoading) return <TableSkeleton rows={4} columns={7} />;

  return (
    <div className="space-y-3">
      {runs && runs.length > 0 ? (
        <div className="border border-line rounded-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-white/5 border-b border-line">
              <tr>
                <th className="w-10 px-4 text-left h-10"></th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Status
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  SLA
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Triggered By
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Steps
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Duration
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Executed
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run: WorkflowRun) => {
                const statusConfig = RUN_STATUS_ICONS[run.status] ?? {
                  icon: <Clock className="w-3.5 h-3.5" />,
                  color: 'text-ink-secondary',
                  label: run.status,
                };
                const isExpanded = expandedRows.has(run._id);
                return (
                  <Fragment key={run._id}>
                    <tr 
                      className={cn(
                        "border-b border-line cursor-pointer transition-colors",
                        isExpanded ? 'bg-primary-light' : 'hover:bg-surface-alt'
                      )}
                      onClick={() => toggleRow(run._id)}
                    >
                      <td className="h-10 px-4 w-10">
                        <button
                          className="h-6 w-6 flex items-center justify-center rounded hover:bg-surface-alt transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-ink" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-ink-secondary" />
                          )}
                        </button>
                      </td>
                      <td className="h-10 px-4">
                        <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', statusConfig.color)}>
                          {statusConfig.icon}
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="h-10 px-4 text-sm text-ink">
                        {run.sla_status === 'breached' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-error/10 text-error border border-error/20 rounded-full px-2.5 py-0.5">
                            Breached
                          </span>
                        ) : run.sla_status === 'ok' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-success-light text-success border border-success/20 rounded-full px-2.5 py-0.5">
                            Met
                          </span>
                        ) : (
                          <span className="text-ink-secondary text-xs">-</span>
                        )}
                      </td>
                      <td className="h-10 px-4 text-sm text-ink">
                        {run.triggered_by_label}
                      </td>
                      <td className="h-10 px-4 text-sm text-ink-secondary">
                        {run.steps_succeeded}/{run.steps_executed}
                        {run.steps_failed > 0 && (
                          <span className="text-error ml-1">
                            ({run.steps_failed} failed)
                          </span>
                        )}
                      </td>
                      <td className="h-10 px-4 text-sm text-ink-secondary font-mono">
                        {run.execution_time_ms}ms
                      </td>
                      <td className="h-10 px-4 text-sm text-ink-secondary">
                        {formatDate(run.created_at)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-surface-alt border-b border-line">
                        <td colSpan={7} className="p-0">
                          <div className="p-4 border-l-2 border-primary ml-4 my-4 bg-surface rounded-r-md">
                            <h4 className="text-xs font-medium text-ink mb-3 uppercase tracking-wider">Step Execution History</h4>
                            {run.step_results && run.step_results.length > 0 ? (
                              <div className="space-y-3">
                                {run.step_results.map((step, index) => (
                                  <div key={step.step_id || index} className="flex items-start gap-3">
                                    <div className="w-5 h-5 rounded-full border border-line flex items-center justify-center bg-surface-alt shrink-0 mt-0.5">
                                      <span className="text-[10px] text-ink-secondary">{index + 1}</span>
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-ink">{step.step_name || step.action_type}</span>
                                        <span className={cn(
                                          'text-xs font-medium px-2 py-0.5 rounded-full',
                                          step.status === 'success' ? 'bg-success-light text-success' :
                                          step.status === 'failure' ? 'bg-error/10 text-error' :
                                          step.status === 'skipped' ? 'bg-surface-alt text-ink-secondary' :
                                          'bg-warning/10 text-warning'
                                        )}>
                                          {step.status}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-4 mt-1">
                                        <span className="text-xs text-ink-secondary font-mono">{step.execution_time_ms}ms</span>
                                        <span className="text-xs text-ink-secondary">{step.started_at ? formatDate(step.started_at) : '-'}</span>
                                        {step.sla_breached && (
                                          <span className="text-xs text-error font-medium">SLA Breached</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-ink-secondary italic">No step history available for this run.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center border border-line rounded-md bg-surface-alt">
          <History className="w-8 h-8 text-ink-muted mx-auto mb-2" />
          <p className="text-sm text-ink-secondary mb-1">No executions yet</p>
          <p className="text-xs text-ink-muted">
            Runs will appear here when the workflow is triggered.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Tab: Config View ────────────────────────────────────────────────────────

function WorkflowConfigView({ workflow }: { workflow: Workflow }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-ink-secondary mb-1">Name</p>
          <p className="text-sm font-medium text-ink">{workflow.name}</p>
        </div>
        <div>
          <p className="text-xs text-ink-secondary mb-1">Status</p>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className={cn("w-1.5 h-1.5 rounded-full", STATUS_COLORS[workflow.status || 'draft'])} />
              <span className="text-sm font-medium text-ink-secondary">{STATUS_LABELS[workflow.status || 'draft']}</span>
            </div>
            <span className="text-xs font-medium text-ink-secondary border border-line rounded-full px-2 py-0.5">
              v{workflow.version_number || 1}
            </span>
          </div>
        </div>
      </div>

      {workflow.description && (
        <div>
          <p className="text-xs text-ink-secondary mb-1">Description</p>
          <p className="text-sm text-ink">{workflow.description}</p>
        </div>
      )}

      <div>
        <p className="text-xs text-ink-secondary mb-1">Trigger</p>
        <span className="text-xs font-mono text-accent bg-accent-light px-2 py-0.5 rounded">
          {workflow.trigger}
        </span>
      </div>

      {workflow.trigger === 'user.lifecycle_changed' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-ink-secondary mb-1.5">Trigger From (source states)</p>
            <div className="flex flex-wrap gap-1.5">
              {workflow.trigger_config.lifecycle_from?.map((state) => (
                <span key={state} className="h-6 px-2 text-xs font-medium rounded-full bg-primary-light text-primary border border-primary/20">{state}</span>
              ))}
              {!workflow.trigger_config.lifecycle_from?.length && <span className="text-xs text-ink-secondary italic">Any</span>}
            </div>
          </div>
          <div>
            <p className="text-xs text-ink-secondary mb-1.5">Trigger To (target states)</p>
            <div className="flex flex-wrap gap-1.5">
              {workflow.trigger_config.lifecycle_to?.map((state) => (
                <span key={state} className="h-6 px-2 text-xs font-medium rounded-full bg-accent-light text-accent border border-accent/20">{state}</span>
              ))}
              {!workflow.trigger_config.lifecycle_to?.length && <span className="text-xs text-ink-secondary italic">Any</span>}
            </div>
          </div>
        </div>
      )}

      {workflow.trigger === 'user.role_changed' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-ink-secondary mb-1.5">From Role IDs</p>
            <div className="flex flex-wrap gap-1.5">
              {workflow.trigger_config.role_from?.map((role) => (
                <span key={role} className="h-6 px-2 text-xs font-medium rounded-full bg-primary-light text-primary border border-primary/20">{role}</span>
              ))}
              {!workflow.trigger_config.role_from?.length && <span className="text-xs text-ink-secondary italic">Any Role</span>}
            </div>
          </div>
          <div>
            <p className="text-xs text-ink-secondary mb-1.5">To Role IDs</p>
            <div className="flex flex-wrap gap-1.5">
              {workflow.trigger_config.role_to?.map((role) => (
                <span key={role} className="h-6 px-2 text-xs font-medium rounded-full bg-accent-light text-accent border border-accent/20">{role}</span>
              ))}
              {!workflow.trigger_config.role_to?.length && <span className="text-xs text-ink-secondary italic">Any Role</span>}
            </div>
          </div>
        </div>
      )}

      {workflow.trigger === 'user.department_changed' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-ink-secondary mb-1.5">From Department IDs</p>
            <div className="flex flex-wrap gap-1.5">
              {workflow.trigger_config.department_from?.map((dept) => (
                <span key={dept} className="h-6 px-2 text-xs font-medium rounded-full bg-primary-light text-primary border border-primary/20">{dept}</span>
              ))}
              {!workflow.trigger_config.department_from?.length && <span className="text-xs text-ink-secondary italic">Any Department</span>}
            </div>
          </div>
          <div>
            <p className="text-xs text-ink-secondary mb-1.5">To Department IDs</p>
            <div className="flex flex-wrap gap-1.5">
              {workflow.trigger_config.department_to?.map((dept) => (
                <span key={dept} className="h-6 px-2 text-xs font-medium rounded-full bg-accent-light text-accent border border-accent/20">{dept}</span>
              ))}
              {!workflow.trigger_config.department_to?.length && <span className="text-xs text-ink-secondary italic">Any Department</span>}
            </div>
          </div>
        </div>
      )}

      {workflow.sla_config && (
        <div className="pt-4 border-t border-line">
          <p className="text-sm font-medium text-ink mb-3">SLA Configuration</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-ink-secondary mb-1">Threshold</p>
              <p className="text-sm text-ink">{workflow.sla_config.threshold_minutes} minutes</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary mb-1">Alerts</p>
              <p className="text-sm text-ink">{workflow.sla_config.notify_on_breach ? 'Enabled' : 'Disabled'}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm border-t border-line pt-4">
        <div>
          <p className="text-xs text-ink-secondary mb-1">Created By</p>
          <p className="text-sm text-ink">
            {workflow.created_by?.full_name ?? 'Unknown'}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-secondary mb-1">Created At</p>
          <p className="text-sm text-ink">{formatDate(workflow.created_at)}</p>
        </div>
      </div>
    </div>
  );
}

