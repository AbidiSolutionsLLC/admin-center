import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileText, Plus, Eye, Users, Clock, Search, X, ChevronDown,
  GitCompare, Archive, Target, AlertTriangle, CheckCircle, History,
  Save, Edit,
} from 'lucide-react';
import {
  usePolicies,
  usePublishPolicy,
  useArchivePolicy,
  useAcknowledgmentStatus,
  useAcknowledgePolicy,
  usePolicyAcknowledgments,
  usePolicyVersions,
  usePolicyVersionDiff,
  useSaveAssignmentRules,
  usePolicyConflictCheck,
  usePolicyAssignments,
  useDeletePolicy,
  useSimulatePolicy,
  useCreateDraftPolicy,
  useUpdatePolicyDraft,
  useRollbackPolicy,
} from '@/features/policies/hooks/usePolicies';
import { useUserStats } from '@/features/people/hooks/useUserStats';
import { useDepartments } from '@/features/organization/hooks/useDepartments';
import { useRoles } from '@/features/roles/useRoles';
import { useGroups } from '@/features/groups/useGroups';
import { useUsers } from '@/features/people/hooks/useUsers';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PolicyEditor } from '@/components/ui/PolicyEditor';
import { AccessControlPoliciesView } from './components/AccessControlPoliciesView';
import { DataGovernancePoliciesView } from './components/DataGovernancePoliciesView';
import { PolicyTemplatesView } from './components/PolicyTemplatesView';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatDate';
import type {
  PolicyVersion,
  PolicyCategory,
  PolicyTargetType,
  PolicyAssignmentRule,
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
  const draftMutation = useCreateDraftPolicy();
  const archiveMutation = useArchivePolicy();
  const deleteMutation = useDeletePolicy();

  // ── Modal state ──────────────────────────────────────────────────────
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyVersion | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'content' | 'versions' | 'acknowledgments' | 'targeting'>('content');
  const [policyToDelete, setPolicyToDelete] = useState<string | null>(null);
  const [policyToArchive, setPolicyToArchive] = useState<string | null>(null);
  const [draftToEdit, setDraftToEdit] = useState<PolicyVersion | null>(null);

  const updateDraftMutation = useUpdatePolicyDraft(draftToEdit?._id || '');

  // ── Main Page Tabs ────────────────────────────────────────────────────
  const [activePolicyType, setActivePolicyType] = useState<'general' | 'access' | 'governance' | 'templates'>('general');

  const { id } = useParams<{ id: string }>();

  useEffect(() => {
    if (id && policies && !selectedPolicy) {
      const policy = policies.find((p) => p._id === id);
      if (policy) {
        setSelectedPolicy(policy);
        setActiveDetailTab('content');
      }
    }
  }, [id, policies, selectedPolicy]);

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

  // ── Pagination ────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  
  const paginatedPolicies = useMemo(() => {
    if (!filteredPolicies) return [];
    const startIndex = (currentPage - 1) * pageSize;
    return filteredPolicies.slice(startIndex, startIndex + pageSize);
  }, [filteredPolicies, currentPage]);

  const totalPages = filteredPolicies ? Math.ceil(filteredPolicies.length / pageSize) : 0;

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, statusFilter]);

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

      {/* ── Top Tabs ── */}
      <div className="border-b border-line mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActivePolicyType('general')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-[13px] transition-colors ${
              activePolicyType === 'general'
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-secondary hover:text-ink hover:border-line-strong'
            }`}
          >
            General Policies
          </button>
          <button
            onClick={() => setActivePolicyType('access')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-[13px] transition-colors ${
              activePolicyType === 'access'
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-secondary hover:text-ink hover:border-line-strong'
            }`}
          >
            Access Control
          </button>
          <button
            onClick={() => setActivePolicyType('governance')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-[13px] transition-colors ${
              activePolicyType === 'governance'
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-secondary hover:text-ink hover:border-line-strong'
            }`}
          >
            Data Governance
          </button>
          <button
            onClick={() => setActivePolicyType('templates')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-[13px] transition-colors ${
              activePolicyType === 'templates'
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-secondary hover:text-ink hover:border-line-strong'
            }`}
          >
            Templates
          </button>
        </nav>
      </div>

      {activePolicyType === 'access' && <AccessControlPoliciesView />}
      {activePolicyType === 'governance' && <DataGovernancePoliciesView />}
      {activePolicyType === 'templates' && <PolicyTemplatesView />}

      {activePolicyType === 'general' && (
        <>
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
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-surface-base border-b border-line">
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
                  {paginatedPolicies?.map((policy) => (
                    <PolicyRow
                      key={policy._id}
                      policy={policy}
                      onView={() => {
                        setSelectedPolicy(policy);
                        setActiveDetailTab('content');
                      }}
                      onEdit={() => {
                        setDraftToEdit(policy);
                        setIsPublishModalOpen(true);
                      }}
                      onArchive={() => setPolicyToArchive(policy._id)}
                      onDelete={() => setPolicyToDelete(policy._id)}
                    />
                  ))}
                </tbody>
                </table>
              </div>
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-line bg-surface-base sm:px-6">
                  <div className="flex flex-1 justify-between sm:hidden">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-surface-alt disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="relative ml-3 inline-flex items-center rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-surface-alt disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                  <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-ink-secondary">
                        Showing <span className="font-medium">{((currentPage - 1) * pageSize) + 1}</span> to <span className="font-medium">{Math.min(currentPage * pageSize, filteredPolicies?.length || 0)}</span> of <span className="font-medium">{filteredPolicies?.length}</span> results
                      </p>
                    </div>
                    <div>
                      <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="relative inline-flex items-center rounded-l-md px-2 py-2 text-ink-secondary ring-1 ring-inset ring-line hover:bg-surface-alt focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                        >
                          <span className="sr-only">Previous</span>
                          <span className="h-5 w-5 flex items-center justify-center">←</span>
                        </button>
                        {[...Array(totalPages)].map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentPage(i + 1)}
                            aria-current={currentPage === i + 1 ? 'page' : undefined}
                            className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${currentPage === i + 1 ? 'z-10 bg-primary text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary' : 'text-ink ring-1 ring-inset ring-line hover:bg-surface-alt focus:z-20 focus:outline-offset-0'}`}
                          >
                            {i + 1}
                          </button>
                        ))}
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="relative inline-flex items-center rounded-r-md px-2 py-2 text-ink-secondary ring-1 ring-inset ring-line hover:bg-surface-alt focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                        >
                          <span className="sr-only">Next</span>
                          <span className="h-5 w-5 flex items-center justify-center">→</span>
                        </button>
                      </nav>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Publish Policy Modal ── */}
      <PublishPolicyModal
        isOpen={isPublishModalOpen}
        onClose={() => {
          setIsPublishModalOpen(false);
          setDraftToEdit(null);
        }}
        publishMutation={publishMutation}
        draftMutation={draftMutation}
        updateDraftMutation={updateDraftMutation}
        initialData={draftToEdit}
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

      {/* ── Confirm Modals ── */}
      <ConfirmDialog
        isOpen={!!policyToDelete}
        title="Delete Policy"
        description="Are you sure you want to delete this policy? This action cannot be undone."
        confirmLabel="Delete Policy"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (policyToDelete) {
            deleteMutation.mutate(
              { policy_id: policyToDelete },
              { onSuccess: () => setPolicyToDelete(null) }
            );
          }
        }}
        onClose={() => setPolicyToDelete(null)}
      />

      <ConfirmDialog
        isOpen={!!policyToArchive}
        title="Archive Policy"
        description="Are you sure you want to archive this policy? Archived policies are no longer active but their history is preserved."
        confirmLabel="Archive Policy"
        isLoading={archiveMutation.isPending}
        onConfirm={() => {
          if (policyToArchive) {
            archiveMutation.mutate(
              { policy_id: policyToArchive },
              { onSuccess: () => setPolicyToArchive(null) }
            );
          }
        }}
        onClose={() => setPolicyToArchive(null)}
      />
      </>)}
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
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function PolicyRow({ policy, onView, onEdit, onArchive, onDelete }: PolicyRowProps) {
  const { data: ackStatus } = useAcknowledgmentStatus(policy._id);

  return (
    <tr className="border-b border-line last:border-0 hover:bg-surface-base transition-colors duration-100">
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
              className="h-7 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink-secondary hover:text-warning hover:border-warning/30 hover:bg-warning-light transition-colors inline-flex items-center gap-1.5"
              title="Archive this version"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          )}
          {policy.status !== 'published' && (
            <button
              onClick={onEdit}
              className="h-7 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors inline-flex items-center gap-1.5"
              title="Edit draft policy"
            >
              <Edit className="w-3.5 h-3.5" />
            </button>
          )}
          {policy.status !== 'published' && (
            <button
              onClick={onDelete}
              className="h-7 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink-secondary hover:text-error hover:border-error/30 hover:bg-error-light transition-colors inline-flex items-center gap-1.5"
              title="Delete this policy"
            >
              <X className="w-3.5 h-3.5" />
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
  draftMutation: ReturnType<typeof useCreateDraftPolicy>;
  updateDraftMutation?: ReturnType<typeof useUpdatePolicyDraft>;
  initialData?: PolicyVersion | null;
}

function PublishPolicyModal({
  isOpen,
  onClose,
  publishMutation,
  draftMutation,
  updateDraftMutation,
  initialData,
}: PublishPolicyModalProps) {
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    content: initialData?.content || '',
    category: initialData?.category || ('hr' as PolicyCategory),
    effective_date: initialData?.effective_date ? new Date(initialData.effective_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    expiry_date: initialData?.expiry_date ? new Date(initialData.expiry_date).toISOString().split('T')[0] : '',
    summary: initialData?.summary || '',
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title,
        content: initialData.content,
        category: initialData.category,
        effective_date: initialData.effective_date ? new Date(initialData.effective_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        expiry_date: initialData.expiry_date ? new Date(initialData.expiry_date).toISOString().split('T')[0] : '',
        summary: initialData.summary || '',
      });
    } else {
      setFormData({
        title: '',
        content: '',
        category: 'hr' as PolicyCategory,
        effective_date: new Date().toISOString().split('T')[0],
        expiry_date: '',
        summary: '',
      });
    }
  }, [initialData, isOpen]);

  const handleSubmit = () => {
    publishMutation.mutate(
      {
        title: formData.title,
        content: formData.content,
        category: formData.category,
        effective_date: formData.effective_date,
        expiry_date: formData.expiry_date || undefined,
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
            expiry_date: '',
            summary: '',
          });
        },
      }
    );
  };

  const handleSaveDraft = () => {
    const payload = {
      title: formData.title,
      content: formData.content,
      category: formData.category,
      effective_date: formData.effective_date,
      expiry_date: formData.expiry_date || undefined,
      summary: formData.summary || undefined,
    };
    
    if (initialData && updateDraftMutation) {
      updateDraftMutation.mutate(payload, {
        onSuccess: () => {
          onClose();
        },
      });
    } else {
      draftMutation.mutate(payload, {
        onSuccess: () => {
          onClose();
        },
      });
    }
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
            disabled={publishMutation.isPending || draftMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed mr-auto"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={
              publishMutation.isPending || draftMutation.isPending ||
              !formData.title ||
              !formData.content ||
              !formData.effective_date ||
              (!!formData.expiry_date && (new Date(formData.expiry_date) < new Date(new Date().setHours(0,0,0,0)) || new Date(formData.expiry_date) <= new Date(formData.effective_date)))
            }
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {draftMutation.isPending || updateDraftMutation?.isPending ? 'Saving...' : 'Save as Draft'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              publishMutation.isPending ||
              draftMutation.isPending ||
              updateDraftMutation?.isPending ||
              !formData.title ||
              !formData.content ||
              !formData.effective_date ||
              (!!formData.expiry_date && (new Date(formData.expiry_date) < new Date(new Date().setHours(0,0,0,0)) || new Date(formData.expiry_date) <= new Date(formData.effective_date)))
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

        <div className="grid grid-cols-3 gap-4">
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

          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">
              Expiry Date (optional)
            </label>
            <input
              type="date"
              value={formData.expiry_date}
              onChange={(e) =>
                setFormData({ ...formData, expiry_date: e.target.value })
              }
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
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
  const { data: ackStatus } = useAcknowledgmentStatus(policy._id);
  const ackMutation = useAcknowledgePolicy(policy._id);

  const handleAcknowledge = () => {
    ackMutation.mutate({ policy_version_id: policy._id });
  };

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
        <div className="flex items-center gap-2 w-full">
          {policy.status === 'published' && ackStatus?.targeted && !ackStatus.acknowledged && (
            <button
              onClick={handleAcknowledge}
              disabled={ackMutation.isPending}
              className="h-9 px-4 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
            >
              {ackMutation.isPending ? 'Acknowledging...' : 'Acknowledge Policy'}
            </button>
          )}
          {policy.status === 'published' && ackStatus?.targeted && ackStatus.acknowledged && (
            <span className="text-xs text-ink-secondary flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              Acknowledged on {ackStatus.acknowledged_at ? formatDate(ackStatus.acknowledged_at) : 'N/A'}
            </span>
          )}
          {(!ackStatus?.targeted || policy.status !== 'published') && policy.status === 'published' && (
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
  const rollbackMutation = useRollbackPolicy();
  const [versionToRollback, setVersionToRollback] = useState<{ id: string; num: number } | null>(null);

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
          <thead className="bg-surface-base border-b border-line">
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
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {versions?.map((version) => (
              <tr
                key={version._id}
                className={cn(
                  'border-b border-line last:border-0 hover:bg-surface-base cursor-pointer transition-colors',
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
                <td className="h-10 px-4 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setVersionToRollback({ id: version._id, num: version.version_number });
                    }}
                    disabled={rollbackMutation.isPending || version.status !== 'published'}
                    className="h-7 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                    title="Rollback to this version"
                  >
                    <History className="w-3.5 h-3.5" />
                    Rollback
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        isOpen={!!versionToRollback}
        title={`Rollback to v${versionToRollback?.num}`}
        description={`Are you sure you want to rollback to version ${versionToRollback?.num}? A new version will be created based on this one.`}
        confirmLabel="Rollback"
        isLoading={rollbackMutation.isPending}
        onConfirm={() => {
          if (versionToRollback) {
            rollbackMutation.mutate(
              { policy_id: versionToRollback.id },
              { onSuccess: () => setVersionToRollback(null) }
            );
          }
        }}
        onClose={() => setVersionToRollback(null)}
      />
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
  const { data: report, isLoading } = usePolicyAcknowledgments(policyId);
  const { data: ackStatus } = useAcknowledgmentStatus(policyId);

  const totalUsers = report?.total_targeted ?? 0;
  const acknowledgedCount = report?.acknowledged?.length || 0;
  const percentage = totalUsers > 0 ? Math.round((acknowledgedCount / totalUsers) * 100) : 0;

  if (isLoading) return <TableSkeleton rows={4} columns={3} />;

  const acknowledgments = report?.acknowledged || [];
  const pending = report?.pending || [];

  const allUsers = [
    ...acknowledgments.map(a => ({ _id: a._id, user: a.user, acknowledged_at: a.acknowledged_at, status: 'Acknowledged' as const })),
    ...pending.map(p => ({ _id: p._id, user: p.user, acknowledged_at: null, status: 'Pending' as const }))
  ];

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

      {/* Users List */}
      <div>
        <h4 className="text-sm font-semibold text-ink mb-2">
          Targeted Users
        </h4>
        {allUsers.length > 0 ? (
          <div className="border border-line rounded-md overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-surface-base border-b border-line">
                <tr>
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                    User
                  </th>
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                    Status
                  </th>
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                    Acknowledged At
                  </th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map((item) => (
                  <tr key={item._id} className="border-b border-line last:border-0">
                    <td className="h-10 px-4 text-sm text-ink">
                      {item.user.full_name}
                    </td>
                    <td className="h-10 px-4">
                      {item.status === 'Acknowledged' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                          Acknowledged
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="h-10 px-4 text-sm text-ink-secondary">
                      {item.acknowledged_at ? formatDate(item.acknowledged_at) : '—'}
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
              No users are targeted by this policy yet
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
  const { data: assignments, isLoading } = usePolicyAssignments(policyId);

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

      {/* Current Assignment Rules */}
      {isLoading ? (
        <TableSkeleton rows={3} columns={3} />
      ) : assignments && assignments.length > 0 ? (
        <div className="border border-line rounded-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-white/5 border-b border-line">
              <tr>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Target Type
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Target
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((rule) => (
                <tr key={rule._id} className="border-b border-line last:border-0">
                  <td className="h-10 px-4">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2.5 py-0.5 tracking-wide bg-accent-light text-accent">
                      {TARGET_TYPE_LABELS[rule.target_type]}
                    </span>
                  </td>
                  <td className="h-10 px-4 text-sm font-medium text-ink">
                    {rule.target_label}
                  </td>
                  <td className="h-10 px-4 text-sm text-ink-secondary">
                    {formatDate(rule.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center border border-line rounded-md bg-surface-alt">
          <Target className="w-8 h-8 text-ink-muted mx-auto mb-2" />
          <p className="text-sm text-ink-secondary mb-1">
            No assignment rules configured yet
          </p>
          <p className="text-xs text-ink-muted">
            Click "Edit Targeting" to define who this policy applies to.
          </p>
        </div>
      )}

      {/* Targeting Modal */}
      {isTargetingModalOpen && (
        <TargetingModal
          isOpen={isTargetingModalOpen}
          policyId={policyId}
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
  policyId: string;
  onClose: () => void;
  saveMutation: ReturnType<typeof useSaveAssignmentRules>;
  onSaved: () => void;
}

function TargetingModal({ isOpen, policyId, onClose, saveMutation, onSaved }: TargetingModalProps) {
  const { data: departments } = useDepartments();
  const { data: roles } = useRoles();
  const { data: groups } = useGroups();
  const { data: users } = useUsers();
  const { data: assignments } = usePolicyAssignments(policyId);
  const conflictCheckMutation = usePolicyConflictCheck(policyId);
  const simulateMutation = useSimulatePolicy();
  const [conflicts, setConflicts] = useState<{
    has_conflicts: boolean;
    conflicting_policies: Array<{ conflict_reason: string }>;
  } | null>(null);
  const [rules, setRules] = useState<Array<{ target_type: PolicyTargetType; target_id: string }>>([
    { target_type: 'all', target_id: 'all' },
  ]);
  const [simulationResult, setSimulationResult] = useState<{
    affected_users: any[];
    affected_groups: string[];
    expected_changes: string[];
  } | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  React.useEffect(() => {
    if (assignments && assignments.length > 0) {
      setRules(assignments.map(a => ({ target_type: a.target_type, target_id: a.target_id })));
    } else if (assignments?.length === 0) {
      setRules([{ target_type: 'all', target_id: 'all' }]);
    }
  }, [assignments]);

  const addRule = () => {
    setRules([...rules, { target_type: 'department', target_id: '' }]);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, updates: Partial<{ target_type: PolicyTargetType; target_id: string }>) => {
    setRules((prevRules) => {
      const updated = [...prevRules];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  const handleSave = () => {
    const validRules = rules.filter((r) => r.target_id && r.target_id !== '');
    setConflicts(null);
    conflictCheckMutation.mutate(validRules, {
      onSuccess: (data) => {
        if (data.has_conflicts) {
          setConflicts(data);
        } else {
          saveMutation.mutate(validRules, { onSuccess: onSaved });
        }
      }
    });
  };

  // Render target-specific selector based on target_type
  const renderTargetSelector = (rule: { target_type: PolicyTargetType; target_id: string }, index: number) => {
    if (rule.target_type === 'all') {
      return (
        <input
          type="hidden"
          value="all"
          onChange={() => updateRule(index, { target_id: 'all' })}
        />
      );
    }

    if (rule.target_type === 'department') {
      return (
        <select
          value={rule.target_id}
          onChange={(e) => updateRule(index, { target_id: e.target.value })}
          className="flex-1 h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          aria-label="Select department"
        >
          <option value="">Select department...</option>
          {departments?.map((dept) => (
            <option key={dept._id} value={dept._id}>
              {dept.name}
            </option>
          ))}
        </select>
      );
    }

    if (rule.target_type === 'role') {
      return (
        <select
          value={rule.target_id}
          onChange={(e) => updateRule(index, { target_id: e.target.value })}
          className="flex-1 h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          aria-label="Select role"
        >
          <option value="">Select role...</option>
          {roles?.map((role) => (
            <option key={role._id} value={role._id}>
              {role.name}
            </option>
          ))}
        </select>
      );
    }

    if (rule.target_type === 'group') {
      return (
        <select
          value={rule.target_id}
          onChange={(e) => updateRule(index, { target_id: e.target.value })}
          className="flex-1 h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          aria-label="Select group"
        >
          <option value="">Select group...</option>
          {groups?.map((group) => (
            <option key={group._id} value={group._id}>
              {group.name}
            </option>
          ))}
        </select>
      );
    }

    if (rule.target_type === 'user') {
      return (
        <select
          value={rule.target_id}
          onChange={(e) => updateRule(index, { target_id: e.target.value })}
          className="flex-1 h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          aria-label="Select user"
        >
          <option value="">Select user...</option>
          {users?.map((user) => (
            <option key={user._id} value={user._id}>
              {user.full_name}
            </option>
          ))}
        </select>
      );
    }

    return null;
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
            onClick={() => {
              setSimulationError(null);
              const validRules = rules.filter((r) => r.target_id && r.target_id !== '');
              simulateMutation.mutate(validRules, {
                onSuccess: (data) => setSimulationResult(data),
                onError: (err) => {
                  setSimulationError('Preview failed: Unable to connect to the server or simulation error occurred.');
                  setSimulationResult(null);
                }
              });
            }}
            disabled={simulateMutation.isPending || rules.every((r) => !r.target_id)}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed mr-auto flex items-center gap-2"
          >
            <Eye className="w-4 h-4" />
            {simulateMutation.isPending ? 'Simulating...' : 'Preview Impact'}
          </button>
          <button
            onClick={onClose}
            disabled={saveMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || conflictCheckMutation.isPending || rules.every((r) => !r.target_id)}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending || conflictCheckMutation.isPending ? 'Saving...' : 'Save Rules'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {rules.map((rule, index) => (
          <div key={index} className="flex items-center gap-3">
            <select
              value={rule.target_type}
              onChange={(e) => {
                const newType = e.target.value as PolicyTargetType;
                updateRule(index, { 
                  target_type: newType, 
                  target_id: newType === 'all' ? 'all' : '' 
                });
              }}
              className="h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 w-40"
              aria-label="Select target type"
            >
              {Object.entries(TARGET_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            {renderTargetSelector(rule, index)}

            <button
              onClick={() => removeRule(index)}
              className="h-8 w-8 flex items-center justify-center rounded text-ink-secondary hover:text-error hover:bg-error-light transition-colors flex-shrink-0"
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

        {conflicts?.has_conflicts && (
          <div className="p-4 bg-error-light border border-error-border rounded-md mt-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-error mb-1">
                  Conflict Detected
                </p>
                <ul className="text-xs text-error space-y-1 pl-4 list-disc">
                  {conflicts.conflicting_policies.map((c, i) => (
                    <li key={i}>{c.conflict_reason}</li>
                  ))}
                </ul>
                <p className="text-xs text-error mt-2 font-medium">
                  You must resolve these conflicts by modifying the target rules or archiving conflicting policies before saving.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="p-3 bg-info-light border border-info-border rounded-md mt-4">
          <p className="text-xs text-info">
            <strong>RULE-08:</strong> Before saving, the system will automatically check for conflicting policies targeting the same user population.
          </p>
        </div>

        {simulationError && (
          <div className="p-3 bg-error-light border border-error-border rounded-md mt-4">
            <p className="text-xs text-error flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {simulationError}
            </p>
          </div>
        )}

        {simulationResult && (
          <div className="mt-6 p-4 bg-surface-alt border border-line rounded-md">
            <h4 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              Simulation Results
            </h4>
            
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-ink-secondary mb-1">Affected Users ({simulationResult.affected_users.length})</p>
                <div className="max-h-32 overflow-y-auto border border-line rounded bg-white text-xs text-ink divide-y divide-line">
                  {simulationResult.affected_users.length > 0 ? (
                    simulationResult.affected_users.map((u) => (
                      <div key={u._id} className="p-2 flex justify-between">
                        <span>{u.full_name}</span>
                        <span className="text-ink-muted">{u.email}</span>
                      </div>
                    ))
                  ) : (
                    <div className="p-2 text-ink-muted">No users affected</div>
                  )}
                </div>
              </div>

              {simulationResult.affected_groups.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-secondary mb-1">Affected Groups/Roles</p>
                  <ul className="list-disc list-inside text-xs text-ink pl-1">
                    {simulationResult.affected_groups.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-ink-secondary mb-1">Expected Changes</p>
                <ul className="list-disc list-inside text-xs text-ink pl-1">
                  {simulationResult.expected_changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

