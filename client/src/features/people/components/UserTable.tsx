// src/features/people/components/UserTable.tsx
import React, { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Edit2, MoreVertical, AlertTriangle, Building2 } from 'lucide-react';
import type { User, LifecycleState } from '@/types';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDistanceToNow } from 'date-fns';

interface UserTableProps {
  users: User[];
  onEdit: (user: User) => void;
  onAssignOrg: (user: User) => void;
  onChangeState?: (user: User) => void;
  selectedIds?: Set<string>;
  onToggleRow?: (userId: string) => void;
  onToggleAll?: () => void;
  isAllSelected?: boolean;
}

const lifecycleStateConfig: Record<
  LifecycleState,
  { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary' | 'accent' }
> = {
  invited: { label: 'Invited', variant: 'info' },
  onboarding: { label: 'Onboarding', variant: 'primary' },
  active: { label: 'Active', variant: 'success' },
  probation: { label: 'Probation', variant: 'warning' },
  on_leave: { label: 'On Leave', variant: 'warning' },
  terminated: { label: 'Terminated', variant: 'error' },
  archived: { label: 'Archived', variant: 'neutral' },
};

/**
 * UserTable Component
 * Displays user records with columns: Name + Avatar, Employee ID, Department, Role(s),
 * Lifecycle State, Last Login, Actions.
 * Used on: PeoplePage.
 */
export const UserTable: React.FC<UserTableProps> = ({ users, onEdit, onAssignOrg, onChangeState, selectedIds, onToggleRow, onToggleAll, isAllSelected }) => {
  const hasSelection = !!selectedIds && !!onToggleRow && !!onToggleAll;

  const columns = useMemo<ColumnDef<User>[]>(
    () => {
      const cols: ColumnDef<User>[] = [];

      // Checkbox column (only when selection is enabled)
      if (hasSelection) {
        cols.push({
          id: 'select',
          header: () => (
            <input
              type="checkbox"
              checked={isAllSelected ?? false}
              onChange={onToggleAll}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30 cursor-pointer"
              aria-label="Select all rows"
            />
          ),
          cell: ({ row }) => (
            <input
              type="checkbox"
              checked={selectedIds?.has(row.original._id) ?? false}
              onChange={() => onToggleRow(row.original._id)}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30 cursor-pointer"
              aria-label={`Select ${row.original.full_name}`}
            />
          ),
        });
      }

      cols.push(
        {
          accessorKey: 'full_name',
          header: 'Name',
          cell: ({ row }) => {
            const user = row.original;
            const initials = user.full_name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);

            return (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      className="w-full h-full object-cover"
                      alt=""
                      width={36}
                      height={36}
                    />
                  ) : (
                    <span className="text-xs font-bold text-primary">{initials}</span>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-ink">{user.full_name}</span>
                  <span className="text-xs text-ink-muted">{user.email}</span>
                </div>
              </div>
            );
          },
        },
        {
          accessorKey: 'employee_id',
          header: 'Employee ID',
          cell: ({ row }) => (
            <span className="font-mono text-xs text-ink-muted">{row.original.employee_id}</span>
          ),
        },
        {
          accessorKey: 'department_id',
          header: 'Department',
          cell: ({ row }) => {
            const user = row.original;
            const dept = user.department || (typeof user.department_id === 'object' ? (user.department_id as any) : null);
            if (!dept) {
              return (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle className="w-3 h-3" />
                  No department
                </span>
              );
            }
            return <span className="text-sm text-ink">{dept.name}</span>;
          },
        },
        {
          id: 'manager',
          header: 'Manager',
          cell: ({ row }) => {
            const user = row.original;
            const primary = user.manager;
            const secondaryCount = user.secondary_manager_ids?.length || 0;

            if (!primary && secondaryCount === 0) {
              return <span className="text-xs text-ink-muted">—</span>;
            }

            return (
              <div className="flex flex-col">
                <span className="text-sm text-ink truncate max-w-[120px]">
                  {primary?.full_name || 'No primary'}
                </span>
                {secondaryCount > 0 && (
                  <span className="text-[10px] text-primary font-medium">
                    +{secondaryCount} secondary
                  </span>
                )}
              </div>
            );
          },
        },
        {
          id: 'roles',
          header: 'Role(s)',
          cell: ({ row }) => {
            const roles = row.original.roles;
            if (!roles || roles.length === 0) {
              return (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle className="w-3 h-3" />
                  No role
                </span>
              );
            }
            return (
              <div className="flex flex-wrap gap-1">
                {roles.slice(0, 2).map((role) => (
                  <StatusBadge key={role._id} variant="neutral">
                    {role.name}
                  </StatusBadge>
                ))}
                {roles.length > 2 && (
                  <span className="text-xs text-ink-muted self-center">+{roles.length - 2}</span>
                )}
              </div>
            );
          },
        },
        {
          accessorKey: 'lifecycle_state',
          header: 'State',
          cell: ({ row }) => {
            const state = row.original.lifecycle_state;
            const config = lifecycleStateConfig[state] || { label: state || 'Unknown', variant: 'neutral' };
            return (
              <StatusBadge variant={config.variant as any}>{config.label}</StatusBadge>
            );
          },
        },
        {
          accessorKey: 'last_login',
          header: 'Last Login',
          cell: ({ row }) => {
            const lastLogin = row.original.last_login;
            if (!lastLogin) {
              return <span className="text-xs text-ink-muted">Never</span>;
            }
            return (
              <span className="text-sm text-ink-muted">
                {formatDistanceToNow(new Date(lastLogin), { addSuffix: true })}
              </span>
            );
          },
        },
        {
          id: 'actions',
          header: 'Actions',
          cell: ({ row }) => (
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(row.original);
                }}
                className="h-8 w-8 flex items-center justify-center rounded-md text-ink-secondary hover:text-ink hover:bg-surface-alt transition-colors"
                aria-label={`Edit ${row.original.full_name}`}
                title="Edit User"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAssignOrg(row.original);
                }}
                className="h-8 w-8 flex items-center justify-center rounded-md text-ink-secondary hover:text-ink hover:bg-surface-alt transition-colors"
                aria-label={`Assign organization for ${row.original.full_name}`}
                title="Assign Organization"
              >
                <Building2 className="w-4 h-4" />
              </button>
              {onChangeState && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeState(row.original);
                  }}
                  className="h-8 w-8 flex items-center justify-center rounded-md text-ink-secondary hover:text-ink hover:bg-surface-alt transition-colors"
                  aria-label={`Change state for ${row.original.full_name}`}
                  title="Change Lifecycle State"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              )}
            </div>
          ),
        },
      );

      return cols;
    },
    [onEdit, onAssignOrg, onChangeState, hasSelection, selectedIds, onToggleRow, onToggleAll, isAllSelected]
  );

  return <DataTable columns={columns} data={users} onRowClick={onEdit} />;
};
