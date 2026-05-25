import { useState } from 'react';
import { Shield, Search, Loader2, User as UserIcon } from 'lucide-react';
import { useSimulatePermissions, useRoles } from './useRoles';
import { useUsers } from '@/features/people/hooks/useUsers';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/utils/cn';

interface SimulatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PermissionSimulator({ isOpen, onClose }: SimulatorProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [userSearch, setUserSearch] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  const { data: users, isLoading: isLoadingUsers } = useUsers({ search: userSearch });
  const { data: roles, isLoading: isLoadingRoles } = useRoles();
  const simulateMutation = useSimulatePermissions();

  const handleSimulate = () => {
    if (!selectedUserId) return;
    simulateMutation.mutate({
      userId: selectedUserId,
      hypotheticalRoleIds: selectedRoleIds,
    });
  };

  const selectedUser = users?.find(u => u._id === selectedUserId);

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds(prev =>
      prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
    );
  };

  const simulatedData = simulateMutation.data;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Permission Simulator"
      size="xl"
    >
      <div className="flex flex-col md:flex-row gap-6 p-6 min-h-[500px]">
        {/* Left column: Configuration */}
        <div className="w-full md:w-1/3 space-y-6 border-r border-line pr-6">
          <div className="space-y-3">
            <label className="text-sm font-semibold text-ink">1. Select User</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search user..."
                className="w-full h-9 pl-9 pr-4 text-sm rounded-md border border-line bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            
            <div className="max-h-40 overflow-y-auto border border-line rounded-md bg-surface-alt">
              {isLoadingUsers ? (
                <div className="p-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-ink-muted" /></div>
              ) : users?.slice(0, 10).map(user => (
                <button
                  key={user._id}
                  onClick={() => setSelectedUserId(user._id)}
                  className={cn(
                    "w-full flex items-center gap-2 p-2 text-sm text-left hover:bg-white transition-colors border-b border-line last:border-0",
                    selectedUserId === user._id && "bg-primary-light font-medium"
                  )}
                >
                  <UserIcon className="w-4 h-4 text-ink-muted" />
                  <span className="truncate">{user.full_name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-semibold text-ink">2. Add Hypothetical Roles</label>
            <div className="max-h-48 overflow-y-auto border border-line rounded-md bg-surface-alt p-2 space-y-1">
              {isLoadingRoles ? (
                <div className="p-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-ink-muted" /></div>
              ) : roles?.map(role => (
                <label key={role._id} className="flex items-center gap-2 p-1 hover:bg-white rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRoleIds.includes(role._id)}
                    onChange={() => toggleRole(role._id)}
                    className="rounded text-primary focus:ring-primary/20"
                  />
                  <span className="text-sm text-ink truncate">{role.name}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleSimulate}
            disabled={!selectedUserId || simulateMutation.isPending}
            className="w-full h-9 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {simulateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Simulate
          </button>
        </div>

        {/* Right column: Results */}
        <div className="w-full md:w-2/3 flex flex-col">
          <label className="text-sm font-semibold text-ink mb-4">Simulation Results</label>
          
          {!simulatedData ? (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-line rounded-lg p-6">
              <Shield className="w-8 h-8 text-ink-muted mb-2 opacity-50" />
              <p className="text-sm text-ink-secondary text-center">
                Select a user and roles, then click Simulate to view effective permissions.
              </p>
            </div>
          ) : (
            <div className="flex-1 border border-line rounded-lg overflow-hidden bg-white flex flex-col">
              <div className="p-4 border-b border-line bg-surface-alt">
                <p className="text-sm text-ink font-medium">
                  Effective access for <span className="text-primary">{selectedUser?.full_name}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {simulatedData.roles.map((r: any) => (
                    <span key={r.role_id} className="inline-flex items-center text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
                      {r.role_name}
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-0">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-white shadow-sm">
                    <tr>
                      <th className="px-4 py-2 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">Module</th>
                      <th className="px-4 py-2 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">Action</th>
                      <th className="px-4 py-2 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">Scope</th>
                      <th className="px-4 py-2 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulatedData.permissions.length === 0 ? (
                      <tr><td colSpan={4} className="p-4 text-center text-sm text-ink-muted">No permissions granted.</td></tr>
                    ) : (
                      simulatedData.permissions.map((p: any, idx: number) => (
                        <tr key={idx} className="border-b border-line last:border-0 hover:bg-surface-alt">
                          <td className="px-4 py-2 text-sm text-ink capitalize">{p.module}</td>
                          <td className="px-4 py-2 text-sm text-ink capitalize">{p.action}</td>
                          <td className="px-4 py-2 text-sm text-ink capitalize">{p.data_scope}</td>
                          <td className="px-4 py-2">
                            {p.granted ? (
                              <span className="inline-flex items-center text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">Granted</span>
                            ) : (
                              <span className="inline-flex items-center text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 rounded-full px-2 py-0.5">Denied</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="px-6 py-4 border-t border-line bg-[#F7F8FA] flex justify-end">
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors">
          Close Simulator
        </button>
      </div>
    </Modal>
  );
}
