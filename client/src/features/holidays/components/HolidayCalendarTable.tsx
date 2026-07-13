// client/src/features/holidays/components/HolidayCalendarTable.tsx
import React, { useState } from 'react';
import { Calendar, MapPin, Pencil, Trash2, Crown, Users, Plus } from 'lucide-react';
import { useDeleteHolidayCalendar } from '../hooks/useDeleteHolidayCalendar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { cn } from '@/utils/cn';
import type { HolidayCalendar } from '@/types';

interface HolidayCalendarTableProps {
  calendars: HolidayCalendar[];
  isLoading: boolean;
  isError: boolean;
  onEdit: (calendar: HolidayCalendar) => void;
  onCreateAssignment: (calendar: HolidayCalendar) => void;
  refetch: () => void;
}

export const HolidayCalendarTable: React.FC<HolidayCalendarTableProps> = ({
  calendars,
  isLoading,
  isError,
  onEdit,
  onCreateAssignment,
  refetch,
}) => {
  const deleteHolidayCalendar = useDeleteHolidayCalendar();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (calendar: HolidayCalendar) => {
    setDeletingId(calendar._id);
    try {
      await deleteHolidayCalendar.mutateAsync(calendar._id);
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) return <TableSkeleton rows={8} columns={5} />;
  if (isError) return <ErrorState onRetry={refetch} />;
  if (!calendars?.length) {
    return (
      <EmptyState
        title="No holiday calendars found"
        description="Create your first holiday calendar to get started."
        icon={Calendar}
        action={<button onClick={() => onEdit({} as any)} className="px-4 py-2 bg-primary text-white rounded-lg">Create Calendar</button>}
      />
    );
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="glass-table w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <th className="px-5 py-4 text-left">Calendar</th>
              <th className="px-5 py-4 text-left">Description</th>
              <th className="px-5 py-4 text-left">Status</th>
              <th className="px-5 py-4 text-left">Assignments</th>
              <th className="px-5 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {calendars.map((calendar) => {
              return (
                <tr
                  key={calendar._id}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                >
                  {/* Name */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(245,176,42,0.12)' }}>
                        <Calendar className="w-4 h-4" style={{ color: '#f5b02a' }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{calendar.name}</span>
                          {!calendar.is_active && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                              style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                              Inactive
                            </span>
                          )}
                        </div>
                        {calendar.description && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{calendar.description}</span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Description */}
                  <td className="px-5 py-4">
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{calendar.description || '—'}</span>
                  </td>

                  {/* Status */}
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize`}
                      style={{
                        background: calendar.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                        color: calendar.is_active ? '#10b981' : '#ef4444',
                        border: `1px solid ${calendar.is_active ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`
                      }}>
                      {calendar.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  {/* Assignments */}
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold"
                      style={{ color: (calendar.assignment_count ?? 0) > 0 ? '#60a5fa' : 'var(--text-muted)' }}>
                      <MapPin className="w-3 h-3" />
                      {calendar.assignment_count ?? 0} location{calendar.assignment_count !== 1 ? 's' : ''} assigned
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onCreateAssignment(calendar)}
                        className="h-8 w-8 flex items-center justify-center rounded-lg transition-all"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.1)';
                          (e.currentTarget as HTMLElement).style.color = '#10b981';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                        }}
                        title="Assign to location"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onEdit(calendar)}
                        className="h-8 w-8 flex items-center justify-center rounded-lg transition-all"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = 'rgba(245,176,42,0.1)';
                          (e.currentTarget as HTMLElement).style.color = '#f5b02a';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                        }}
                        title="Edit calendar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(calendar)}
                        disabled={deletingId === calendar._id || (calendar.assignment_count ?? 0) > 0}
                        className="h-8 w-8 flex items-center justify-center rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={(e) => {
                          if (!(e.currentTarget as HTMLButtonElement).disabled) {
                            (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)';
                            (e.currentTarget as HTMLElement).style.color = '#ef4444';
                          }
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                        }}
                        title={calendar.assignment_count && calendar.assignment_count > 0 ? `Cannot delete — ${calendar.assignment_count} locations assigned` : 'Delete calendar'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};