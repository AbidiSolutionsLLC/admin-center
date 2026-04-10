// src/pages/notifications/NotificationsPage.tsx
import { useState, useMemo } from 'react';
import {
  Bell, Plus, Eye, Search, X, ChevronDown, Trash2, FlaskConical,
  Mail, Monitor, AlertTriangle, CheckCircle, Clock,
} from 'lucide-react';
import {
  useNotificationTemplates,
  useCreateNotificationTemplate,
  useUpdateNotificationTemplate,
  useDeleteNotificationTemplate,
  useTestTemplate,
  useNotificationEvents,
} from '@/features/notifications/hooks/useNotifications';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatDate';
import type {
  NotificationTemplate,
  NotificationChannel,
  NotificationDigestMode,
  NotificationSeverity,
  NotificationEvent,
} from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email: 'Email',
  in_app: 'In-App',
  both: 'Email + In-App',
};

const CHANNEL_COLORS: Record<NotificationChannel, string> = {
  email: 'bg-accent-light text-accent border-accent/20',
  in_app: 'bg-sky-50 text-sky-700 border-sky-200',
  both: 'bg-violet-50 text-violet-700 border-violet-200',
};

const SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
};

const SEVERITY_COLORS: Record<NotificationSeverity, string> = {
  info: 'bg-surface-alt text-ink-secondary border-line',
  warning: 'bg-warning-light text-warning border-warning-border',
  critical: 'bg-error-light text-error border-error-border',
};

const DIGEST_LABELS: Record<NotificationDigestMode, string> = {
  immediate: 'Immediate',
  hourly: 'Hourly Digest',
  daily: 'Daily Digest',
};

const EVENT_STATUS_ICONS: Record<string, { color: string; label: string }> = {
  sent: { color: 'text-emerald-600', label: 'Sent' },
  failed: { color: 'text-error', label: 'Failed' },
  pending: { color: 'text-ink-secondary', label: 'Pending' },
  queued_digest: { color: 'text-warning', label: 'Queued' },
};

const SUPPORTED_VARIABLES = ['{{user_name}}', '{{user_email}}', '{{company_name}}', '{{detail}}'];

/**
 * NotificationsPage Component
 * Manages notification templates and views delivery logs.
 * Features:
 * - Template CRUD: create → edit → test → delete
 * - Variable substitution preview (4 tokens)
 * - Delivery event log with status tracking
 * - All mutations produce audit events
 */
export default function NotificationsPage() {
  // ── Server data ──────────────────────────────────────────────────────
  const { data: templates, isLoading, isError, refetch } = useNotificationTemplates();
  const createMutation = useCreateNotificationTemplate();
  const deleteMutation = useDeleteNotificationTemplate();

  // ── Modal state ──────────────────────────────────────────────────────
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<'templates' | 'delivery_log'>('templates');

  // ── Filters ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<NotificationChannel | ''>('');

  // ── Derived: filter templates ───────────────────────────────────────
  const filteredTemplates = useMemo(() => {
    return templates?.filter((t) => {
      const matchesSearch =
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.key.toLowerCase().includes(search.toLowerCase());
      const matchesChannel = !channelFilter || t.channel === channelFilter;
      return matchesSearch && matchesChannel;
    });
  }, [templates, search, channelFilter]);

  // ── Render: Loading ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader onCreateClick={() => setIsCreateModalOpen(true)} />
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <TableSkeleton rows={6} columns={6} />
      </div>
    );
  }

  // ── Render: Error ──────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-5">
        <PageHeader onCreateClick={() => setIsCreateModalOpen(true)} />
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <ErrorState
          title="Failed to load notifications"
          description="Something went wrong fetching notification data."
          onRetry={refetch}
        />
      </div>
    );
  }

  const hasData = templates && templates.length > 0;

  return (
    <div className="space-y-5">
      {/* ── Page Header ── */}
      <PageHeader
        onCreateClick={() => setIsCreateModalOpen(true)}
        templateCount={templates?.length}
      />

      {/* ── Tab Bar ── */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ── Templates Tab ── */}
      {activeTab === 'templates' && (
        <>
          {!hasData ? (
            <EmptyState
              icon={Bell}
              title="No notification templates yet"
              description="Create your first template to start sending notifications."
              action={{ label: 'Create Template', onClick: () => setIsCreateModalOpen(true) }}
            />
          ) : (
            <>
              {/* Filter Bar */}
              <FilterBar
                search={search}
                onSearchChange={setSearch}
                channelFilter={channelFilter}
                onChannelChange={setChannelFilter}
                activeFilterCount={[search, channelFilter].filter(Boolean).length}
                onClearFilters={() => {
                  setSearch('');
                  setChannelFilter('');
                }}
              />

              {/* Templates Table */}
              {filteredTemplates?.length === 0 ? (
                <div className="bg-white rounded-lg border border-line shadow-card p-16 text-center">
                  <Search className="w-10 h-10 text-ink-muted mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-ink mb-1">No results found</h3>
                  <p className="text-sm text-ink-secondary">Try adjusting your search or filter.</p>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-[#F7F8FA] border-b border-line">
                      <tr>
                        <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                          Template
                        </th>
                        <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                          Channel
                        </th>
                        <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                          Severity
                        </th>
                        <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                          Digest
                        </th>
                        <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                          Trigger
                        </th>
                        <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTemplates?.map((t) => (
                        <TemplateRow
                          key={t._id}
                          template={t}
                          onEdit={() => setEditingTemplate(t)}
                          onDelete={() => deleteMutation.mutate({ template_id: t._id })}
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

      {/* ── Delivery Log Tab ── */}
      {activeTab === 'delivery_log' && <DeliveryLogView />}

      {/* ── Create/Edit Modal ── */}
      {(isCreateModalOpen || editingTemplate) && (
        <TemplateFormModal
          isOpen={isCreateModalOpen || !!editingTemplate}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingTemplate(null);
          }}
          template={editingTemplate ?? undefined}
          createMutation={createMutation}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface PageHeaderProps {
  onCreateClick: () => void;
  templateCount?: number;
}

function PageHeader({ onCreateClick, templateCount }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">
          Notifications
        </h1>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-sm text-ink-secondary">
            Manage notification templates and delivery settings.
          </p>
          {templateCount !== undefined && (
            <span className="text-xs text-ink-muted">
              {templateCount} {templateCount === 1 ? 'template' : 'templates'}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onCreateClick}
        className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-2 flex-shrink-0"
      >
        <Plus className="w-4 h-4" />
        Create Template
      </button>
    </div>
  );
}

interface TabBarProps {
  activeTab: 'templates' | 'delivery_log';
  onTabChange: (tab: 'templates' | 'delivery_log') => void;
}

function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const tabs = [
    { key: 'templates' as const, label: 'Templates', icon: Bell },
    { key: 'delivery_log' as const, label: 'Delivery Log', icon: Mail },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-line">
      {tabs.map((tab) => {
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
  );
}

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  channelFilter: NotificationChannel | '';
  onChannelChange: (v: NotificationChannel | '') => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

function FilterBar({
  search, onSearchChange, channelFilter, onChannelChange, activeFilterCount, onClearFilters,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search templates..."
          className="w-full h-9 pl-9 pr-8 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
        />
        {search && (
          <button onClick={() => onSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink" aria-label="Clear search">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="relative">
        <select
          value={channelFilter}
          onChange={(e) => onChannelChange(e.target.value as NotificationChannel | '')}
          className="h-9 pl-3 pr-8 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 appearance-none cursor-pointer"
        >
          <option value="">All Channels</option>
          {Object.entries(CHANNEL_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
      </div>

      {activeFilterCount > 0 && (
        <button onClick={onClearFilters} className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors">
          Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}

interface TemplateRowProps {
  template: NotificationTemplate;
  onEdit: () => void;
  onDelete: () => void;
}

function TemplateRow({ template, onEdit, onDelete }: TemplateRowProps) {
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  return (
    <>
      <tr className="border-b border-line last:border-0 hover:bg-[#F7F8FA] transition-colors duration-100">
        <td className="h-14 px-4">
          <div>
            <p className="text-sm font-medium text-ink">{template.name}</p>
            <p className="text-xs text-ink-secondary font-mono">{template.key}</p>
          </div>
        </td>
        <td className="h-14 px-4">
          <span className={cn('inline-flex items-center text-[11px] font-semibold border rounded-full px-2.5 py-0.5 tracking-wide', CHANNEL_COLORS[template.channel])}>
            {CHANNEL_LABELS[template.channel]}
          </span>
        </td>
        <td className="h-14 px-4">
          <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2.5 py-0.5 tracking-wide', SEVERITY_COLORS[template.severity])}>
            {template.severity === 'critical' && <AlertTriangle className="w-3 h-3" />}
            {SEVERITY_LABELS[template.severity]}
          </span>
        </td>
        <td className="h-14 px-4 text-sm text-ink-secondary">
          {DIGEST_LABELS[template.digest_mode]}
        </td>
        <td className="h-14 px-4">
          <span className="text-xs font-mono text-accent bg-accent-light px-2 py-0.5 rounded">
            {template.trigger_event}
          </span>
        </td>
        <td className="h-14 px-4 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => setIsTestModalOpen(true)}
              className="h-7 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors inline-flex items-center gap-1.5"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              Test
            </button>
            <button
              onClick={onEdit}
              className="h-7 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors inline-flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              Edit
            </button>
            {!template.is_active && (
              <span className="h-7 px-2 text-[11px] text-ink-muted bg-surface-alt border border-line rounded-md flex items-center">
                Deleted
              </span>
            )}
            {template.is_active && (
              <button
                onClick={onDelete}
                className="h-7 px-2 text-xs font-medium rounded-md border border-line bg-white text-ink-secondary hover:text-error hover:border-error/30 hover:bg-error-light transition-colors inline-flex items-center gap-1"
                title="Delete template"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>

      {isTestModalOpen && (
        <TestModal
          isOpen={isTestModalOpen}
          onClose={() => setIsTestModalOpen(false)}
          templateId={template._id}
        />
      )}
    </>
  );
}

// ── Template Form Modal (Create/Edit) ───────────────────────────────────────

interface TemplateFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  template?: NotificationTemplate;
  createMutation: ReturnType<typeof useCreateNotificationTemplate>;
}

function TemplateFormModal({ isOpen, onClose, template, createMutation }: TemplateFormModalProps) {
  const updateMutation = useUpdateNotificationTemplate(template?._id ?? '');
  const isEditing = !!template;

  const [formData, setFormData] = useState({
    name: template?.name ?? '',
    key: template?.key ?? '',
    description: template?.description ?? '',
    channel: template?.channel ?? 'email' as NotificationChannel,
    severity: template?.severity ?? 'info' as NotificationSeverity,
    digest_mode: template?.digest_mode ?? 'immediate' as NotificationDigestMode,
    subject: template?.subject ?? '',
    body: template?.body ?? '',
    trigger_event: template?.trigger_event ?? '',
  });

  const handleSubmit = () => {
    if (isEditing && template) {
      updateMutation.mutate(formData, { onSuccess: onClose });
    } else {
      createMutation.mutate(formData, { onSuccess: onClose });
    }
  };

  const isPending = isEditing ? updateMutation.isPending : createMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Template' : 'Create Template'}
      description={isEditing ? 'Update notification template settings.' : 'Define a new notification template.'}
      size="xl"
      footer={
        <>
          <button onClick={onClose} disabled={isPending} className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !formData.name || !formData.key || !formData.subject || !formData.body || !formData.trigger_event}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Template'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">Name <span className="text-error">*</span></label>
            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Workflow Failure Alert" className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150" />
          </div>
          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">Key <span className="text-error">*</span></label>
            <input type="text" value={formData.key} onChange={(e) => setFormData({ ...formData, key: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '') })} placeholder="e.g., workflow_failure" className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 font-mono" />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">Description</label>
          <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Brief description" className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">Channel <span className="text-error">*</span></label>
            <select value={formData.channel} onChange={(e) => setFormData({ ...formData, channel: e.target.value as NotificationChannel })} className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150">
              {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">Severity <span className="text-error">*</span></label>
            <select value={formData.severity} onChange={(e) => setFormData({ ...formData, severity: e.target.value as NotificationSeverity })} className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150">
              {Object.entries(SEVERITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">Digest Mode <span className="text-error">*</span></label>
            <select value={formData.digest_mode} onChange={(e) => setFormData({ ...formData, digest_mode: e.target.value as NotificationDigestMode })} className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150">
              {Object.entries(DIGEST_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">Trigger Event <span className="text-error">*</span></label>
          <input type="text" value={formData.trigger_event} onChange={(e) => setFormData({ ...formData, trigger_event: e.target.value })} placeholder="e.g., workflow.failure" className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 font-mono" />
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">Subject <span className="text-error">*</span></label>
          <input type="text" value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} placeholder="Supports: {{user_name}}, {{company_name}}" className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150" />
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">Body <span className="text-error">*</span></label>
          <textarea
            value={formData.body}
            onChange={(e) => setFormData({ ...formData, body: e.target.value })}
            placeholder="Supports: {{user_name}}, {{user_email}}, {{company_name}}, {{detail}}"
            rows={6}
            className="w-full px-3 py-2 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 resize-y"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {SUPPORTED_VARIABLES.map((v) => (
              <span key={v} className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-alt border border-line text-ink-secondary">
                {v}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Test Modal ──────────────────────────────────────────────────────────────

interface TestModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
}

function TestModal({ isOpen, onClose, templateId }: TestModalProps) {
  const testMutation = useTestTemplate(templateId);
  const [formData, setFormData] = useState({ user_name: 'Test User', user_email: 'test@example.com', company_name: '', detail: '' });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Test Template"
      description="Render the template with mock variables."
      size="lg"
      footer={
        <>
          <button onClick={onClose} disabled={testMutation.isPending} className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50">Cancel</button>
          <button
            onClick={() => testMutation.mutate(formData, { onSuccess: onClose })}
            disabled={testMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <FlaskConical className="w-4 h-4" />
            {testMutation.isPending ? 'Rendering...' : 'Render'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">User Name</label>
            <input type="text" value={formData.user_name} onChange={(e) => setFormData({ ...formData, user_name: e.target.value })} className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150" />
          </div>
          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">User Email</label>
            <input type="email" value={formData.user_email} onChange={(e) => setFormData({ ...formData, user_email: e.target.value })} className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">Company Name</label>
            <input type="text" value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150" />
          </div>
          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">Detail</label>
            <input type="text" value={formData.detail} onChange={(e) => setFormData({ ...formData, detail: e.target.value })} className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150" />
          </div>
        </div>

        {testMutation.data && (
          <div className="p-4 bg-surface-alt rounded-md border border-line space-y-3">
            <div>
              <p className="text-xs font-semibold text-ink-secondary mb-1">Rendered Subject</p>
              <p className="text-sm font-medium text-ink">{testMutation.data.rendered_subject}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-secondary mb-1">Rendered Body</p>
              <p className="text-sm text-ink whitespace-pre-wrap">{testMutation.data.rendered_body}</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Delivery Log View ───────────────────────────────────────────────────────

function DeliveryLogView() {
  const { data: events, isLoading } = useNotificationEvents();

  if (isLoading) return <TableSkeleton rows={6} columns={5} />;

  return (
    <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
      {events && events.length > 0 ? (
        <table className="w-full">
          <thead className="bg-[#F7F8FA] border-b border-line">
            <tr>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">Status</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">Template</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">Channel</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">Recipient</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">Triggered By</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">Delivered</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event: NotificationEvent) => {
              const statusConfig = EVENT_STATUS_ICONS[event.status] ?? { color: 'text-ink-secondary', label: event.status };
              return (
                <tr key={event._id} className="border-b border-line last:border-0">
                  <td className="h-10 px-4">
                    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', statusConfig.color)}>
                      {event.status === 'sent' && <CheckCircle className="w-3.5 h-3.5" />}
                      {event.status === 'failed' && <X className="w-3.5 h-3.5" />}
                      {event.status === 'queued_digest' && <Clock className="w-3.5 h-3.5" />}
                      {statusConfig.label}
                    </span>
                    {event.error_message && (
                      <p className="text-[11px] text-error mt-0.5 truncate max-w-xs" title={event.error_message}>{event.error_message}</p>
                    )}
                  </td>
                  <td className="h-10 px-4 text-sm text-ink">{event.template_id?.name ?? '—'}</td>
                  <td className="h-10 px-4 text-sm text-ink-secondary capitalize">{event.channel}</td>
                  <td className="h-10 px-4 text-sm text-ink-secondary">
                    {event.recipient_user_id?.full_name ?? event.recipient_email ?? '—'}
                  </td>
                  <td className="h-10 px-4">
                    <span className="text-xs font-mono text-accent bg-accent-light px-2 py-0.5 rounded">
                      {event.triggered_by_event}
                    </span>
                  </td>
                  <td className="h-10 px-4 text-sm text-ink-secondary">{formatDate(event.delivery_timestamp)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="p-16 text-center">
          <Mail className="w-10 h-10 text-ink-muted mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-ink mb-1">No delivery events</h3>
          <p className="text-sm text-ink-secondary">Events will appear here when notifications are sent.</p>
        </div>
      )}
    </div>
  );
}
