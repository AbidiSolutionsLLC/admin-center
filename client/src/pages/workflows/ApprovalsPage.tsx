import { useState, useMemo } from 'react';
import { usePendingApprovals, useApproveRequest, useRejectRequest } from '@/features/workflows/hooks/useApprovals';
import { Modal } from '@/components/ui/Modal';
import { ListPage } from '@/components/templates/ListPage';
import { formatDate } from '@/utils/formatDate';
import { CheckCircle, XCircle, Clock, Search } from 'lucide-react';
import type { ApprovalRequest } from '@/types';

export default function ApprovalsPage() {
  const { data: response, isLoading, isError, refetch } = usePendingApprovals();
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
    <>
      <ListPage
        title="Pending approvals"
        subtitle={`Review and act upon requests that require your approval.${hasData ? ` ${approvals.length} pending.` : ''}`}
        toolbar={hasData ? { search: { placeholder: 'Search by run ID or step', value: search, onChange: setSearch } } : undefined}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isEmpty={!hasData}
        emptyTitle="No pending approvals"
        emptyDescription="You are all caught up. There are no requests requiring your approval."
      >
        {filteredApprovals.length === 0 ? (
          <div className="bg-surface rounded-card border border-line p-16 text-center">
            <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center mx-auto mb-3">
              <Search className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-ink mb-1">No results found</h3>
            <p className="text-sm text-ink-secondary">Try adjusting your search criteria.</p>
            <button
              onClick={() => setSearch('')}
              className="mt-4 h-9 px-4 text-sm font-medium rounded-md border border-line bg-surface text-ink hover:bg-surface-hover transition-colors"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="bg-surface rounded-card border border-line overflow-hidden">
            <table className="w-full">
              <thead className="bg-surface-alt border-b border-line">
                <tr>
                  <th className="text-label uppercase text-ink-secondary h-10 px-4 text-left">Workflow run ID</th>
                  <th className="text-label uppercase text-ink-secondary h-10 px-4 text-left">Step</th>
                  <th className="text-label uppercase text-ink-secondary h-10 px-4 text-left">Status</th>
                  <th className="text-label uppercase text-ink-secondary h-10 px-4 text-left">Requested at</th>
                  <th className="text-label uppercase text-ink-secondary h-10 px-4 text-right">Actions</th>
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
      </ListPage>

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
                className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-surface text-ink hover:bg-surface-alt transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDecision}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className={`h-9 px-4 text-sm font-medium rounded-md text-white transition-colors ${
                  decision === 'approve'
                    ? 'bg-success hover:bg-success/90'
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
                className="w-full p-3 text-sm rounded-md border border-line bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
              />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

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
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-warning/10 text-warning border border-warning/30">
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
            className="p-1.5 text-success hover:bg-success/10 rounded transition-colors"
            title="Approve"
          >
            <CheckCircle className="w-4 h-4" />
          </button>
          <button
            onClick={onReject}
            className="p-1.5 text-error hover:bg-error/10 rounded transition-colors"
            title="Reject"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
