// src/features/audit/components/AuditEventDetail.tsx
import { Modal } from '@/components/ui/Modal';
import type { AuditEvent } from '@/types';

interface AuditEventDetailProps {
  event: (AuditEvent & { actor_name?: string }) | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Audit Event Detail Modal
 * Shows full details of an audit event with before/after state.
 * Used on: AuditLogsPage
 */
export function AuditEventDetail({ event, isOpen, onClose }: AuditEventDetailProps) {
  if (!event) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatState = (state: unknown) => {
    if (!state) return 'No changes recorded';
    return JSON.stringify(state, null, 2);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Audit Event Details"
      description={`Action: ${event.action} on ${event.object_type}`}
      size="xl"
    >
      <div className="space-y-6">
        {/* Event Metadata */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
              Timestamp
            </label>
            <p className="mt-1 text-sm text-ink">{formatDate(event.created_at)}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
              Actor
            </label>
            <p className="mt-1 text-sm text-ink">{event.actor_name || event.actor_email}</p>
            <p className="text-xs text-ink-secondary font-mono">{event.actor_email}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
              Module
            </label>
            <p className="mt-1 text-sm text-ink capitalize">{event.module.replace('_', ' ')}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
              Action
            </label>
            <p className="mt-1">
              <span className="inline-flex items-center font-mono text-xs bg-accent-light text-accent border border-indigo-200 rounded-md px-2 py-0.5">
                {event.action}
              </span>
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
              Object Type
            </label>
            <p className="mt-1 text-sm text-ink">{event.object_type}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
              Object Label
            </label>
            <p className="mt-1 text-sm text-ink">{event.object_label}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
              Object ID
            </label>
            <p className="mt-1 text-sm font-mono text-ink-secondary">{event.object_id}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
              IP Address
            </label>
            <p className="mt-1 text-sm font-mono text-ink-secondary">{event.ip_address || '—'}</p>
          </div>
        </div>

        {/* User Agent */}
        {event.user_agent && (
          <div>
            <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
              User Agent
            </label>
            <p className="mt-1 text-xs font-mono text-ink-secondary break-all">{event.user_agent}</p>
          </div>
        )}

        {/* Before/After State */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
              Before State
            </h4>
            <pre className="bg-surface-alt rounded-md border border-line p-4 text-xs font-mono text-ink overflow-auto max-h-80">
              {formatState(event.before_state)}
            </pre>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
              After State
            </h4>
            <pre className="bg-surface-alt rounded-md border border-line p-4 text-xs font-mono text-ink overflow-auto max-h-80">
              {formatState(event.after_state)}
            </pre>
          </div>
        </div>
      </div>
    </Modal>
  );
}
