// src/pages/policies/PoliciesPage.tsx
import { useState, useMemo } from 'react';
import {
  FileText, Plus, Eye, Users, Clock, Search, X, ChevronDown,
  GitCompare, Archive, Target, AlertTriangle, CheckCircle, History,
  Save,
} from 'lucide-react';
import {
  usePolicies,
  usePublishPolicy,
  useArchivePolicy,
  useAcknowledgmentStatus,
  usePolicyAcknowledgments,
  usePolicyVersions,
  usePolicyVersionDiff,
  useSaveAssignmentRules,
  usePolicyConflictCheck,
} from '@/features/policies/hooks/usePolicies';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { PolicyEditor } from '@/components/ui/PolicyEditor';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatDate';
import type {
  PolicyVersion,
  PolicyCategory,
  PolicyTargetType,
} from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<PolicyCategory, string> = {
  hr: 'HR',
  it: 'IT',
  security: 'Security',
  compliance: 'Compliance',
  operations: 'Operations',
  other: 'Other',
};

const CATEGORY_COLORS: Record<PolicyCategory, string> = {
  hr: 'bg-violet-50 text-violet-700 border-violet-200',
  it: 'bg-sky-50 text-sky-700 border-sky-200',
  security: 'bg-red-50 text-red-700 border-red-200',
  compliance: 'bg-amber-50 text-amber-700 border-amber-200',
  operations: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  other: 'bg-surface-alt text-ink-secondary border-line',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-sky-50 text-sky-700 border-sky-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  archived: 'bg-surface-alt text-ink-secondary border-line',
};

const TARGET_TYPE_LABELS: Record<PolicyTargetType, string> = {
  all: 'All Users',
  role: 'Role',
  department: 'Department',
  group: 'Group',
  user: 'User',
};

/**
 * PoliciesPage Component
 * Full policy lifecycle management: create draft → edit → publish → archive.
 * Features:
 * - Tiptap rich text editor for content creation/viewing
 * - Version history with diff view
 * - Targeting/assignment rules with RULE-08 conflict check
 * - Acknowledgment tracking (percentage + user list)
 * - All mutations produce audit events
 */
export default function PoliciesPage() {
  // ── Server data ──────────────────────────────────────────────────────
  const { data: policies, isLoading, isError, refetch } = usePolicies();
  const publishMutation = usePublishPolicy();
  const archiveMutation = useArchivePolicy();

  // ── Modal state ──────────────────────────────────────────────────────
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyVersion | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'content' | 'versions' | 'acknowledgments' | 'targeting'>('content');

  // ── Filters ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PolicyCategory | ''>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // ── Derived: filter policies ────────────────────────────────────────
  const filteredPolicies = useMemo(() => {
    return policies?.filter((policy) => {
      const matchesSearch =
        !search ||
        policy.title.toLowerCase().includes(search.toLowerCase()) ||
        policy.policy_key.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = !categoryFilter || policy.category === categoryFilter;
      const matchesStatus = !statusFilter || policy.status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [policies, search, categoryFilter, statusFilter]);

  // ── Render: Loading ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader onPublishClick={() => setIsPublishModalOpen(true)} />
        <TableSkeleton rows={6} columns={6} />
      </div>
    );
  }

  // ── Render: Error ──────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-5">
        <PageHeader onPublishClick={() => setIsPublishModalOpen(true)} />
        <ErrorState
          title="Failed to load policies"
          description="Something went wrong fetching policy data. Please try again."
          onRetry={refetch}
        />
      </div>
    );
  }

  const hasData = policies && policies.length > 0;

  return (
    <div className="space-y-5">
      {/* ── Page Header ── */}
      <PageHeader
        onPublishClick={() => setIsPublishModalOpen(true)}
        policyCount={policies?.length}
      />

      {/* ── Empty State ── */}
      {!hasData ? (
        <EmptyState
          icon={FileText}
          title="No policies yet"
          description="Publish your first policy to get started."
          action={{ label: 'Publish Policy', onClick: () => setIsPublishModalOpen(true) }}
        />
      ) : (
        <>
          {/* ── Filter Bar ── */}
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            activeFilterCount={
              [search, categoryFilter, statusFilter].filter(Boolean).length
            }
            onClearFilters={() => {
              setSearch('');
              setCategoryFilter('');
              setStatusFilter('');
            }}
          />

          {/* ── Policies Table ── */}
          {filteredPolicies?.length === 0 ? (
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
                  setCategoryFilter('');
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
                      Policy
                    </th>
                    <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                      Category
                    </th>
                    <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                      Version
                    </th>
                    <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                      Status
                    </th>
                    <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                      Effective Date
                    </th>
                    <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPolicies?.map((policy) => (
                    <PolicyRow
                      key={policy._id}
                      policy={policy}
                      onView={() => {
                        setSelectedPolicy(policy);
                        setActiveDetailTab('content');
                      }}
                      onArchive={() => archiveMutation.mutate({ policy_id: policy._id })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Publish Policy Modal ── */}
      <PublishPolicyModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        publishMutation={publishMutation}
      />

      {/* ── Policy Detail Modal ── */}
      {selectedPolicy && (
        <PolicyDetailModal
          policy={selectedPolicy}
          isOpen={!!selectedPolicy}
          onClose={() => setSelectedPolicy(null)}
          activeTab={activeDetailTab}
          onTabChange={setActiveDetailTab}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface PageHeaderProps {
  onPublishClick: () => void;
  policyCount?: number;
}

function PageHeader({ onPublishClick, policyCount }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">
          Policies
        </h1>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-sm text-ink-secondary">
            Manage and publish organizational policies.
          </p>
          {policyCount !== undefined && (
            <span className="text-xs text-ink-muted">
              {policyCount} {policyCount === 1 ? 'policy' : 'policies'}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onPublishClick}
        className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-2 flex-shrink-0"
      >
        <Plus className="w-4 h-4" />
        Publish Policy
      </button>
    </div>
  );
}

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: PolicyCategory | '';
  onCategoryChange: (value: PolicyCategory | '') => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

function FilterBar({
  search,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
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
          placeholder="Search policies..."
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

      {/* Category filter */}
      <div className="relative">
        <select
          value={categoryFilter}
          onChange={(e) => onCategoryChange(e.target.value as PolicyCategory | '')}
          className="h-9 pl-3 pr-8 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 appearance-none cursor-pointer"
        >
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
      </div>

      {/* Status filter */}
      <div className="relative">
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
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

interface PolicyRowProps {
  policy: PolicyVersion;
  onView: () => void;
  onArchive: () => void;
}

function PolicyRow({ policy, onView, onArchive }: PolicyRowProps) {
  const { data: ackStatus } = useAcknowledgmentStatus(policy._id);

  return (
    <tr className="border-b border-line last:border-0 hover:bg-[#F7F8FA] transition-colors duration-100">
      <td className="h-14 px-4">
        <div>
          <p className="text-sm font-medium text-ink">{policy.title}</p>
          {policy.summary && (
            <p className="text-xs text-ink-secondary truncate max-w-xs">
              {policy.summary}
            </p>
          )}
        </div>
      </td>
      <td className="h-14 px-4">
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2.5 py-0.5 tracking-wide',
            CATEGORY_COLORS[policy.category]
          )}
        >
          {CATEGORY_LABELS[policy.category]}
        </span>
      </td>
      <td className="h-14 px-4 text-sm font-medium text-ink">
        v{policy.version_number}
        {policy.version_count !== undefined && (
          <span className="text-xs text-ink-muted ml-1">
            ({policy.version_count} total)
          </span>
        )}
      </td>
      <td className="h-14 px-4">
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2.5 py-0.5 tracking-wide',
            STATUS_COLORS[policy.status]
          )}
        >
          {STATUS_LABELS[policy.status]}
        </span>
      </td>
      <td className="h-14 px-4 text-sm text-ink-secondary">
        {formatDate(policy.effective_date)}
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
          {policy.status === 'published' && (
            <button
              onClick={onArchive}
              className="h-7 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink-secondary hover:text-error hover:border-error/30 hover:bg-error-light transition-colors inline-flex items-center gap-1.5"
              title="Archive this version"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          )}
          {ackStatus?.acknowledged && (
            <span className="h-7 px-2 text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Done
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Publish Policy Modal with Tiptap ────────────────────────────────────────

interface PublishPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  publishMutation: ReturnType<typeof usePublishPolicy>;
}

function PublishPolicyModal({
  isOpen,
  onClose,
  publishMutation,
}: PublishPolicyModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'hr' as PolicyCategory,
    effective_date: new Date().toISOString().split('T')[0],
    summary: '',
  });

  const handleSubmit = () => {
    publishMutation.mutate(
      {
        title: formData.title,
        content: formData.content,
        category: formData.category,
        effective_date: formData.effective_date,
        summary: formData.summary || undefined,
      },
      {
        onSuccess: () => {
          onClose();
          setFormData({
            title: '',
            content: '',
            category: 'hr',
            effective_date: new Date().toISOString().split('T')[0],
            summary: '',
          });
        },
      }
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Publish Policy"
      description="Publish a new policy version. Version number will be incremented automatically."
      size="xl"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={publishMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              publishMutation.isPending ||
              !formData.title ||
              !formData.content ||
              !formData.effective_date
            }
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Clock className="w-4 h-4" />
            {publishMutation.isPending ? 'Publishing...' : 'Publish Policy'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">
              Title <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="e.g., Remote Work Policy"
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">
              Category <span className="text-error">*</span>
            </label>
            <select
              value={formData.category}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  category: e.target.value as PolicyCategory,
                })
              }
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
            >
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">
              Effective Date <span className="text-error">*</span>
            </label>
            <input
              type="date"
              value={formData.effective_date}
              onChange={(e) =>
                setFormData({ ...formData, effective_date: e.target.value })
              }
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">
              Summary (optional)
            </label>
            <input
              type="text"
              value={formData.summary}
              onChange={(e) =>
                setFormData({ ...formData, summary: e.target.value })
              }
              placeholder="Brief description of changes"
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">
            Policy Content <span className="text-error">*</span>
          </label>
          <PolicyEditor
            content={formData.content}
            onChange={(html) => setFormData({ ...formData, content: html })}
          />
        </div>
      </div>
    </Modal>
  );
}

// ── Policy Detail Modal with Tabs ───────────────────────────────────────────

interface PolicyDetailModalProps {
  policy: PolicyVersion;
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'content' | 'versions' | 'acknowledgments' | 'targeting';
  onTabChange: (tab: 'content' | 'versions' | 'acknowledgments' | 'targeting') => void;
}

const TABS = [
  { key: 'content' as const, label: 'Content', icon: FileText },
  { key: 'versions' as const, label: 'Versions', icon: History },
  { key: 'acknowledgments' as const, label: 'Acknowledgments', icon: Users },
  { key: 'targeting' as const, label: 'Targeting', icon: Target },
];

function PolicyDetailModal({
  policy,
  isOpen,
  onClose,
  activeTab,
  onTabChange,
}: PolicyDetailModalProps) {
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setSelectedVersions([]);
        onClose();
      }}
      title={`${policy.title} (v${policy.version_number})`}
      description={`Published ${policy.published_at ? formatDate(policy.published_at) : 'N/A'}`}
      size="xl"
      footer={
        <div className="flex items-center gap-2">
          {policy.status === 'published' && (
            <span className="text-xs text-ink-secondary flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              Published — create a new version to make changes
            </span>
          )}
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
        {TABS.map((tab) => {
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
      {activeTab === 'content' && <PolicyContentView policy={policy} />}
      {activeTab === 'versions' && (
        <PolicyVersionsView
          policyKey={policy.policy_key}
          policyId={policy._id}
          selectedVersions={selectedVersions}
          onSelectionChange={setSelectedVersions}
        />
      )}
      {activeTab === 'acknowledgments' && (
        <PolicyAcknowledgmentsView policyId={policy._id} />
      )}
      {activeTab === 'targeting' && (
        <PolicyTargetingView policyId={policy._id} />
      )}

      {/* Version Diff Bar */}
      {activeTab === 'versions' && selectedVersions.length === 2 && (
        <VersionDiffView
          policyKey={policy.policy_key}
          versionA={selectedVersions[0]}
          versionB={selectedVersions[1]}
          onClose={() => setSelectedVersions([])}
        />
      )}
    </Modal>
  );
}

// ── Tab: Content View ───────────────────────────────────────────────────────

function PolicyContentView({ policy }: { policy: PolicyVersion }) {
  return (
    <div className="space-y-4">
      {/* Metadata */}
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2.5 py-0.5 tracking-wide',
            CATEGORY_COLORS[policy.category]
          )}
        >
          {CATEGORY_LABELS[policy.category]}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2.5 py-0.5 tracking-wide',
            STATUS_COLORS[policy.status]
          )}
        >
          {STATUS_LABELS[policy.status]}
        </span>
        {policy.published_by && (
          <span className="text-xs text-ink-secondary">
            by {policy.published_by.full_name}
          </span>
        )}
      </div>

      {policy.summary && (
        <div className="p-3 bg-surface-alt rounded-md border border-line">
          <p className="text-xs font-medium text-ink-secondary mb-1">
            Summary of Changes
          </p>
          <p className="text-sm text-ink">{policy.summary}</p>
        </div>
      )}

      {/* Rendered content using PolicyEditor in read-only mode */}
      <div>
        <h4 className="text-sm font-semibold text-ink mb-2">Policy Content</h4>
        <PolicyEditor
          content={policy.content}
          onChange={() => {}}
          readOnly
        />
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-ink-secondary mb-1">Effective Date</p>
          <p className="text-sm font-medium text-ink">
            {formatDate(policy.effective_date)}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-secondary mb-1">Version</p>
          <p className="text-sm font-medium text-ink">
            v{policy.version_number}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Versions View ──────────────────────────────────────────────────────

interface PolicyVersionsViewProps {
  policyKey: string;
  policyId: string;
  selectedVersions: string[];
  onSelectionChange: (versions: string[]) => void;
}

function PolicyVersionsView({
  policyKey,
  selectedVersions,
  onSelectionChange,
}: PolicyVersionsViewProps) {
  const { data: versions, isLoading } = usePolicyVersions(policyKey);

  if (isLoading) return <TableSkeleton rows={4} columns={4} />;

  const toggleVersion = (versionNum: string) => {
    const current = [...selectedVersions];
    if (current.includes(versionNum)) {
      onSelectionChange(current.filter((v) => v !== versionNum));
    } else if (current.length < 2) {
      onSelectionChange([...current, versionNum]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-secondary">
          Select two versions to compare ({selectedVersions.length}/2 selected)
        </p>
        {selectedVersions.length === 2 && (
          <span className="text-xs text-accent font-medium flex items-center gap-1">
            <GitCompare className="w-3.5 h-3.5" />
            Diff view active below
          </span>
        )}
      </div>

      <div className="border border-line rounded-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#F7F8FA] border-b border-line">
            <tr>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left w-10">
                {/* Checkbox column */}
              </th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                Version
              </th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                Status
              </th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                Published
              </th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                Publisher
              </th>
            </tr>
          </thead>
          <tbody>
            {versions?.map((version) => (
              <tr
                key={version._id}
                className={cn(
                  'border-b border-line last:border-0 hover:bg-[#F7F8FA] cursor-pointer transition-colors',
                  selectedVersions.includes(String(version.version_number)) && 'bg-primary-light'
                )}
                onClick={() => toggleVersion(String(version.version_number))}
              >
                <td className="h-10 px-4">
                  <div
                    className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center',
                      selectedVersions.includes(String(version.version_number))
                        ? 'bg-primary border-primary'
                        : 'border-line'
                    )}
                  >
                    {selectedVersions.includes(String(version.version_number)) && (
                      <CheckCircle className="w-3 h-3 text-white" />
                    )}
                  </div>
                </td>
                <td className="h-10 px-4 text-sm font-medium text-ink">
                  v{version.version_number}
                </td>
                <td className="h-10 px-4">
                  <span
                    className={cn(
                      'inline-flex items-center text-[11px] font-semibold border rounded-full px-2.5 py-0.5',
                      STATUS_COLORS[version.status]
                    )}
                  >
                    {STATUS_LABELS[version.status]}
                  </span>
                </td>
                <td className="h-10 px-4 text-sm text-ink-secondary">
                  {version.published_at ? formatDate(version.published_at) : '—'}
                </td>
                <td className="h-10 px-4 text-sm text-ink-secondary">
                  {version.published_by?.full_name || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Version Diff View ───────────────────────────────────────────────────────

interface VersionDiffViewProps {
  policyKey: string;
  versionA: string;
  versionB: string;
  onClose: () => void;
}

function VersionDiffView({ policyKey, versionA, versionB, onClose }: VersionDiffViewProps) {
  const { data: diffData, isLoading } = usePolicyVersionDiff(
    policyKey,
    versionA,
    versionB
  );

  if (isLoading) return <TableSkeleton rows={3} columns={2} />;
  if (!diffData) return null;

  return (
    <div className="mt-5 border border-line rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-surface-alt border-b border-line">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-accent" />
          <span className="text-sm font-semibold text-ink">
            Version Diff: v{diffData.version_a.version_number} vs v{diffData.version_b.version_number}
          </span>
        </div>
        <button
          onClick={onClose}
          className="h-6 w-6 flex items-center justify-center rounded text-ink-secondary hover:text-ink hover:bg-surface-alt transition-colors"
          aria-label="Close diff view"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Diff Summary */}
      <div className="px-4 py-3 border-b border-line">
        <div className="flex items-center gap-4 text-xs">
          <span className="text-emerald-600 font-medium">
            +{diffData.diff_summary.added_lines} lines added
          </span>
          <span className="text-error font-medium">
            -{diffData.diff_summary.removed_lines} lines removed
          </span>
        </div>
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 divide-x divide-line">
        <div className="p-4">
          <p className="text-xs font-semibold text-ink-secondary mb-2">
            v{diffData.version_a.version_number} — {diffData.version_a.title}
          </p>
          <div className="text-xs text-ink whitespace-pre-wrap font-mono bg-surface-alt p-3 rounded max-h-64 overflow-y-auto">
            {diffData.version_a.content}
          </div>
        </div>
        <div className="p-4">
          <p className="text-xs font-semibold text-ink-secondary mb-2">
            v{diffData.version_b.version_number} — {diffData.version_b.title}
          </p>
          <div className="text-xs text-ink whitespace-pre-wrap font-mono bg-surface-alt p-3 rounded max-h-64 overflow-y-auto">
            {diffData.version_b.content}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Acknowledgments View ───────────────────────────────────────────────

function PolicyAcknowledgmentsView({ policyId }: { policyId: string }) {
  const { data: acknowledgments, isLoading } = usePolicyAcknowledgments(policyId);
  const { data: ackStatus } = useAcknowledgmentStatus(policyId);

  // Calculate percentage (placeholder: assumes 100 total users)
  const totalUsers = 100; // In production, fetch from /users/stats
  const acknowledgedCount = acknowledgments?.length || 0;
  const percentage = Math.round((acknowledgedCount / totalUsers) * 100);

  if (isLoading) return <TableSkeleton rows={4} columns={3} />;

  return (
    <div className="space-y-4">
      {/* Acknowledgment Progress */}
      <div className="p-4 bg-surface-alt rounded-md border border-line">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-ink">Acknowledgment Progress</span>
          <span className="text-sm font-bold text-ink">
            {acknowledgedCount}/{totalUsers} ({percentage}%)
          </span>
        </div>
        <div className="w-full h-2 bg-line rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
        {ackStatus?.acknowledged && (
          <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            You have acknowledged this policy
          </p>
        )}
      </div>

      {/* Acknowledged Users List */}
      <div>
        <h4 className="text-sm font-semibold text-ink mb-2">
          Acknowledged By
        </h4>
        {acknowledgments && acknowledgments.length > 0 ? (
          <div className="border border-line rounded-md overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-[#F7F8FA] border-b border-line">
                <tr>
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                    User
                  </th>
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                    Acknowledged At
                  </th>
                </tr>
              </thead>
              <tbody>
                {acknowledgments.map((ack) => (
                  <tr key={ack._id} className="border-b border-line last:border-0">
                    <td className="h-10 px-4 text-sm text-ink">
                      {ack.user.full_name}
                    </td>
                    <td className="h-10 px-4 text-sm text-ink-secondary">
                      {formatDate(ack.acknowledged_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center border border-line rounded-md">
            <Users className="w-8 h-8 text-ink-muted mx-auto mb-2" />
            <p className="text-sm text-ink-secondary">
              No acknowledgments yet
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab: Targeting View ─────────────────────────────────────────────────────

interface PolicyTargetingViewProps {
  policyId: string;
}

function PolicyTargetingView({ policyId }: PolicyTargetingViewProps) {
  const [isTargetingModalOpen, setIsTargetingModalOpen] = useState(false);
  const assignmentMutation = useSaveAssignmentRules(policyId);
  const { data: conflicts } = usePolicyConflictCheck(policyId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-secondary">
          Define who this policy applies to.
        </p>
        <button
          onClick={() => setIsTargetingModalOpen(true)}
          className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-2"
        >
          <Target className="w-4 h-4" />
          Edit Targeting
        </button>
      </div>

      {/* Conflict Warning */}
      {conflicts?.has_conflicts && (
        <div className="p-4 bg-error-light border border-error-border rounded-md flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-error">
              RULE-08: Conflicting Policies Detected
            </p>
            <ul className="mt-1 text-xs text-ink-secondary space-y-0.5">
              {conflicts.conflicting_policies.map((c, i) => (
                <li key={i}>• {c.conflict_reason}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Current Assignment Rules (placeholder — populated by API) */}
      <div className="p-8 text-center border border-line rounded-md bg-surface-alt">
        <Target className="w-8 h-8 text-ink-muted mx-auto mb-2" />
        <p className="text-sm text-ink-secondary mb-1">
          No assignment rules configured yet
        </p>
        <p className="text-xs text-ink-muted">
          Click "Edit Targeting" to define who this policy applies to.
        </p>
      </div>

      {/* Targeting Modal */}
      {isTargetingModalOpen && (
        <TargetingModal
          isOpen={isTargetingModalOpen}
          onClose={() => setIsTargetingModalOpen(false)}
          saveMutation={assignmentMutation}
          onSaved={() => setIsTargetingModalOpen(false)}
        />
      )}
    </div>
  );
}

// ── Targeting Modal ─────────────────────────────────────────────────────────

interface TargetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  saveMutation: ReturnType<typeof useSaveAssignmentRules>;
  onSaved: () => void;
}

function TargetingModal({ isOpen, onClose, saveMutation, onSaved }: TargetingModalProps) {
  const [rules, setRules] = useState<Array<{ target_type: PolicyTargetType; target_id: string }>>([
    { target_type: 'all', target_id: 'all' },
  ]);

  const addRule = () => {
    setRules([...rules, { target_type: 'department', target_id: '' }]);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, field: string, value: string) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], [field]: value };
    setRules(updated);
  };

  const handleSave = () => {
    const validRules = rules.filter((r) => r.target_id);
    saveMutation.mutate(validRules, { onSuccess: onSaved });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Policy Targeting"
      description="Define which users or groups this policy applies to."
      size="lg"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={saveMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? 'Saving...' : 'Save Rules'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {rules.map((rule, index) => (
          <div key={index} className="flex items-center gap-3">
            <select
              value={rule.target_type}
              onChange={(e) => updateRule(index, 'target_type', e.target.value)}
              className="h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 w-40"
            >
              {Object.entries(TARGET_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={rule.target_id}
              onChange={(e) => updateRule(index, 'target_id', e.target.value)}
              placeholder={rule.target_type === 'all' ? 'All users' : 'Enter ID...'}
              disabled={rule.target_type === 'all'}
              className="flex-1 h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 disabled:bg-surface-alt disabled:text-ink-muted"
            />

            <button
              onClick={() => removeRule(index)}
              className="h-8 w-8 flex items-center justify-center rounded text-ink-secondary hover:text-error hover:bg-error-light transition-colors"
              aria-label="Remove rule"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}

        <button
          onClick={addRule}
          className="text-xs font-medium text-accent hover:text-accent-hover flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Target Rule
        </button>

        <div className="p-3 bg-info-light border border-info-border rounded-md mt-4">
          <p className="text-xs text-info">
            <strong>RULE-08:</strong> After saving, the system will automatically check for conflicting policies targeting the same user population.
          </p>
        </div>
      </div>
    </Modal>
  );
}
