// src/features/locations/components/LocationTable.tsx
import React, { useState } from 'react';
import { MapPin, Building2, Globe2, Edit, Trash2, Crown } from 'lucide-react';
import { useDeleteLocation } from '../hooks/useDeleteLocation';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { cn } from '@/utils/cn';
import type { Location, LocationType } from '@/types';

interface LocationTableProps {
  locations: Location[];
  isLoading: boolean;
  isError: boolean;
  onEdit: (location: Location) => void;
  refetch: () => void;
}

const TYPE_ICONS: Record<LocationType, typeof MapPin> = {
  region: Globe2,
  country: Building2,
  city: MapPin,
  office: MapPin,
};

const TYPE_COLORS: Record<LocationType, string> = {
  region: 'bg-purple-50 text-purple-700 border-purple-200',
  country: 'bg-blue-50 text-blue-700 border-blue-200',
  city: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  office: 'bg-amber-50 text-amber-700 border-amber-200',
};

/**
 * LocationTable Component
 * Displays all locations in a tabular format with type badges,
 * timezone, user count, and actions (edit/delete).
 * Used on: LocationsPage.
 */
export const LocationTable: React.FC<LocationTableProps> = ({
  locations,
  isLoading,
  isError,
  onEdit,
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

  if (isLoading) {
    return <TableSkeleton rows={8} columns={6} />;
  }

  if (isError) {
    return <ErrorState onRetry={refetch} />;
  }

  if (!locations?.length) {
    return (
      <EmptyState
        title="No locations yet"
        description="Add your first region, country, city, or office to get started."
        icon={MapPin}
      />
    );
  }

  return (
    <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-base border-b border-line">
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Location</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Type</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Parent</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Timezone</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Local Time</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Users</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => {
              const TypeIcon = TYPE_ICONS[loc.type];
              return (
                <tr
                  key={loc._id}
                  className="border-b border-line last:border-0 hover:bg-surface-base transition-colors duration-100"
                >
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <TypeIcon className="w-4 h-4 text-ink-secondary" />
                      <div>
                        <span className="font-medium text-ink">{loc.name}</span>
                        {loc.is_headquarters && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                            <Crown className="w-3 h-3" />
                            HQ
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center text-[11px] font-semibold border rounded-full px-2.5 py-0.5', TYPE_COLORS[loc.type])}>
                      {loc.type.charAt(0).toUpperCase() + loc.type.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-secondary">
                    {typeof loc.parent === 'object' ? loc.parent.name : loc.parent_id || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-secondary font-mono text-xs">
                    {loc.timezone}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-secondary text-xs">
                    {getLocalTime(loc.timezone)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="text-sm text-ink">{loc.user_count ?? 0}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(loc)}
                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-surface-alt text-ink-secondary transition-colors"
                        title="Edit location"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(loc)}
                        disabled={deletingId === loc._id || (loc.user_count ?? 0) > 0}
                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-red-50 text-error transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function getLocalTime(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return formatter.format(now);
  } catch {
    return 'N/A';
  }
}
