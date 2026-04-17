// src/features/organization/components/DepartmentTable.tsx
import React, { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Edit2, Trash2, AlertTriangle } from 'lucide-react';
import type { Department } from '@/types';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useInsights } from '@/features/organization/hooks/useInsights';
import { cn } from '@/utils/cn';

interface DepartmentTableProps {
  departments: Department[];
  onEdit: (dept: Department) => void;
  onDelete: (id: string) => void;
}

/**
 * DepartmentTable Component
 * Specialized table for displaying department records.
 * Implements columns for name, type, manager, parent, and actions.
 * Shows intelligence warning badges and dots on rows that have active insights.
 * Used on: OrganizationPage (table view).
 */
export const DepartmentTable: React.FC<DepartmentTableProps> = ({
  departments,
  onEdit,
  onDelete,
}) => {
  // Fetch all organization insights to show warning dots
  const { data: insights } = useInsights({ module: 'organization' });

  // Create a map of department IDs that have active insights
  const deptInsightsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (insights) {
      insights.forEach((insight) => {
        if (insight.affected_object_id) {
          const count = map.get(insight.affected_object_id) || 0;
          map.set(insight.affected_object_id, count + 1);
        }
      });
    }
    return map;
  }, [insights]);

  const deptMap = useMemo(() => {
    const map = new Map<string, string>();
    departments.forEach((d) => map.set(d._id, d.name));
    return map;
  }, [departments]);

  const columns = useMemo<ColumnDef<Department>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Department Name',
        cell: ({ row }) => {
          const dept = row.original;
          const insightCount = deptInsightsMap.get(dept._id) || 0;
          const hasInsights = insightCount > 0;

          return (
            <div className="flex items-center gap-3">
              {/* Warning dot indicator */}
              {hasInsights && (
                <div
                  title={`${insightCount} active insight${insightCount > 1 ? 's' : ''}`}
                  className="flex-shrink-0"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                </div>
              )}
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{dept.name}</span>
                  {dept.has_intelligence_flag && (
                    <span
                      title="Intelligence warning: this department has issues needing attention"
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5"
                    >
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      Warning
                    </span>
                  )}
                </div>
                <span className="text-xs text-ink-muted font-mono">{dept.slug}</span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => {
          const type = row.original.type;
          const variantMap: Record<
            string,
            'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary' | 'accent'
          > = {
            business_unit: 'accent',
            division: 'info',
            department: 'primary',
            team: 'success',
            cost_center: 'neutral',
          };
          return (
            <StatusBadge variant={variantMap[type] || 'neutral'}>
              {type.replace(/_/g, ' ')}
            </StatusBadge>
          );
        },
      },
      {
        accessorKey: 'primary_manager_id',
        header: 'Manager',
        cell: ({ row }) => {
          const manager = row.original.primary_manager;
          if (!manager) {
            return (
              <span className={cn(
                'inline-flex items-center gap-1 text-xs text-amber-600',
                row.original.has_intelligence_flag && 'font-semibold'
              )}>
                No manager
              </span>
            );
          }
          return (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0 overflow-hidden">
                {manager.avatar_url ? (
                  <img
                    src={manager.avatar_url}
                    className="w-full h-full rounded-full object-cover"
                    alt=""
                    width={28}
                    height={28}
                  />
                ) : (
                  <span className="text-[10px] font-bold text-primary">
                    {manager.full_name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </span>
                )}
              </div>
              <span className="text-sm text-ink">{manager.full_name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'parent_id',
        header: 'Parent',
        cell: ({ row }) => {
          const parentId = row.original.parent_id;
          if (!parentId) return <span className="text-ink-muted text-xs">—</span>;
          const parentName = deptMap.get(parentId);
          return <span className="text-sm text-ink">{parentName || 'Unknown'}</span>;
        },
      },
      {
        accessorKey: 'headcount',
        header: 'Members',
        cell: ({ row }) => (
          <span className="text-sm text-ink font-medium">
            {row.original.headcount ?? '—'}
          </span>
        ),
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
                onEdit(row.original);
              }}
              className="h-8 w-8 flex items-center justify-center rounded-md text-ink-secondary hover:text-ink hover:bg-surface-alt transition-colors"
              aria-label={`Edit ${row.original.name}`}
              title="Edit Department"
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
              title="Archive Department"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ),
      },
    ],
    [onEdit, onDelete, deptMap, deptInsightsMap]
  );

  return (
    <DataTable
      columns={columns}
      data={departments}
      onRowClick={onEdit}
    />
  );
};
