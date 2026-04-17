// src/features/teams/components/TeamTable.tsx
import React, { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Edit2, Trash2, Users } from 'lucide-react';
import type { Team } from '@/types';
import { DataTable } from '@/components/ui/DataTable';

interface TeamTableProps {
  teams: Team[];
  onEdit: (team: Team) => void;
  onDelete: (id: string) => void;
  onViewMembers: (team: Team) => void;
}

/**
 * TeamTable Component
 * Specialized table for displaying team records.
 * Implements columns for name, department, team lead, member count, and actions.
 * Used on: TeamsPage (table view).
 */
export const TeamTable: React.FC<TeamTableProps> = ({
  teams,
  onEdit,
  onDelete,
  onViewMembers,
}) => {
  const columns = useMemo<ColumnDef<Team>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Team Name',
        cell: ({ row }) => {
          const team = row.original;
          return (
            <div className="flex flex-col">
              <span className="font-medium text-ink">{team.name}</span>
              <span className="text-xs text-ink-muted font-mono">{team.slug}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'department_id',
        header: 'Department',
        cell: ({ row }) => {
          const dept = row.original.department;
          if (!dept) return <span className="text-ink-muted text-xs">—</span>;
          return <span className="text-sm text-ink">{dept.name}</span>;
        },
      },
      {
        accessorKey: 'team_lead_id',
        header: 'Team Lead',
        cell: ({ row }) => {
          const lead = row.original.team_lead;
          if (!lead) {
            return (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                No lead assigned
              </span>
            );
          }
          return (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0 overflow-hidden">
                {lead.avatar_url ? (
                  <img
                    src={lead.avatar_url}
                    className="w-full h-full rounded-full object-cover"
                    alt=""
                    width={28}
                    height={28}
                  />
                ) : (
                  <span className="text-[10px] font-bold text-primary">
                    {lead.full_name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </span>
                )}
              </div>
              <span className="text-sm text-ink">{lead.full_name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => {
          const desc = row.original.description;
          if (!desc) return <span className="text-ink-muted text-xs">—</span>;
          return (
            <span className="text-sm text-ink-secondary line-clamp-2">
              {desc}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewMembers(row.original);
              }}
              className="h-8 w-8 flex items-center justify-center rounded-md text-ink-secondary hover:text-ink hover:bg-surface-alt transition-colors"
              aria-label={`View members of ${row.original.name}`}
              title="View Members"
            >
              <Users className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(row.original);
              }}
              className="h-8 w-8 flex items-center justify-center rounded-md text-ink-secondary hover:text-ink hover:bg-surface-alt transition-colors"
              aria-label={`Edit ${row.original.name}`}
              title="Edit Team"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(row.original._id);
              }}
              className="h-8 w-8 flex items-center justify-center rounded-md text-ink-secondary hover:text-red-600 hover:bg-red-50 transition-colors"
              aria-label={`Archive ${row.original.name}`}
              title="Archive Team"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ),
      },
    ],
    [onEdit, onDelete, onViewMembers]
  );

  return (
    <DataTable
      columns={columns}
      data={teams}
      onRowClick={onEdit}
    />
  );
};
