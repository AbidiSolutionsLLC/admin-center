// src/features/people/components/OffboardingModal.tsx
import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useProductOpenItems } from '../hooks/useProductOpenItems';
import { useUpdateLifecycle } from '../hooks/useUpdateLifecycle';
import {
  AlertTriangle,
  CheckCircle2,
  Users,
  Briefcase,
  FileSignature,
  Headphones,
  RefreshCw,
  Info,
} from 'lucide-react';
import type { User } from '@/types';

interface OffboardingModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const OffboardingModal: React.FC<OffboardingModalProps> = ({
  user,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { counts, isUnavailable, isLoading, isError, refetch } = useProductOpenItems(
    user._id,
    isOpen
  );
  const updateLifecycle = useUpdateLifecycle(user._id);
  const [reason, setReason] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);

  const handleConfirmTermination = () => {
    updateLifecycle.mutate(
      {
        lifecycle_state: 'terminated',
        reason: reason.trim() || undefined,
      },
      {
        onSuccess: () => {
          setIsCompleted(true);
          onSuccess?.();
        },
      }
    );
  };

  const handleClose = () => {
    setIsCompleted(false);
    setReason('');
    onClose();
  };

  // Helper counts resolvers
  const pendingLeaves = counts?.people?.pending_leave_requests ?? 0;
  const pendingApprovals =
    counts?.people?.pending_approvals ??
    counts?.people?.pending_approvals_as_manager ??
    0;

  const openTasks =
    counts?.projects?.open_tasks ??
    counts?.projects?.open_assigned_tasks ??
    0;
  const ownedProjects = counts?.projects?.owned_projects ?? 0;

  const signAsSender = counts?.sign?.agreements_as_sender_pending ?? 0;
  const signAwaiting = counts?.sign?.agreements_awaiting_signature ?? 0;

  const deskTickets = counts?.desk?.assigned_open_tickets ?? 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isCompleted ? 'Termination Recorded' : 'Offboard & Terminate Member'}
      description={
        isCompleted
          ? `Offboarding initiated for ${user.full_name}`
          : `Review open product items and automated cleanup actions for ${user.full_name}`
      }
      size="lg"
      footer={
        isCompleted ? (
          <button
            type="button"
            onClick={handleClose}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors"
          >
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleClose}
              disabled={updateLifecycle.isPending}
              className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmTermination}
              disabled={updateLifecycle.isPending}
              className="h-9 px-4 text-sm font-medium rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {updateLifecycle.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Recording Termination...
                </>
              ) : (
                'Confirm Termination'
              )}
            </button>
          </>
        )
      }
    >
      {isCompleted ? (
        /* Progress / Completion View */
        <div className="py-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-lg font-semibold text-ink">Termination Recorded</h3>
            <p className="text-sm text-ink-secondary leading-relaxed">
              Termination recorded; products apply it within seconds.
            </p>
            <p className="text-xs text-ink-muted">
              Active sessions have been revoked and product cleanup actions are in progress.
            </p>
          </div>
        </div>
      ) : (
        /* Offboarding Review View */
        <div className="space-y-5">
          {/* Warning Banner */}
          <div className="flex items-start gap-3 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-950">Permanent Lifecycle Action</p>
              <p className="text-red-800 mt-0.5">
                Transitioning to <strong>Terminated</strong> will revoke all active sessions for{' '}
                {user.full_name} and trigger automatic offboarding playbooks across all integrated products.
              </p>
            </div>
          </div>

          {/* Counts Unavailable State (503) */}
          {isUnavailable && (
            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-950">Counts unavailable</p>
                <p className="text-amber-800 mt-0.5">
                  Real-time open item counts are currently unavailable. You may still proceed with termination;
                  product deprovisioning will execute asynchronously.
                </p>
              </div>
            </div>
          )}

          {/* Error retry option if non-503 failure */}
          {isError && !isUnavailable && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-alt border border-line text-xs">
              <span className="text-ink-secondary">Unable to load live product open items.</span>
              <button
                type="button"
                onClick={() => refetch()}
                className="text-primary hover:underline font-medium"
              >
                Retry loading
              </button>
            </div>
          )}

          {/* Products Open Items & Actions Grid (07 §6) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* 1. People */}
            <div className="p-4 rounded-xl border border-line bg-white shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-ink">People</h4>
                </div>
                {!isLoading && !isUnavailable && (
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-surface-alt border border-line text-ink">
                    {pendingLeaves + pendingApprovals} open
                  </span>
                )}
              </div>

              {isLoading ? (
                <div className="h-10 bg-surface-alt rounded animate-pulse" />
              ) : (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-ink-secondary">
                    <span>Pending leave requests:</span>
                    <span className="font-mono font-medium text-ink">
                      {isUnavailable ? '—' : pendingLeaves}
                    </span>
                  </div>
                  <div className="flex justify-between text-ink-secondary">
                    <span>Pending approvals as manager:</span>
                    <span className="font-mono font-medium text-ink">
                      {isUnavailable ? '—' : pendingApprovals}
                    </span>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-ink-muted border-t border-line/60 pt-2 leading-relaxed">
                <strong>Playbook:</strong> Pending leave requests cancelled and balances restored; approvals pass to manager's manager; HR records retained.
              </p>
            </div>

            {/* 2. Projects */}
            <div className="p-4 rounded-xl border border-line bg-white shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-ink">Projects</h4>
                </div>
                {!isLoading && !isUnavailable && (
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-surface-alt border border-line text-ink">
                    {openTasks + ownedProjects} open
                  </span>
                )}
              </div>

              {isLoading ? (
                <div className="h-10 bg-surface-alt rounded animate-pulse" />
              ) : (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-ink-secondary">
                    <span>Open assigned tasks:</span>
                    <span className="font-mono font-medium text-ink">
                      {isUnavailable ? '—' : openTasks}
                    </span>
                  </div>
                  <div className="flex justify-between text-ink-secondary">
                    <span>Owned projects:</span>
                    <span className="font-mono font-medium text-ink">
                      {isUnavailable ? '—' : ownedProjects}
                    </span>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-ink-muted border-t border-line/60 pt-2 leading-relaxed">
                <strong>Playbook:</strong> Open tasks reassigned to project owner; owned projects reassigned to member's manager.
              </p>
            </div>

            {/* 3. Sign */}
            <div className="p-4 rounded-xl border border-line bg-white shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <FileSignature className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-ink">Sign</h4>
                </div>
                {!isLoading && !isUnavailable && (
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-surface-alt border border-line text-ink">
                    {signAsSender + signAwaiting} open
                  </span>
                )}
              </div>

              {isLoading ? (
                <div className="h-10 bg-surface-alt rounded animate-pulse" />
              ) : (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-ink-secondary">
                    <span>Agreements as sender (pending):</span>
                    <span className="font-mono font-medium text-ink">
                      {isUnavailable ? '—' : signAsSender}
                    </span>
                  </div>
                  <div className="flex justify-between text-ink-secondary">
                    <span>Agreements awaiting signature:</span>
                    <span className="font-mono font-medium text-ink">
                      {isUnavailable ? '—' : signAwaiting}
                    </span>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-ink-muted border-t border-line/60 pt-2 leading-relaxed">
                <strong>Playbook:</strong> Agreements as sender flagged for reassignment; senders of agreements awaiting signature notified; nothing voided.
              </p>
            </div>

            {/* 4. Desk */}
            <div className="p-4 rounded-xl border border-line bg-white shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Headphones className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-ink">Desk</h4>
                </div>
                {!isLoading && !isUnavailable && (
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-surface-alt border border-line text-ink">
                    {deskTickets} open
                  </span>
                )}
              </div>

              {isLoading ? (
                <div className="h-10 bg-surface-alt rounded animate-pulse" />
              ) : (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-ink-secondary">
                    <span>Assigned open tickets:</span>
                    <span className="font-mono font-medium text-ink">
                      {isUnavailable ? '—' : deskTickets}
                    </span>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-ink-muted border-t border-line/60 pt-2 leading-relaxed">
                <strong>Playbook:</strong> Assigned open tickets returned to support-group queue unassigned.
              </p>
            </div>
          </div>

          {/* Reason Field */}
          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              Termination Reason / Notes <span className="text-ink-muted font-normal">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. End of contract, voluntary departure, reorganization"
              rows={2}
              className="w-full px-3 py-2 text-xs rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 resize-none"
            />
          </div>
        </div>
      )}
    </Modal>
  );
};
