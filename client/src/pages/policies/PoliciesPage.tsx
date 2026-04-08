// src/pages/policies/PoliciesPage.tsx
import { useState } from 'react';
import { FileText, Plus, Eye, Users, Clock, Search, X, ChevronDown } from 'lucide-react';
import { usePolicies, usePublishPolicy, useAcknowledgmentStatus } from '@/features/policies/hooks/usePolicies';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import type { PolicyVersion, PolicyCategory } from '@/types';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatDate';

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

/**
 * PoliciesPage Component
 * Main page for managing organizational policies.
 *
 * Features:
 * - List all policies with latest version
 * - Publish new policy versions (auto-increments version number)
 * - View policy details and version history
 * - Acknowledge policies (produces audit event)
 * - View acknowledgment status per policy
 * - All 4 states: loading, error, empty, data
 */
export default function PoliciesPage() {
  // ── Server data ──────────────────────────────────────────────────────
  const { data: policies, isLoading, isError, refetch } = usePolicies();
  const publishPolicyMutation = usePublishPolicy();

  // ── Modal state ──────────────────────────────────────────────────────
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyVersion | null>(null);

  // ── Filters ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PolicyCategory | ''>('');

  // ── Derived: filter policies ────────────────────────────────────────
  const filteredPolicies = policies?.filter((policy) => {
    const matchesSearch =
      !search ||
      policy.title.toLowerCase().includes(search.toLowerCase()) ||
      policy.policy_key.toLowerCase().includes(search.toLowerCase());

    const matchesCategory = !categoryFilter || policy.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  // ── Render: Loading ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader onPublishClick={() => setIsPublishModalOpen(true)} />
        <TableSkeleton rows={6} columns={5} />
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
            activeFilterCount={
              [search, categoryFilter].filter(Boolean).length
            }
            onClearFilters={() => {
              setSearch('');
              setCategoryFilter('');
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
                      Effective Date
                    </th>
                    <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                      Status
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
                      onView={() => setSelectedPolicy(policy)}
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
        publishMutation={publishPolicyMutation}
      />

      {/* ── Policy Detail Modal ── */}
      {selectedPolicy && (
        <PolicyDetailModal
          policy={selectedPolicy}
          isOpen={!!selectedPolicy}
          onClose={() => setSelectedPolicy(null)}
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
  activeFilterCount: number;
  onClearFilters: () => void;
}

function FilterBar({
  search,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
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
}

function PolicyRow({ policy, onView }: PolicyRowProps) {
  const { data: ackStatus } = useAcknowledgmentStatus(policy._id);

  return (
    <tr className="border-b border-line last:border-0 hover:bg-[#F7F8FA] cursor-pointer transition-colors duration-100">
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
      </td>
      <td className="h-14 px-4 text-sm text-ink-secondary">
        {formatDate(policy.effective_date)}
      </td>
      <td className="h-14 px-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2.5 py-0.5 tracking-wide',
              policy.status === 'published'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-surface-alt text-ink-secondary border-line'
            )}
          >
            {policy.status}
          </span>
          {ackStatus?.acknowledged && (
            <span className="text-[11px] text-emerald-600 flex items-center gap-1">
              <Users className="w-3 h-3" />
              Acknowledged
            </span>
          )}
        </div>
      </td>
      <td className="h-14 px-4 text-right">
        <button
          onClick={onView}
          className="h-7 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors inline-flex items-center gap-1.5"
        >
          <Eye className="w-3.5 h-3.5" />
          View
        </button>
      </td>
    </tr>
  );
}

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
    publishMutation.mutate(formData, {
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
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Publish Policy"
      description="Publish a new policy version. Version number will be incremented automatically."
      size="lg"
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
            placeholder="Brief description of changes in this version"
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">
            Policy Content <span className="text-error">*</span>
          </label>
          <textarea
            value={formData.content}
            onChange={(e) =>
              setFormData({ ...formData, content: e.target.value })
            }
            placeholder="Write the full policy content here..."
            rows={10}
            className="w-full px-3 py-2 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 resize-y"
          />
        </div>
      </div>
    </Modal>
  );
}

interface PolicyDetailModalProps {
  policy: PolicyVersion;
  isOpen: boolean;
  onClose: () => void;
}

function PolicyDetailModal({
  policy,
  isOpen,
  onClose,
}: PolicyDetailModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${policy.title} (v${policy.version_number})`}
      description={`Published ${policy.published_at ? formatDate(policy.published_at) : 'N/A'}`}
      size="xl"
      footer={
        <button
          onClick={onClose}
          className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
        >
          Close
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
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
              policy.status === 'published'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-surface-alt text-ink-secondary border-line'
            )}
          >
            {policy.status}
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

        <div>
          <h4 className="text-sm font-semibold text-ink mb-2">
            Policy Content
          </h4>
          <div className="p-4 bg-white border border-line rounded-md max-h-96 overflow-y-auto">
            <pre className="text-sm text-ink whitespace-pre-wrap font-sans">
              {policy.content}
            </pre>
          </div>
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
    </Modal>
  );
}
