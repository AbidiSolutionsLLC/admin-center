// client/src/pages/roles/RolesPage.tsx
import { useState, useMemo } from 'react';
import { Shield, Plus, Edit2, Trash2, Key, Search, X, Loader2, Copy, Users, UserPlus, UserMinus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { useRoles, useCreateRole, useUpdateRole, useDeleteRole, useRoleUsers, useAssignRole, useUnassignRole } from '@/features/roles/useRoles';
import { useRolePermissions, useAllPermissions, useUpdateRolePermissions } from '@/features/roles/useRolePermissions';
import { useUsers } from '@/features/people/hooks/useUsers';
import { PermissionMatrix } from '@/features/roles/PermissionMatrix';
import { PermissionSimulator } from '@/features/roles/PermissionSimulator';
import { AccessMapView } from '@/features/roles/AccessMapView';
import { Modal } from '@/components/ui/Modal';
import { DataTable } from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthStore } from '@/store/useAuthStore';
import { cn } from '@/utils/cn';
import { ROLES, PERMISSION_GROUPS } from '@/constants/roles';
import type { Role, PermissionUpdate, CreateRoleInput, UpdateRoleInput } from '@/types';

const MAX_NAME_LENGTH = 100;

/**
 * RolesPage Component
 * Main page for managing roles and their permission matrix.
 */
export default function RolesPage() {
  // ── Auth & RBAC ──────────────────────────────────────────────────────
  const { userRole } = useAuthStore();
  const canMutate = useMemo(() => 
    [...PERMISSION_GROUPS.ROLE_ADMINS, 'super_admin', 'hr_admin', 'ops_admin'].includes(userRole || ''),
  [userRole]);

  const canDelete = useMemo(() => 
    [...PERMISSION_GROUPS.SUPER_ADMINS, 'super_admin'].includes(userRole || ''),
  [userRole]);

  // ── State ────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isMatrixModalOpen, setIsMatrixModalOpen] = useState(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [templateRoleId, setTemplateRoleId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  
  // User assignment state
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // Form state
  const [formData, setFormData] = useState<CreateRoleInput>({
    name: '',
    description: '',
    type: 'custom',
  });
  const [formError, setFormError] = useState<string | null>(null);

  // ── Server data ──────────────────────────────────────────────────────
  const { data: roles, isLoading, isError, refetch } = useRoles(search);
  const { data: allPermissions, isLoading: isLoadingPermissions } = useAllPermissions();

  // Mutations
  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole();
  const deleteMutation = useDeleteRole();
  const updatePermissionsMutation = useUpdateRolePermissions();
  const assignRoleMutation = useAssignRole();
  const unassignRoleMutation = useUnassignRole();

  // ── Role detail data ─────────────────────────────────────────────────
  const { data: rolePermissions, isLoading: isLoadingRolePerms } = useRolePermissions(
    selectedRole?._id ?? ''
  );
  const { data: roleUsers, isLoading: isLoadingRoleUsers } = useRoleUsers(
    isUsersModalOpen ? (selectedRole?._id ?? '') : ''
  );

  // For adding new users: fetch all users (filtered by search)
  const { data: people } = useUsers({ search: userSearchQuery });

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleOpenCreateModal = () => {
    if (!canMutate) return;
    setEditingRole(null);
    setTemplateRoleId(null);
    setFormData({ name: '', description: '', type: 'custom' });
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (role: Role) => {
    if (!canMutate) return;
    setEditingRole(role);
    setTemplateRoleId(null);
    setFormData({
      name: role.name,
      description: role.description || '',
      type: role.type,
    });
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleOpenDuplicateModal = (role: Role) => {
    if (!canMutate) return;
    setEditingRole(null);
    setTemplateRoleId(role._id);
    setFormData({
      name: `${role.name} (Copy)`,
      description: role.description || '',
      type: 'custom',
    });
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleOpenMatrixModal = (role: Role) => {
    setSelectedRole(role);
    setIsMatrixModalOpen(true);
  };

  const handleOpenUsersModal = (role: Role) => {
    setSelectedRole(role);
    setIsUsersModalOpen(true);
    setUserSearchQuery('');
  };

  const handleSaveRole = async () => {
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      setFormError('Role name is required');
      return;
    }

    try {
      if (editingRole) {
        const updateData: UpdateRoleInput = {
          name: trimmedName,
          description: formData.description?.trim(),
        };
        await updateMutation.mutateAsync({ id: editingRole._id, data: updateData });
      } else {
        await createMutation.mutateAsync({
          ...formData,
          name: trimmedName,
          description: formData.description?.trim(),
          template_role_id: templateRoleId ?? undefined,
        });
      }
      setIsFormModalOpen(false);
    } catch (error: any) {
      setFormError(error.response?.data?.error || 'An error occurred while saving.');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!roleToDelete) return;
    try {
      await deleteMutation.mutateAsync(roleToDelete._id);
      setRoleToDelete(null);
    } catch (error: any) {
      // Error handled by mutation toast
    }
  };

  const handleSavePermissions = async (updates: PermissionUpdate[]) => {
    if (!selectedRole) return;
    await updatePermissionsMutation.mutateAsync({
      roleId: selectedRole._id,
      permissions: updates,
    });
  };

  const handleAssignUser = async (userId: string) => {
    if (!selectedRole) return;
    await assignRoleMutation.mutateAsync({ roleId: selectedRole._id, userId });
    setUserSearchQuery('');
  };

  const handleUnassignUser = async (userId: string) => {
    if (!selectedRole) return;
    await unassignRoleMutation.mutateAsync({ roleId: selectedRole._id, userId });
  };

  // ── Table Columns ────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<Role>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Role Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-medium text-ink">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => (
        <span className={cn(
          "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider",
          row.original.type === 'system' ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
        )}>
          {row.original.type}
        </span>
      ),
    },
    {
      accessorKey: 'granted_permissions_count',
      header: 'Permissions',
      cell: ({ row }) => (
        <span className="text-sm text-ink-secondary">
          {row.original.granted_permissions_count ?? 0} granted
        </span>
      ),
    },
    {
      accessorKey: 'user_count',
      header: 'Users',
      cell: ({ row }) => (
        <span className="text-sm text-ink-secondary">
          {row.original.user_count ?? 0} assigned
        </span>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => (
        <span className="text-sm text-ink-muted line-clamp-1 max-w-xs">
          {row.original.description || '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const role = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenUsersModal(role);
              }}
              className="p-2 text-ink-muted hover:text-ink hover:bg-surface-alt rounded-lg transition-all"
              title="Assigned Users"
            >
              <Users className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenMatrixModal(role);
              }}
              className="p-2 text-ink-muted hover:text-primary hover:bg-primary-light rounded-lg transition-all"
              title="Edit Permissions"
            >
              <Key className="h-4 w-4" />
            </button>
            {canMutate && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenDuplicateModal(role);
                  }}
                  className="p-2 text-ink-muted hover:text-ink hover:bg-surface-alt rounded-lg transition-all"
                  title="Duplicate Role"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenEditModal(role);
                  }}
                  className="p-2 text-ink-muted hover:text-ink hover:bg-surface-alt rounded-lg transition-all"
                  title="Edit Role"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              </>
            )}
            {canDelete && role.type !== 'system' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRoleToDelete(role);
                }}
                className="p-2 text-ink-muted hover:text-error hover:bg-red-50 rounded-lg transition-all"
                title="Delete Role"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      },
    },
  ], [canMutate, canDelete]);

  // ── Render Helpers ───────────────────────────────────────────────────
  if (isError) {
    return (
      <ErrorState
        title="Failed to load roles"
        description="Something went wrong fetching roles. Please try again."
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Roles & Access</h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            Manage roles and their permissions across your organization
          </p>
        </div>
        {canMutate && (
          <div className="flex gap-2">
            <button
              onClick={() => setIsSimulatorOpen(true)}
              className="h-9 px-4 bg-surface-alt text-ink text-sm font-medium rounded-md hover:bg-line transition-colors flex items-center gap-2 justify-center"
            >
              <Shield className="h-4 w-4" />
              Simulate Access
            </button>
            <button
              onClick={handleOpenCreateModal}
              className="h-9 px-4 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-hover transition-colors flex items-center gap-2 justify-center"
            >
              <Plus className="h-4 w-4" />
              Create Role
            </button>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search roles by name..."
            className="w-full h-10 pl-10 pr-10 text-sm rounded-lg border border-line bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center bg-surface-alt p-1 rounded-lg border border-line ml-auto">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
              viewMode === 'list' ? "bg-white text-ink shadow-sm" : "text-ink-secondary hover:text-ink"
            )}
          >
            List View
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
              viewMode === 'map' ? "bg-white text-ink shadow-sm" : "text-ink-secondary hover:text-ink"
            )}
          >
            Map View
          </button>
        </div>
      </div>

      {/* Main Content */}
      {viewMode === 'map' ? (
        <AccessMapView />
      ) : (
        <>
          {isLoading ? (
            <TableSkeleton rows={6} columns={5} />
          ) : !roles || roles.length === 0 ? (
            <EmptyState
              icon={Shield}
              title={search ? 'No roles found' : 'No roles yet'}
              description={search ? `No roles matching "${search}"` : 'Create your first role to start managing access control.'}
              action={!search && canMutate ? { label: 'Create Role', onClick: handleOpenCreateModal } : undefined}
            />
          ) : (
            <DataTable
              columns={columns}
              data={roles}
              onRowClick={handleOpenMatrixModal}
            />
          )}
        </>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={editingRole ? 'Edit Role' : templateRoleId ? 'Duplicate Role' : 'Create Role'}
        size="md"
      >
        <div className="space-y-5">
          {templateRoleId && (
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg flex items-start gap-3">
              <Copy className="w-4 h-4 text-amber-600 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-amber-800">Creating from template</p>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  This will copy all permissions from the original role. You can modify them independently after creation.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-ink">Role Name <span className="text-error">*</span></label>
              <span className={cn(
                "text-[10px] font-medium",
                formData.name.length > MAX_NAME_LENGTH ? "text-error" : "text-ink-muted"
              )}>
                {formData.name.length}/{MAX_NAME_LENGTH}
              </span>
            </div>
            <input
              type="text"
              autoFocus
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={cn(
                "w-full h-10 px-3 text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 transition-all",
                formError && !formData.name.trim() ? "border-error focus:ring-error/20" : "border-line focus:ring-primary/20 focus:border-primary"
              )}
              placeholder="e.g. Finance Manager"
            />
            {formError && !formData.name.trim() && (
              <p className="text-xs text-error font-medium">Role name is required</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Description</label>
            <textarea
              value={formData.description ?? ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full h-24 p-3 text-sm rounded-lg border border-line bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
              placeholder="Provide a brief description of this role's purpose..."
            />
          </div>

          {formError && formData.name.trim() && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-xs text-error font-medium">{formError}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setIsFormModalOpen(false)}
              className="h-9 px-4 text-sm font-medium rounded-md border border-line text-ink hover:bg-surface-alt transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveRole}
              disabled={!formData.name.trim() || formData.name.length > MAX_NAME_LENGTH || createMutation.isPending || updateMutation.isPending}
              className="h-9 px-4 text-sm font-medium rounded-md bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingRole ? 'Update Role' : templateRoleId ? 'Create Duplicate' : 'Create Role'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Permission Matrix Modal */}
      <Modal
        isOpen={isMatrixModalOpen}
        onClose={() => setIsMatrixModalOpen(false)}
        title={`Edit Permissions: ${selectedRole?.name}`}
        size="xl"
      >
        {isLoadingPermissions || isLoadingRolePerms ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm text-ink-secondary font-medium animate-pulse">Loading permission matrix...</p>
          </div>
        ) : allPermissions && rolePermissions ? (
          <PermissionMatrix
            permissions={allPermissions}
            rolePermissions={rolePermissions}
            onUpdate={handleSavePermissions}
            isLoading={updatePermissionsMutation.isPending}
          />
        ) : (
          <div className="py-20 text-center">
            <p className="text-sm text-error font-medium">Failed to load permission data.</p>
          </div>
        )}
      </Modal>

      {/* Assigned Users Modal */}
      <Modal
        isOpen={isUsersModalOpen}
        onClose={() => setIsUsersModalOpen(false)}
        title={`Assigned Users: ${selectedRole?.name}`}
        size="md"
      >
        <div className="space-y-6">
          {/* Add User Section */}
          {canMutate && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Assign New User</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full h-10 pl-10 pr-10 text-sm rounded-lg border border-line bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
                {userSearchQuery && (
                  <button
                    onClick={() => setUserSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                
                {/* Search Results Dropdown */}
                {userSearchQuery.length >= 2 && people && people.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-line rounded-lg shadow-dropdown z-50 max-h-60 overflow-y-auto">
                    {people.map((person: any) => {
                      const isAlreadyAssigned = roleUsers?.some(u => u._id === person._id);
                      return (
                        <button
                          key={person._id}
                          disabled={isAlreadyAssigned || assignRoleMutation.isPending}
                          onClick={() => handleAssignUser(person._id)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-alt transition-colors text-left border-b border-line last:border-0 group"
                        >
                          <div className="w-8 h-8 rounded-full bg-surface-alt flex items-center justify-center text-xs font-semibold text-ink group-hover:bg-line">
                            {person.full_name?.charAt(0) || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink truncate">{person.full_name}</p>
                            <p className="text-[11px] text-ink-secondary truncate">{person.email}</p>
                          </div>
                          {isAlreadyAssigned ? (
                            <span className="text-[10px] font-semibold text-ink-muted bg-surface-alt px-2 py-0.5 rounded uppercase">Assigned</span>
                          ) : (
                            <UserPlus className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Current Users List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Currently Assigned</label>
              <span className="text-xs font-medium text-ink-secondary">{roleUsers?.length || 0} users</span>
            </div>
            
            <div className="border border-line rounded-xl overflow-hidden divide-y divide-line bg-white">
              {isLoadingRoleUsers ? (
                <div className="p-10 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  <p className="text-[11px] text-ink-muted font-medium">Fetching users...</p>
                </div>
              ) : !roleUsers || roleUsers.length === 0 ? (
                <div className="p-10 text-center">
                  <Users className="w-8 h-8 text-ink-muted mx-auto mb-2 opacity-20" />
                  <p className="text-sm text-ink-muted font-medium">No users assigned to this role</p>
                </div>
              ) : (
                roleUsers.map((user) => (
                  <div key={user._id} className="flex items-center gap-3 px-4 py-3 group">
                    <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center text-xs font-semibold text-primary">
                      {user.full_name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{user.full_name}</p>
                      <p className="text-[11px] text-ink-secondary truncate">
                        {user.email} • <span className="capitalize">{user.lifecycle_state}</span>
                      </p>
                    </div>
                    {canMutate && (
                      <button
                        onClick={() => handleUnassignUser(user._id)}
                        disabled={unassignRoleMutation.isPending}
                        className="p-2 text-ink-muted hover:text-error hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        title="Remove User"
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setIsUsersModalOpen(false)}
              className="h-9 px-6 bg-surface-alt text-ink text-sm font-medium rounded-md hover:bg-line transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!roleToDelete}
        onClose={() => setRoleToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Role"
        description={`Are you sure you want to delete the role "${roleToDelete?.name}"? This action cannot be undone and will fail if users are still assigned to this role.`}
        confirmLabel="Delete Role"
        variant="error"
        isLoading={deleteMutation.isPending}
      />

      {/* Permission Simulator */}
      {isSimulatorOpen && (
        <PermissionSimulator
          isOpen={isSimulatorOpen}
          onClose={() => setIsSimulatorOpen(false)}
        />
      )}
    </div>
  );
}


