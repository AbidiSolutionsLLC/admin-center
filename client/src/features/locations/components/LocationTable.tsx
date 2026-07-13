// src/features/locations/components/LocationTable.tsx
import React, { useState } from 'react';
import { MapPin, Building2, Globe2, Pencil, Trash2, Crown, Users } from 'lucide-react';
import { useDeleteLocation } from '../hooks/useDeleteLocation';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { cn } from '@/utils/cn';
import { formatTimeInTimezone, getTimezoneOffset } from '@/lib/timezone';
import type { Location, LocationType } from '@/types';

interface LocationTableProps {
  locations: Location[];
  isLoading: boolean;
  isError: boolean;
  onEdit: (location: Location) => void;
  onSelect?: (location: Location) => void;
  refetch: () => void;
}

const TYPE_ICONS: Record<LocationType, typeof MapPin> = {
  region: Globe2,
  country: Building2,
  city: MapPin,
  office: MapPin,
};

// Dark-glass-friendly badge colors
const TYPE_BADGE: Record<LocationType, { bg: string; color: string; border: string }> = {
  region:  { bg: 'rgba(168,85,247,0.12)',  color: '#c084fc', border: 'rgba(168,85,247,0.25)' },
  country: { bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
  city:    { bg: 'rgba(16,185,129,0.12)',  color: '#34d399', border: 'rgba(16,185,129,0.25)' },
  office:  { bg: 'rgba(245,176,42,0.12)',  color: '#fbbf24', border: 'rgba(245,176,42,0.25)' },
};

const TYPE_ICON_COLOR: Record<LocationType, string> = {
  region:  '#c084fc',
  country: '#60a5fa',
  city:    '#34d399',
  office:  '#fbbf24',
};

/**
 * LocationTable Component — dark glass theme.
 * Displays all locations in a glass-table format with type badges,
 * timezone, user count, and actions (edit/delete).
 */
export const LocationTable: React.FC<LocationTableProps> = ({
  locations,
  isLoading,
  isError,
  onEdit,
  onSelect,
  refetch,
}) => {
  const deleteLocation = useDeleteLocation();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (loc: Location) => {
    setDeletingId(loc._id);
    try {
      await deleteLocation.mutateAsync(loc._id);
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) return <TableSkeleton rows={8} columns={6} />;
  if (isError) return <ErrorState onRetry={refetch} />;
  if (!locations?.length) {
    return (
      <EmptyState
        title="No locations found"
        description="Try adjusting your search or filter."
        icon={MapPin}
      />
    );
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="glass-table w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <th className="px-5 py-4 text-left">Location</th>
              <th className="px-5 py-4 text-left">Type</th>
              <th className="px-5 py-4 text-left">Parent</th>
              <th className="px-5 py-4 text-left">Timezone</th>
              <th className="px-5 py-4 text-left">Local Time</th>
              <th className="px-5 py-4 text-left">Users</th>
              <th className="px-5 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => {
              const TypeIcon = TYPE_ICONS[loc.type];
              const badge = TYPE_BADGE[loc.type];
              const iconColor = TYPE_ICON_COLOR[loc.type];
              const parentName = typeof loc.parent_id === 'object' && loc.parent_id !== null
                ? (loc.parent_id as any).name
                : null;

              return (
                <tr
                  key={loc._id}
                  className={onSelect ? 'cursor-pointer' : ''}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  onClick={() => onSelect?.(loc)}
                >
                  {/* Name */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: badge.bg }}>
                        <TypeIcon className="w-4 h-4" style={{ color: iconColor }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{loc.name}</span>
                          {loc.is_headquarters && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                              style={{ background: 'rgba(245,176,42,0.15)', color: '#fbbf24', border: '1px solid rgba(245,176,42,0.3)' }}>
                              <Crown className="w-2.5 h-2.5" />
                              HQ
                            </span>
                          )}
                        </div>
                        {loc.address && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{loc.address}</span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Type badge */}
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize"
                      style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                      {loc.type}
                    </span>
                  </td>

                  {/* Parent */}
                  <td className="px-5 py-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                    {parentName ?? <span style={{ color: 'rgba(148,163,184,0.4)' }}>—</span>}
                  </td>

                  {/* Timezone */}
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{loc.timezone}</span>
                      <span className="text-[10px]" style={{ color: 'rgba(148,163,184,0.5)' }}>{getTimezoneOffset(loc.timezone)}</span>
                    </div>
                  </td>

                  {/* Local time */}
                  <td className="px-5 py-4">
                    <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{formatTimeInTimezone(new Date(), loc.timezone, 'time')}</span>
                  </td>

                  {/* Users */}
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold"
                      style={{ color: (loc.user_count ?? 0) > 0 ? '#60a5fa' : 'var(--text-muted)' }}>
                      <Users className="w-3 h-3" />
                      {loc.user_count ?? 0}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(loc)}
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
                        title="Edit location"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(loc)}
                        disabled={deletingId === loc._id || (loc.user_count ?? 0) > 0}
                        className="h-8 w-8 flex items-center justify-center rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={(e) => {
                          if (!(e.currentTarget as HTMLButtonElement).disabled) {
                            (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)';
                            (e.currentTarget as HTMLElement).style.color = '#f87171';
                          }
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                        }}
                        title={loc.user_count && loc.user_count > 0 ? `Cannot delete — ${loc.user_count} users assigned` : 'Delete location'}
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
