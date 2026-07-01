import { useState } from 'react';
import { usePendingApprovals, useApproveRequest, useRejectRequest } from '@/features/workflows/hooks/useApprovals';
import { DataTable } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { formatDate } from '@/utils/formatDate';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import type { ApprovalRequest } from '@/types';

export default function ApprovalsPage() {
  const { data: response, isLoading } = usePendingApprovals();
  const approvals = response?.data || [];

  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [comments, setComments] = useState('');

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">
          Pending Approvals
        </h1>
        <p className="text-sm text-ink-secondary">
          Review and act upon requests that require your approval.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-line overflow-hidden">
        <DataTable
          columns={[
            {
              header: 'Workflow Run ID',
              accessorKey: 'workflow_run_id._id',
              cell: (row) => (
                <div className="text-sm font-medium text-ink">
                  {(row.workflow_run_id as any)?._id || 'Unknown'}
                </div>
              ),
            },
            {
              header: 'Step',
              accessorKey: 'workflow_step_id.name',
              cell: (row) => (
                <div className="text-sm text-ink-secondary">
                  {(row.workflow_step_id as any)?.name || 'Approval Step'}
                </div>
              ),
            },
            {
              header: 'Status',
              accessorKey: 'status',
              cell: (row) => (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  <Clock className="w-3.5 h-3.5" />
                  Pending
                </span>
              ),
            },
            {
              header: 'Requested At',
              accessorKey: 'created_at',
              cell: (row) => (
                <span className="text-sm text-ink-secondary">
                  {formatDate(row.created_at)}
                </span>
              ),
            },
            {
              header: 'Actions',
              id: 'actions',
              cell: (row) => (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedApproval(row);
                      setDecision('approve');
                    }}
                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                    title="Approve"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setSelectedApproval(row);
                      setDecision('reject');
                    }}
                    className="p-1.5 text-error hover:bg-error-light rounded transition-colors"
                    title="Reject"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ),
            },
          ]}
          data={approvals}
          isLoading={isLoading}
          emptyState={{
            icon: CheckCircle,
            title: 'No pending approvals',
            description: 'You are all caught up!',
          }}
        />
      </div>

      {/* Decision Modal */}
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
