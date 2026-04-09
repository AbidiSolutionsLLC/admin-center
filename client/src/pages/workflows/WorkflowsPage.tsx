// src/pages/workflows/WorkflowsPage.tsx
import { useState, useMemo, useCallback } from 'react';
import {
  GitBranch, Plus, Eye, Play, Power, PowerOff, Trash2, Search, X,
  ChevronDown, GripVertical, Save, FlaskConical, History, AlertTriangle,
  CheckCircle, XCircle, Clock, Edit2,
} from 'lucide-react';
import {
  useWorkflows,
  useCreateWorkflow,
  useUpdateWorkflow,
  useEnableWorkflow,
  useDisableWorkflow,
  useDeleteWorkflow,
  useWorkflowDetail,
  useAddWorkflowStep,
  useDeleteWorkflowStep,
  useReorderWorkflowSteps,
  useWorkflowRuns,
  useTestWorkflow,
} from '@/features/workflows/hooks/useWorkflows';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatDate';
import type {
  Workflow,
  WorkflowStatus,
  WorkflowTrigger,
  WorkflowActionType,
  WorkflowStep,
  WorkflowRun,
} from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: 'Draft',
  enabled: 'Enabled',
  disabled: 'Disabled',
};

const STATUS_COLORS: Record<WorkflowStatus, string> = {
  draft: 'bg-sky-50 text-sky-700 border-sky-200',
  enabled: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  disabled: 'bg-surface-alt text-ink-secondary border-line',
};

const ACTION_TYPE_LABELS: Record<WorkflowActionType, string> = {
  send_email: 'Send Email',
  assign_role: 'Assign Role',
  revoke_access: 'Revoke Access',
  notify_manager: 'Notify Manager',
  update_field: 'Update Field',
  create_task: 'Create Task',
  webhook: 'Webhook',
};

const LIFECYCLE_STATES = [
  'invited', 'onboarding', 'active', 'probation', 'on_leave', 'terminated', 'archived',
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
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'steps' | 'runs' | 'config'>('steps');

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
                <thead className="bg-[#F7F8FA] border-b border-line">
                  <tr>
                    <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                      Workflow
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
                      onEnable={() => enableMutation.mutate()}
                      onDisable={() => disableMutation.mutate()}
                      onDelete={() => deleteMutation.mutate({ workflow_id: wf._id })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Create Workflow Modal ── */}
      <CreateWorkflowModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        createMutation={createMutation}
      />

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
  onEnable: () => void;
  onDisable: () => void;
  onDelete: () => void;
}

function WorkflowRow({ workflow, onView, onEnable, onDisable, onDelete }: WorkflowRowProps) {
  const enableMutation = useEnableWorkflow(workflow._id);
  const disableMutation = useDisableWorkflow(workflow._id);

  return (
    <tr className="border-b border-line last:border-0 hover:bg-[#F7F8FA] transition-colors duration-100">
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
      <td className="h-14 px-4 text-sm text-ink-secondary">
        <span className="text-xs font-mono text-accent bg-accent-light px-2 py-0.5 rounded">
          {workflow.trigger}
        </span>
      </td>
      <td className="h-14 px-4">
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2.5 py-0.5 tracking-wide',
            STATUS_COLORS[workflow.status]
          )}
        >
          {STATUS_LABELS[workflow.status]}
        </span>
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
            <button
              onClick={onEnable}
              disabled={enableMutation.isPending}
              className="h-7 px-2 text-xs font-medium rounded-md border border-line bg-white text-emerald-600 hover:bg-emerald-50 transition-colors inline-flex items-center gap-1 disabled:opacity-50"
              title="Enable workflow"
            >
              <Power className="w-3.5 h-3.5" />
            </button>
          )}
          {workflow.status === 'enabled' && (
            <button
              onClick={onDisable}
              disabled={disableMutation.isPending}
              className="h-7 px-2 text-xs font-medium rounded-md border border-line bg-white text-warning hover:bg-warning-light transition-colors inline-flex items-center gap-1 disabled:opacity-50"
              title="Disable workflow"
            >
              <PowerOff className="w-3.5 h-3.5" />
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
    lifecycle_from: ['active'] as string[],
    lifecycle_to: ['terminated'] as string[],
  });

  const handleSubmit = () => {
    createMutation.mutate(
      {
        name: formData.name,
        description: formData.description || undefined,
        trigger: formData.trigger,
        trigger_config: {
          lifecycle_from: formData.lifecycle_from,
          lifecycle_to: formData.lifecycle_to,
        },
      },
      {
        onSuccess: () => {
          onClose();
          setFormData({
            name: '',
            description: '',
            trigger: 'user.lifecycle_changed',
            lifecycle_from: ['active'],
            lifecycle_to: ['terminated'],
          });
        },
      }
    );
  };

  const toggleLifecycleItem = (
    field: 'lifecycle_from' | 'lifecycle_to',
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
              formData.lifecycle_from.length === 0 ||
              formData.lifecycle_to.length === 0
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
            Trigger From (source states) <span className="text-error">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {LIFECYCLE_STATES.map((state) => (
              <button
                key={`from-${state}`}
                type="button"
                onClick={() => toggleLifecycleItem('lifecycle_from', state)}
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
                onClick={() => toggleLifecycleItem('lifecycle_to', state)}
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
      </div>
    </Modal>
  );
}

// ── Workflow Detail Modal ───────────────────────────────────────────────────

interface WorkflowDetailModalProps {
  workflow: Workflow;
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'steps' | 'runs' | 'config';
  onTabChange: (tab: 'steps' | 'runs' | 'config') => void;
}

const WORKFLOW_TABS = [
  { key: 'steps' as const, label: 'Steps', icon: GitBranch },
  { key: 'runs' as const, label: 'Run History', icon: History },
  { key: 'config' as const, label: 'Config', icon: Edit2 },
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
    </Modal>
  );
}

// ── Tab: Steps View (with drag-handle reordering) ───────────────────────────

function WorkflowStepsView({ workflowId, status }: { workflowId: string; status: WorkflowStatus }) {
  const { data: workflowData, isLoading } = useWorkflowDetail(workflowId);
  const addStepMutation = useAddWorkflowStep(workflowId);
  const deleteStepMutation = useDeleteWorkflowStep(workflowId);
  const reorderMutation = useReorderWorkflowSteps(workflowId);
  const testMutation = useTestWorkflow(workflowId);

  const steps = workflowData?.steps ?? [];
  const isEditable = status === 'draft' || status === 'disabled';

  const [isAddStepOpen, setIsAddStepOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  // Drag-and-drop reordering
  const handleDragStart = useCallback(
    (index: number) => {
      (window as unknown as Record<number>).dragIndex = index;
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (dropIndex: number) => {
      const dragIndex = (window as unknown as Record<number>).dragIndex;
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
            onClick={() => setIsTestModalOpen(true)}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors flex items-center gap-2"
          >
            <FlaskConical className="w-4 h-4" />
            Test
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
        <div className="space-y-2">
          {steps.map((step, index) => (
            <div
              key={step._id}
              draggable={isEditable}
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
                <p className="text-sm font-medium text-ink">{step.name}</p>
                <p className="text-xs text-ink-secondary">
                  {ACTION_TYPE_LABELS[step.action_type]}
                  {step.description && ` — ${step.description}`}
                </p>
              </div>

              {/* Delete button (editable only) */}
              {isEditable && (
                <button
                  onClick={() => deleteStepMutation.mutate({ step_id: step._id })}
                  className="h-7 w-7 flex items-center justify-center rounded text-ink-secondary hover:text-error hover:bg-error-light transition-colors flex-shrink-0"
                  aria-label="Delete step"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
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

      {/* Test Modal */}
      {isTestModalOpen && (
        <TestWorkflowModal
          isOpen={isTestModalOpen}
          onClose={() => setIsTestModalOpen(false)}
          testMutation={testMutation}
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
  });

  const handleSubmit = () => {
    addMutation.mutate(
      {
        name: formData.name,
        description: formData.description || undefined,
        action_type: formData.action_type,
        action_config: {},
        step_order: currentStepCount,
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
      </div>
    </Modal>
  );
}

// ── Test Workflow Modal ─────────────────────────────────────────────────────

interface TestWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  testMutation: ReturnType<typeof useTestWorkflow>;
}

function TestWorkflowModal({ isOpen, onClose, testMutation }: TestWorkflowModalProps) {
  const [formData, setFormData] = useState({
    user_id: '',
    user_name: '',
    user_email: '',
    lifecycle_from: 'active',
    lifecycle_to: 'terminated',
  });

  const handleSubmit = () => {
    testMutation.mutate(formData, { onSuccess: onClose });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Test Workflow"
      description="Execute this workflow with a mock payload to verify it works."
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={testMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              testMutation.isPending ||
              !formData.user_id ||
              !formData.user_name ||
              !formData.user_email
            }
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            {testMutation.isPending ? 'Testing...' : 'Run Test'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">
              User ID <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={formData.user_id}
              onChange={(e) =>
                setFormData({ ...formData, user_id: e.target.value })
              }
              placeholder="e.g., 64f1a2b3c4d5e6f7a8b9c0d1"
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
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
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
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
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          />
        </div>

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
      </div>
    </Modal>
  );
}

// ── Tab: Run History View ───────────────────────────────────────────────────

function WorkflowRunsView({ workflowId }: { workflowId: string }) {
  const { data: runs, isLoading } = useWorkflowRuns(workflowId);

  if (isLoading) return <TableSkeleton rows={4} columns={5} />;

  return (
    <div className="space-y-3">
      {runs && runs.length > 0 ? (
        <div className="border border-line rounded-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#F7F8FA] border-b border-line">
              <tr>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Status
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
                return (
                  <tr key={run._id} className="border-b border-line last:border-0">
                    <td className="h-10 px-4">
                      <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', statusConfig.color)}>
                        {statusConfig.icon}
                        {statusConfig.label}
                      </span>
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
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2.5 py-0.5 tracking-wide',
              STATUS_COLORS[workflow.status]
            )}
          >
            {STATUS_LABELS[workflow.status]}
          </span>
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-ink-secondary mb-1.5">
            Trigger From (source states)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {workflow.trigger_config.lifecycle_from.map((state) => (
              <span
                key={state}
                className="h-6 px-2 text-xs font-medium rounded-full bg-primary-light text-primary border border-primary/20"
              >
                {state}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-ink-secondary mb-1.5">
            Trigger To (target states)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {workflow.trigger_config.lifecycle_to.map((state) => (
              <span
                key={state}
                className="h-6 px-2 text-xs font-medium rounded-full bg-accent-light text-accent border border-accent/20"
              >
                {state}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
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
