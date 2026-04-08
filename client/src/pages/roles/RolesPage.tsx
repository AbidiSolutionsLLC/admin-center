// client/src/pages/roles/RolesPage.tsx
import { useState } from 'react';
import { Shield, Plus, Edit2, Trash2, Users, Key } from 'lucide-react';
import { useRoles, useCreateRole, useUpdateRole, useDeleteRole } from '@/features/roles/useRoles';
import { useRolePermissions, useAllPermissions, useUpdateRolePermissions } from '@/features/roles/useRolePermissions';
import { PermissionMatrix } from '@/features/roles/PermissionMatrix';
import { Modal } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Role, PermissionUpdate, CreateRoleInput, UpdateRoleInput } from '@/types';

/**
 * RolesPage Component
 * Main page for managing roles and their permission matrix.
 *
 * Features:
 * - View all roles with permission counts
 * - Create/Edit/Delete roles
 * - Permission matrix with grant/deny controls
 * - Role deletion blocked if users assigned (409 error)
 * - All mutations produce audit events (server-side)
 */
export default function RolesPage() {
  // ── Server data ──────────────────────────────────────────────────────
  const { data: roles, isLoading, isError, refetch } = useRoles();
  const { data: allPermissions, isLoading: isLoadingPermissions } = useAllPermissions();

  // Mutations
  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole();
  const deleteMutation = useDeleteRole();
  const updatePermissionsMutation = useUpdateRolePermissions();

  // ── Modal state ──────────────────────────────────────────────────────
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isMatrixModalOpen, setIsMatrixModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateRoleInput>({
    name: '',
    description: '',
    type: 'custom',
  });

  // ── Role permissions (loaded when matrix modal opens) ────────────────
  const { data: rolePermissions, isLoading: isLoadingRolePerms } = useRolePermissions(
    selectedRole?._id ?? ''
  );

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleOpenCreateModal = () => {
    setEditingRole(null);
    setFormData({ name: '', description: '', type: 'custom' });
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      description: role.description,
      type: role.type,
    });
    setIsFormModalOpen(true);
  };

  const handleOpenMatrixModal = (role: Role) => {
    setSelectedRole(role);
    setIsMatrixModalOpen(true);
  };

  const handleSaveRole = async () => {
    if (!formData.name.trim()) return;

    if (editingRole) {
      const updateData: UpdateRoleInput = {
        name: formData.name,
        description: formData.description,
      };
      await updateMutation.mutateAsync({ id: editingRole._id, data: updateData });
    } else {
      await createMutation.mutateAsync(formData as CreateRoleInput);
    }

    setIsFormModalOpen(false);
  };

  const handleDeleteRole = async (role: Role) => {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;

    try {
      await deleteMutation.mutateAsync(role._id);
    } catch (error: any) {
      // 409 Conflict error is handled by the mutation's onError
      console.error('Failed to delete role:', error);
    }
  };

  const handleSavePermissions = async (updates: PermissionUpdate[]) => {
    if (!selectedRole) return;

    await updatePermissionsMutation.mutateAsync({
      roleId: selectedRole._id,
      permissions: updates,
    });
  };

  // ── Loading State ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-surface-secondary animate-pulse rounded" />
          <div className="h-9 w-32 bg-surface-secondary animate-pulse rounded" />
        </div>
        <TableSkeleton rows={6} columns={4} />
      </div>
    );
  }

  // ── Error State ──────────────────────────────────────────────────────
  if (isError) {
    return (
      <ErrorState
        title="Failed to load roles"
        message="Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  // ── Empty State ──────────────────────────────────────────────────────
  if (!roles || roles.length === 0) {
    return (
      <EmptyState
        icon={Shield}
        title="No roles yet"
        description="Create your first role to start managing access control."
        actionLabel="Create Role"
        onAction={handleOpenCreateModal}
      />
    );
  }

  // ── Main Content ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-primary">Roles & Access</h1>
          <p className="text-sm text-ink-muted mt-1">
            Manage roles and their permissions across your organization
          </p>
        </div>
        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-2 h-9 px-4 bg-primary-600 text-white text-sm font-medium rounded-md hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Role
        </button>
      </div>

      {/* Roles Table */}
      <div className="bg-surface border border-line rounded-lg shadow-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line bg-surface-secondary">
              <th className="p-3 text-left text-xs font-semibold text-ink-secondary uppercase tracking-wider">
                Role Name
              </th>
              <th className="p-3 text-left text-xs font-semibold text-ink-secondary uppercase tracking-wider">
                Type
              </th>
              <th className="p-3 text-left text-xs font-semibold text-ink-secondary uppercase tracking-wider">
                Permissions
              </th>
              <th className="p-3 text-left text-xs font-semibold text-ink-secondary uppercase tracking-wider">
                Description
              </th>
              <th className="p-3 text-right text-xs font-semibold text-ink-secondary uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr
                key={role._id}
                className="border-b border-line/50 hover:bg-surface-secondary/30 transition-colors"
              >
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary-600" />
                    <span className="text-sm font-medium text-ink-primary">{role.name}</span>
                  </div>
                </td>
                <td className="p-3">
                  <span
                    className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-md ${
                      role.type === 'system'
                        ? 'bg-ink-primary/10 text-ink-primary'
                        : 'bg-surface-secondary text-ink-secondary'
                    }`}
                  >
                    {role.type === 'system' ? 'System' : 'Custom'}
                  </span>
                </td>
                <td className="p-3">
                  <span className="text-sm text-ink-secondary">
                    {role.granted_permissions_count ?? 0} granted
                  </span>
                </td>
                <td className="p-3">
                  <span className="text-sm text-ink-muted line-clamp-1">
                    {role.description || '—'}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleOpenMatrixModal(role)}
                      className="p-2 text-ink-muted hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors"
                      title="Edit Permissions"
                    >
                      <Key className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleOpenEditModal(role)}
                      className="p-2 text-ink-muted hover:text-ink-primary hover:bg-surface-secondary rounded-md transition-colors"
                      title="Edit Role"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteRole(role)}
                      disabled={deleteMutation.isPending}
                      className="p-2 text-ink-muted hover:text-ink-red hover:bg-ink-red/10 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete Role"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Role Modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={editingRole ? 'Edit Role' : 'Create Role'}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-primary mb-1">
              Role Name <span className="text-ink-red">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full h-9 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600"
              placeholder="e.g., HR Manager"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-primary mb-1">
              Description
            </label>
            <textarea
              value={formData.description ?? ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full h-20 px-3 py-2 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600 resize-none"
              placeholder="Describe what this role can do..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setIsFormModalOpen(false)}
              className="h-9 px-4 text-sm font-medium text-ink-secondary border border-line rounded-md hover:bg-surface-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveRole}
              disabled={!formData.name.trim() || createMutation.isPending || updateMutation.isPending}
              className="h-9 px-4 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : editingRole
                ? 'Update Role'
                : 'Create Role'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Permission Matrix Modal */}
      <Modal
        isOpen={isMatrixModalOpen}
        onClose={() => setIsMatrixModalOpen(false)}
        title={`Permission Matrix: ${selectedRole?.name ?? ''}`}
        size="xl"
      >
        {isLoadingRolePerms || isLoadingPermissions ? (
          <div className="py-8">
            <TableSkeleton rows={8} columns={10} />
          </div>
        ) : allPermissions && rolePermissions ? (
          <PermissionMatrix
            permissions={allPermissions}
            rolePermissions={rolePermissions}
            onUpdate={handleSavePermissions}
            isSaving={updatePermissionsMutation.isPending}
          />
        ) : null}
      </Modal>
    </div>
  );
}
