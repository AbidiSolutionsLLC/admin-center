import { useState, useMemo } from 'react';
import { Users, Plus, Edit2, Trash2, Search, X, Loader2, UserPlus, UserMinus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup, useGroupUsers, useAddUsersToGroup, useRemoveUsersFromGroup, type Group } from '@/features/groups/useGroups';
import { useUsers } from '@/features/people/hooks/useUsers';
import { Modal } from '@/components/ui/Modal';
import { DataTable } from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthStore } from '@/store/useAuthStore';
import { cn } from '@/utils/cn';
import { PERMISSION_GROUPS } from '@/constants/roles';

const MAX_NAME_LENGTH = 100;

export default function GroupsPage() {
  const { userRole } = useAuthStore();
  const canMutate = useMemo(() => 
    [...PERMISSION_GROUPS.ROLE_ADMINS, 'super_admin', 'hr_admin', 'ops_admin'].includes(userRole || ''),
  [userRole]);

  const canDelete = useMemo(() => 
    [...PERMISSION_GROUPS.SUPER_ADMINS, 'super_admin'].includes(userRole || ''),
  [userRole]);

  const [search, setSearch] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<Group | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  
  const [userSearchQuery, setUserSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'static' as 'static' | 'dynamic',
  });
  const [formError, setFormError] = useState<string | null>(null);

  const { data: groups, isLoading, isError, refetch } = useGroups();

  const createMutation = useCreateGroup();
  const updateMutation = useUpdateGroup();
  const deleteMutation = useDeleteGroup();
  const addUsersMutation = useAddUsersToGroup();
  const removeUsersMutation = useRemoveUsersFromGroup();

  const { data: groupUsers, isLoading: isLoadingGroupUsers } = useGroupUsers(
    isUsersModalOpen ? (selectedGroup?._id ?? '') : ''
  );

  const { data: people } = useUsers({ search: userSearchQuery });

  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (!search) return groups;
    const lower = search.toLowerCase();
    return groups.filter(g => g.name.toLowerCase().includes(lower));
  }, [groups, search]);

  const handleOpenCreateModal = () => {
    if (!canMutate) return;
    setEditingGroup(null);
    setFormData({ name: '', description: '', type: 'static' });
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (group: Group) => {
    if (!canMutate) return;
    setEditingGroup(group);
    setFormData({
      name: group.name,
      description: group.description || '',
      type: group.type,
    });
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleOpenUsersModal = (group: Group) => {
    setSelectedGroup(group);
    setIsUsersModalOpen(true);
    setUserSearchQuery('');
  };

  const handleSaveGroup = async () => {
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      setFormError('Group name is required');
      return;
    }

    try {
      if (editingGroup) {
        await updateMutation.mutateAsync({ 
          id: editingGroup._id, 
          data: { name: trimmedName, description: formData.description.trim() } 
        });
      } else {
        await createMutation.mutateAsync({
          name: trimmedName,
          description: formData.description.trim(),
          type: formData.type,
        });
      }
      setIsFormModalOpen(false);
    } catch (error: any) {
      setFormError(error.response?.data?.error || 'An error occurred while saving.');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!groupToDelete) return;
    try {
      await deleteMutation.mutateAsync(groupToDelete._id);
      setGroupToDelete(null);
    } catch (error: any) {
      // Error handled by mutation toast or UI
      setGroupToDelete(null);
    }
  };

  const handleAssignUser = async (userId: string) => {
    if (!selectedGroup) return;
    await addUsersMutation.mutateAsync({ groupId: selectedGroup._id, userIds: [userId] });
    setUserSearchQuery('');
  };

  const handleUnassignUser = async (userId: string) => {
    if (!selectedGroup) return;
    await removeUsersMutation.mutateAsync({ groupId: selectedGroup._id, userIds: [userId] });
  };

  const columns = useMemo<ColumnDef<Group>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Group Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <Users className="h-4 w-4 text-indigo-400" />
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
          row.original.type === 'dynamic' ? "bg-purple-500/20 text-purple-400" : "bg-slate-500/20 text-slate-400"
        )}>
          {row.original.type}
        </span>
      ),
    },
    {
      accessorKey: 'user_count',
      header: 'Users',
      cell: ({ row }) => (
        <span className="text-sm text-ink-secondary">
          {row.original.user_count ?? 0} members
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
        const group = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenUsersModal(group);
              }}
              className="p-2 text-ink-muted hover:text-ink hover:bg-surface-alt rounded-lg transition-all"
              title="Assigned Users"
            >
              <Users className="h-4 w-4" />
            </button>
            {canMutate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenEditModal(group);
                }}
                className="p-2 text-ink-muted hover:text-ink hover:bg-surface-alt rounded-lg transition-all"
                title="Edit Group"
              >
                <Edit2 className="h-4 w-4" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setGroupToDelete(group);
                }}
                className="p-2 text-ink-muted hover:text-error hover:bg-red-50 rounded-lg transition-all"
                title="Delete Group"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      },
    },
  ], [canMutate, canDelete]);

  if (isError) {
    return (
      <ErrorState
        title="Failed to load groups"
        description="Something went wrong fetching groups. Please try again."
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">User Groups</h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            Manage user groups to assign access efficiently at scale
          </p>
        </div>
        {canMutate && (
          <button
            onClick={handleOpenCreateModal}
            className="h-9 px-4 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-hover transition-colors flex items-center gap-2 justify-center"
          >
            <Plus className="h-4 w-4" />
            Create Group
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups by name..."
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
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : !filteredGroups || filteredGroups.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? 'No groups found' : 'No groups yet'}
          description={search ? `No groups matching "${search}"` : 'Create your first group to start managing access efficiently.'}
          action={!search && canMutate ? { label: 'Create Group', onClick: handleOpenCreateModal } : undefined}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filteredGroups}
          onRowClick={handleOpenUsersModal}
        />
      )}

      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={editingGroup ? 'Edit Group' : 'Create Group'}
        size="md"
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-ink">Group Name <span className="text-error">*</span></label>
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
              placeholder="e.g. Finance Team"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Description</label>
            <textarea
              value={formData.description ?? ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full h-24 p-3 text-sm rounded-lg border border-line bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
              placeholder="Provide a brief description of this group..."
            />
          </div>

          {!editingGroup && (
             <div className="space-y-1.5">
               <label className="text-sm font-medium text-ink">Type</label>
               <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'static' | 'dynamic' })}
                  className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
               >
                 <option value="static">Static (Manual Membership)</option>
                 <option value="dynamic">Dynamic (Rule-based, coming soon)</option>
               </select>
             </div>
          )}

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
              onClick={handleSaveGroup}
              disabled={!formData.name.trim() || formData.name.length > MAX_NAME_LENGTH || createMutation.isPending || updateMutation.isPending}
              className="h-9 px-4 text-sm font-medium rounded-md bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingGroup ? 'Update Group' : 'Create Group'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isUsersModalOpen}
        onClose={() => setIsUsersModalOpen(false)}
        title={`Assigned Users: ${selectedGroup?.name}`}
        size="md"
      >
        <div className="space-y-6">
          {canMutate && selectedGroup?.type === 'static' && (
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
                
                {userSearchQuery.length >= 2 && people && people.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-line rounded-lg shadow-dropdown z-50 max-h-60 overflow-y-auto">
                    {people.map((person: any) => {
                      const isAlreadyAssigned = groupUsers?.some((u: any) => u.user_id._id === person._id);
                      return (
                        <button
                          key={person._id}
                          disabled={isAlreadyAssigned || addUsersMutation.isPending}
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Currently Assigned</label>
              <span className="text-xs font-medium text-ink-secondary">{groupUsers?.length || 0} users</span>
            </div>
            
            <div className="border border-line rounded-xl overflow-hidden divide-y divide-line bg-white">
              {isLoadingGroupUsers ? (
                <div className="p-10 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  <p className="text-[11px] text-ink-muted font-medium">Fetching users...</p>
                </div>
              ) : !groupUsers || groupUsers.length === 0 ? (
                <div className="p-10 text-center">
                  <Users className="w-8 h-8 text-ink-muted mx-auto mb-2 opacity-20" />
                  <p className="text-sm text-ink-muted font-medium">No users assigned to this group</p>
                </div>
              ) : (
                groupUsers.map((member: any) => {
                  const user = member.user_id;
                  if (!user) return null;
                  return (
                    <div key={user._id} className="flex items-center gap-3 px-4 py-3 group">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-semibold text-indigo-400">
                        {user.full_name?.charAt(0) || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{user.full_name}</p>
                        <p className="text-[11px] text-ink-secondary truncate">
                          {user.email} • <span className="capitalize">{user.lifecycle_state}</span>
                        </p>
                      </div>
                      {canMutate && selectedGroup?.type === 'static' && (
                        <button
                          onClick={() => handleUnassignUser(user._id)}
                          disabled={removeUsersMutation.isPending}
                          className="p-2 text-ink-muted hover:text-error hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="Remove User"
                        >
                          <UserMinus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })
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

      <ConfirmDialog
        isOpen={!!groupToDelete}
        onClose={() => setGroupToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Group"
        description={`Are you sure you want to delete the group "${groupToDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete Group"
        variant="error"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
