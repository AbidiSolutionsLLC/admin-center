import { useState, useMemo } from 'react';
import { usePendingApprovals, useApproveRequest, useRejectRequest } from '@/features/workflows/hooks/useApprovals';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { formatDate } from '@/utils/formatDate';
import { CheckCircle, XCircle, Clock, Search, X } from 'lucide-react';
import type { ApprovalRequest } from '@/types';

export default function ApprovalsPage() {
  const { data: response, isLoading } = usePendingApprovals();
  const approvals = response?.data || [];

  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [comments, setComments] = useState('');
  const [search, setSearch] = useState('');

  const approveMutation = useApproveRequest();
  const rejectMutation = useRejectRequest();

  const handleDecision = () => {
    if (!selectedApproval || !decision) return;
    
    const action = decision === 'approve' ? approveMutation : rejectMutation;
    action.mutate(
      { id: selectedApproval._id, comments },
      {
        onSuccess: () => {
          setSelectedApproval(null);
          setDecision(null);
          setComments('');
        },
      }
    );
  };

  // Filter approvals based on search
  const filteredApprovals = useMemo(() => {
    if (!search) return approvals;
    const lowerSearch = search.toLowerCase();
    return approvals.filter((approval) => {
      const runId = String((approval.workflow_run_id as any)?._id || '').toLowerCase();
      const stepName = String((approval.workflow_step_id as any)?.name || '').toLowerCase();
      return runId.includes(lowerSearch) || stepName.includes(lowerSearch);
    });
  }, [approvals, search]);

  const hasData = approvals.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader approvalCount={approvals.length} />

      {/* ── Loading State ── */}
      {isLoading ? (
        <div className="bg-white rounded-lg border border-line overflow-hidden p-4">
          <TableSkeleton rows={5} />
        </div>
      ) : (
        <>
          {/* ── Empty State ── */}
          {!hasData ? (
            <EmptyState
              icon={CheckCircle}
              title="No pending approvals"
              description="You are all caught up! There are no requests requiring your approval."
            />
          ) : (
            <>
              {/* ── Filter Bar ── */}
              <FilterBar
                search={search}
                onSearchChange={setSearch}
                onClearFilters={() => setSearch('')}
              />

              {/* ── Approvals Table ── */}
              {filteredApprovals.length === 0 ? (
                <div className="bg-white rounded-lg border border-line shadow-card p-16 text-center">
                  <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center mx-auto mb-3">
                    <Search className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-ink mb-1">No results found</h3>
                  <p className="text-sm text-ink-secondary">
                    Try adjusting your search criteria.
                  </p>
                  <button
                    onClick={() => setSearch('')}
                    className="mt-4 h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
                  >
                    Clear Search
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-white/5 border-b border-line">
                      <tr>
                        <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                          Workflow Run ID
                        </th>
                        <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                          Step
                        </th>
                        <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                          Status
                        </th>
                        <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                          Requested At
                        </th>
                        <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApprovals.map((approval) => (
                        <ApprovalRow
                          key={approval._id}
                          approval={approval}
                          onApprove={() => {
                            setSelectedApproval(approval);
                            setDecision('approve');
                          }}
                          onReject={() => {
                            setSelectedApproval(approval);
                            setDecision('reject');
                          }}
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

      {/* ── Decision Modal ── */}
      {selectedApproval && decision && (
        <Modal
          isOpen={true}
          onClose={() => {
            setSelectedApproval(null);
            setDecision(null);
            setComments('');
          }}
          title={decision === 'approve' ? 'Approve Request' : 'Reject Request'}
          description={
            decision === 'approve'
              ? 'Are you sure you want to approve this request? The workflow will resume.'
              : 'Are you sure you want to reject this request? The workflow will fail.'
          }
          size="sm"
          footer={
            <>
              <button
                onClick={() => {
                  setSelectedApproval(null);
                  setDecision(null);
                  setComments('');
                }}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDecision}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className={`h-9 px-4 text-sm font-medium rounded-md text-white transition-colors ${
                  decision === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-error hover:bg-error/90'
                }`}
              >
                {approveMutation.isPending || rejectMutation.isPending
                  ? 'Saving...'
                  : decision === 'approve'
                  ? 'Confirm Approval'
                  : 'Confirm Rejection'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-ink block mb-1.5">
                Comments (Optional)
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
                placeholder={`Add a note for why you are ${decision}ing this request...`}
                className="w-full p-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface PageHeaderProps {
  approvalCount?: number;
}

function PageHeader({ approvalCount }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">
          Pending Approvals
        </h1>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-sm text-ink-secondary">
            Review and act upon requests that require your approval.
          </p>
          {approvalCount !== undefined && approvalCount > 0 && (
            <span className="text-xs text-ink-muted">
              {approvalCount} {approvalCount === 1 ? 'approval' : 'approvals'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onClearFilters: () => void;
}

function FilterBar({
  search,
  onSearchChange,
  onClearFilters,
}: FilterBarProps) {
  const hasFilters = Boolean(search);

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 max-w-[320px] relative">
        <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by Run ID or Step..."
          className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        />
      </div>

      {hasFilters && (
        <button
          onClick={onClearFilters}
          className="h-9 px-3 text-sm font-medium rounded-md text-ink-secondary hover:text-ink hover:bg-surface-alt transition-colors flex items-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          Clear Filter
        </button>
      )}
    </div>
  );
}

interface ApprovalRowProps {
  approval: ApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
}

function ApprovalRow({ approval, onApprove, onReject }: ApprovalRowProps) {
  const runId = (approval.workflow_run_id as any)?._id || 'Unknown';
  const stepName = (approval.workflow_step_id as any)?.name || 'Approval Step';

  return (
    <tr className="border-b border-line hover:bg-surface-alt/50 transition-colors group">
      <td className="px-4 py-3">
        <span className="text-sm font-medium text-ink">
          {runId}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-ink-secondary">
        {stepName}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3.5 h-3.5" />
          Pending
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-ink-secondary">
        {formatDate(approval.created_at)}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onApprove}
            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
            title="Approve"
          >
            <CheckCircle className="w-4 h-4" />
          </button>
          <button
            onClick={onReject}
            className="p-1.5 text-error hover:bg-error-light rounded transition-colors"
            title="Reject"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
