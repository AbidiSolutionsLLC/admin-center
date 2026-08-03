// src/features/data-fields/components/FieldHistoryDialog.tsx
import { History, Clock, User, Eye, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useFieldVersions } from '../hooks/useFieldVersions';
import { useRollbackFieldVersion } from '../hooks/useRollbackFieldVersion';
import { formatDateTime } from '@/utils/formatDate';
import { cn } from '@/utils/cn';
import type { CustomField, CustomFieldVersion, VersionChangeType } from '@/types';
import { useState } from 'react';

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  boolean: 'Boolean',
  select: 'Select',
  multi_select: 'Multi Select',
  url: 'URL',
  email: 'Email',
  phone: 'Phone',
};

const VISIBILITY_LABELS: Record<string, string> = {
  all: 'Everyone',
  admin_only: 'Admins Only',
  role_specific: 'Specific Roles',
};

const CHANGE_TYPE_LABELS: Record<VersionChangeType, string> = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
  restored: 'Restored',
};

const CHANGE_TYPE_VARIANTS: Record<VersionChangeType, 'success' | 'warning' | 'error' | 'info'> = {
  created: 'success',
  updated: 'warning',
  deleted: 'error',
  restored: 'info',
};

const CHANGE_TYPE_ICONS: Record<VersionChangeType, React.ReactNode> = {
  created: <History className="w-3.5 h-3.5" />,
  updated: <Clock className="w-3.5 h-3.5" />,
  deleted: <Trash2 className="w-3.5 h-3.5" />,
  restored: <History className="w-3.5 h-3.5" />,
};

interface FieldHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fieldId: string | null;
  field: CustomField | null;
}

interface SnapshotDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  version: CustomFieldVersion;
}

function SnapshotDetailModal({ isOpen, onClose, version }: SnapshotDetailModalProps) {
  const snapshot = version.snapshot as Record<string, unknown>;

  const fieldsToShow: Array<{ label: string; value: unknown }> = [
    { label: 'Field Name', value: snapshot.name },
    { label: 'Display Label', value: snapshot.label },
    { label: 'Field Type', value: snapshot.field_type },
    { label: 'Target Object', value: snapshot.target_object },
    { label: 'Required', value: snapshot.required ? 'Yes' : 'No' },
    { label: 'Visibility', value: snapshot.visibility },
    { label: 'Is System Field', value: snapshot.is_system_field ? 'Yes' : 'No' },
    { label: 'Display Order', value: snapshot.display_order },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Version v${version.version_number} Snapshot`}
      description={`Full field configuration as it existed at version ${version.version_number}.`}
      size="md"
      footer={
        <button
          onClick={onClose}
          className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
        >
          Close
        </button>
      }
    >
      <div className="space-y-3">
        {fieldsToShow.map((field) => (
          <div key={field.label} className="flex items-start justify-between gap-4 py-2 border-b border-line last:border-0">
            <span className="text-sm text-ink-secondary min-w-[140px]">{field.label}</span>
            <span className="text-sm text-ink font-medium text-right">
              {field.value !== undefined && field.value !== null
                ? String(field.value)
                : <span className="text-ink-muted italic">—</span>}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/**
 * FieldHistoryDialog Component
 * Displays the version history for a custom field in a modal dialog.
 * Shows each version with change type, snapshot summary, changed by, and date.
 * Provides rollback action (for non-system fields) with confirmation dialog.
 *
 * Follows the same pattern as PoliciesPage's PolicyVersionsView.
 */
export function FieldHistoryDialog({ isOpen, onClose, fieldId, field }: FieldHistoryDialogProps) {
  const { data: versions, isLoading, isError, refetch } = useFieldVersions(fieldId);
  const rollbackMutation = useRollbackFieldVersion();

  const [versionToRollback, setVersionToRollback] = useState<{ number: number } | null>(null);
  const [snapshotToView, setSnapshotToView] = useState<CustomFieldVersion | null>(null);

  const isSystemField = field?.is_system_field ?? false;

  const handleRollbackConfirm = () => {
    if (!fieldId || !versionToRollback) return;
    rollbackMutation.mutate(
      { fieldId, version_number: versionToRollback.number },
      { onSuccess: () => {
        setVersionToRollback(null);
      } },
    );
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Schema History"
        description={field ? `Version history for "${field.label}"` : 'Version history'}
        size="lg"
      >
        {/* Loading */}
        {isLoading && <TableSkeleton rows={5} columns={6} />}

        {/* Error */}
        {isError && (
          <ErrorState
            title="Failed to load version history"
            description="Something went wrong. Please try again."
            onRetry={refetch}
          />
        )}

        {/* Empty */}
        {!isLoading && !isError && (!versions || versions.length === 0) && (
          <div className="text-center py-12">
            <History className="w-10 h-10 text-ink-muted mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-ink mb-1">No version history</h3>
            <p className="text-sm text-ink-secondary">No snapshots have been recorded for this field.</p>
          </div>
        )}

        {/* Data */}
        {!isLoading && !isError && versions && versions.length > 0 && (
          <div className="border border-line rounded-md overflow-hidden">
            <table className="w-full">
              <thead className="bg-surface-alt border-b border-line">
                <tr>
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                    Version
                  </th>
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                    Change Type
                  </th>
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                    Snapshot
                  </th>
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                    Changed By
                  </th>
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                    Date
                  </th>
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => {
                  const snapshot = version.snapshot as Record<string, unknown>;
                  const changeType = version.change_type;
                  const isCurrent = version.version_number === versions[0]?.version_number;

                  return (
                    <tr
                      key={version._id}
                      className={cn(
                        'border-b border-line last:border-0 transition-colors',
                        isCurrent && 'bg-primary-light/30',
                      )}
                    >
                      <td className="h-14 px-4 text-sm font-medium text-ink">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-ink-muted">
                            v{version.version_number}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-semibold text-primary bg-primary-light border border-primary/20 rounded-full px-1.5 py-0.25">
                              Current
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="h-14 px-4">
                        <StatusBadge variant={CHANGE_TYPE_VARIANTS[changeType]}>
                          <div className="flex items-center gap-1">
                            {CHANGE_TYPE_ICONS[changeType]}
                            {CHANGE_TYPE_LABELS[changeType]}
                          </div>
                        </StatusBadge>
                      </td>
                      <td className="h-14 px-4">
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium text-ink">
                            {String(snapshot.label || snapshot.name || 'Unknown')}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-ink-muted">
                            <span className="inline-flex items-center text-[10px] font-semibold border rounded-full px-2 py-0.5 bg-accent-light/20 text-accent border-accent/20">
                              {FIELD_TYPE_LABELS[String(snapshot.field_type)] || snapshot.field_type}
                            </span>
                            {snapshot.required ? (
                              <span className="text-success">Required</span>
                            ) : (
                              <span className="text-ink-muted">Optional</span>
                            )}
                          </div>
                          {version.change_summary && (
                            <p className="text-xs text-ink-secondary mt-1 line-clamp-1">
                              {version.change_summary}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="h-14 px-4">
                        <div className="flex items-center gap-1.5 text-sm text-ink">
                          <User className="w-3.5 h-3.5 text-ink-muted" />
                          <span>
                            {version.changed_by?.full_name || version.changed_by?.email || '—'}
                          </span>
                          {version.changed_by?.email && (
                            <span className="text-xs text-ink-muted">
                              ({version.changed_by.email})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="h-14 px-4 text-sm text-ink-secondary">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-ink-muted" />
                          {formatDateTime(version.created_at)}
                        </div>
                      </td>
                      <td className="h-14 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSnapshotToView(version)}
                            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-surface-alt text-ink-secondary transition-colors"
                            title="View snapshot"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {!isSystemField && (
                            <button
                              onClick={() => setVersionToRollback({ number: version.version_number })}
                              disabled={rollbackMutation.isPending}
                              className="h-7 px-2 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                              title={`Rollback to v${version.version_number}`}
                            >
                              <History className="w-3.5 h-3.5" />
                              Rollback
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Rollback Confirmation */}
      <ConfirmDialog
        isOpen={!!versionToRollback}
        title={`Rollback to v${versionToRollback?.number}`}
        description={
          versionToRollback && (
            <>
              <p>
                Are you sure you want to rollback <strong>"{field?.label}"</strong> to version {versionToRollback.number}?
              </p>
              <p className="mt-2 text-xs text-ink-secondary">
                A new version will be created based on the selected snapshot. The current configuration will be replaced.
              </p>
            </>
          )
        }
        confirmLabel="Rollback"
        isLoading={rollbackMutation.isPending}
        variant="warning"
        onConfirm={handleRollbackConfirm}
        onClose={() => setVersionToRollback(null)}
      />

      {/* Snapshot Detail Modal */}
      {snapshotToView && (
        <SnapshotDetailModal
          isOpen={!!snapshotToView}
          onClose={() => setSnapshotToView(null)}
          version={snapshotToView}
        />
      )}
    </>
  );
}
