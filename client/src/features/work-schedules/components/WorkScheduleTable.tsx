// client/src/features/work-schedules/components/WorkScheduleTable.tsx
import React, { useState } from 'react';
import { Clock, MapPin, Pencil, Trash2, Plus } from 'lucide-react';
import { useWorkSchedules } from '../hooks/useWorkSchedules';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import type { WorkSchedule } from '@/types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface WorkScheduleTableProps {
  schedules: WorkSchedule[];
  isLoading: boolean;
  isError: boolean;
  onEdit: (schedule: WorkSchedule) => void;
  onCreateAssignment: (schedule: WorkSchedule) => void;
  refetch: () => void;
}

export const WorkScheduleTable: React.FC<WorkScheduleTableProps> = ({
  schedules,
  isLoading,
  isError,
  onEdit,
  onCreateAssignment,
  refetch,
}) => {
  const { delete: deleteSchedule } = useWorkSchedules();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (schedule: WorkSchedule) => {
    setDeletingId(schedule._id);
    try {
      await deleteSchedule(schedule._id);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDays = (days: number[]) => {
    if (!days || days.length === 0) return '—';
    if (days.length === 7) return 'Every day';
    if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return 'Mon–Fri';
    return days.sort((a, b) => a - b).map(d => DAY_LABELS[d]).join(', ');
  };

  if (isLoading) return <TableSkeleton rows={8} columns={5} />;
  if (isError) return <ErrorState onRetry={refetch} />;
  if (!schedules?.length) {
    return (
      <EmptyState
        title="No work schedules found"
        description="Create your first work schedule to define working hours for locations."
        icon={Clock}
        action={<button onClick={() => onEdit({} as any)} className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors">Create Schedule</button>}
      />
    );
  }

  return (
    <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-alt border-b border-line">
              <th className="h-10 px-5 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Schedule</th>
              <th className="h-10 px-5 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Working Days</th>
              <th className="h-10 px-5 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Hours</th>
              <th className="h-10 px-5 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Status</th>
              <th className="h-10 px-5 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Locations</th>
              <th className="h-10 px-5 text-right text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((schedule) => (
              <tr
                key={schedule._id}
                className="border-b border-line last:border-0 hover:bg-surface-alt transition-colors duration-100"
              >
                {/* Name */}
                <td className="h-14 px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center flex-shrink-0">
                      <Clock className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink">{schedule.name}</span>
                        {!schedule.is_active && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200">
                            Inactive
                          </span>
                        )}
                      </div>
                      {schedule.description && (
                        <span className="text-xs text-ink-secondary">{schedule.description}</span>
                      )}
                    </div>
                  </div>
                </td>

                {/* Working Days */}
                <td className="h-14 px-5">
                  <span className="text-sm text-ink">{formatDays(schedule.working_days)}</span>
                </td>

                {/* Hours */}
                <td className="h-14 px-5">
                  <span className="text-sm font-mono text-ink-secondary">
                    {schedule.working_hours.start} – {schedule.working_hours.end}
                  </span>
                </td>

                {/* Status */}
                <td className="h-14 px-5">
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{
                      background: schedule.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                      color: schedule.is_active ? '#10b981' : '#ef4444',
                      border: `1px solid ${schedule.is_active ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                    }}
                  >
                    {schedule.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>

                {/* Locations */}
                <td className="h-14 px-5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: (schedule.assignment_count ?? 0) > 0 ? '#60a5fa' : 'var(--text-muted)' }}>
                    <MapPin className="w-3 h-3" />
                    {schedule.assignment_count ?? 0} location{(schedule.assignment_count ?? 0) !== 1 ? 's' : ''}
                  </span>
                </td>

                {/* Actions */}
                <td className="h-14 px-5">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onCreateAssignment(schedule)}
                      className="h-8 w-8 flex items-center justify-center rounded-md text-ink-secondary hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                      title="Assign to location"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onEdit(schedule)}
                      className="h-8 w-8 flex items-center justify-center rounded-md text-ink-secondary hover:text-primary hover:bg-primary-light transition-colors"
                      title="Edit schedule"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(schedule)}
                      disabled={deletingId === schedule._id || (schedule.assignment_count ?? 0) > 0}
                      className="h-8 w-8 flex items-center justify-center rounded-md text-ink-secondary hover:text-error hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title={(schedule.assignment_count ?? 0) > 0 ? `Cannot delete — ${schedule.assignment_count} locations assigned` : 'Delete schedule'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
