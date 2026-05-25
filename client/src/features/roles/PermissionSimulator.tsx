import { useState } from 'react';
import { Shield, Search, Loader2, User as UserIcon, AlertCircle, RefreshCw, AlertTriangle, UserX } from 'lucide-react';
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
  // TC_012: validation state for empty user selection
  const [validationError, setValidationError] = useState<string | null>(null);
  // TC_017: dedicated error state for API errors (e.g. 404)
  const [simulateError, setSimulateError] = useState<{ code?: string; message: string } | null>(null);
  // TC_006: track whether results may be stale
  const [isStale, setIsStale] = useState(false);

  const { data: users, isLoading: isLoadingUsers } = useUsers({ search: userSearch });
  const { data: roles, isLoading: isLoadingRoles } = useRoles();
  const simulateMutation = useSimulatePermissions();

  const handleSimulate = () => {
    // TC_012: validate user is selected before simulating
    if (!selectedUserId) {
      setValidationError('Please select a user before running the simulation.');
      return;
    }

    setValidationError(null);
    setSimulateError(null);
    setIsStale(false);

    simulateMutation.mutate(
      { userId: selectedUserId, hypotheticalRoleIds: selectedRoleIds },
      {
        onError: (error: any) => {
          // TC_017: capture error details for in-modal display
          const status = error?.response?.status;
          const code = error?.response?.data?.code;
          const message = error?.response?.data?.error || 'Failed to simulate permissions.';
          if (status === 404) {
            setSimulateError({
              code: 'USER_NOT_FOUND',
              message: 'The selected user could not be found. They may have been deleted.',
            });
          } else {
            setSimulateError({ code, message });
          }
        },
      }
    );
  };

  // TC_006: when role selection changes after a simulation, mark results as stale
  const handleRoleToggle = (roleId: string) => {
    setSelectedRoleIds(prev =>
      prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
    );
    if (simulateMutation.data) {
      setIsStale(true);
    }
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId);
    setValidationError(null);
    // TC_006: changing the user also marks results as stale
    if (simulateMutation.data) {
      setIsStale(true);
    }
  };

  const handleClose = () => {
    // Reset state on close
    setSelectedUserId('');
    setUserSearch('');
    setSelectedRoleIds([]);
    setValidationError(null);
    setSimulateError(null);
    setIsStale(false);
    simulateMutation.reset();
    onClose();
  };

  const selectedUser = users?.find(u => u._id === selectedUserId);
  const simulatedData = simulateMutation.data;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Permission Simulator"
      size="xl"
    >
      <div className="flex flex-col md:flex-row gap-6 p-6 min-h-[500px]">
        {/* Left column: Configuration */}
        <div className="w-full md:w-1/3 space-y-6 border-r border-line pr-6 flex-shrink-0">
          {/* Step 1: Select User */}
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
              ) : !users || users.length === 0 ? (
                <div className="p-3 text-center text-xs text-ink-muted">No users found.</div>
              ) : (
                users.slice(0, 10).map(user => (
                  <button
                    key={user._id}
                    onClick={() => handleUserSelect(user._id)}
                    className={cn(
                      'w-full flex items-center gap-2 p-2 text-sm text-left hover:bg-white transition-colors border-b border-line last:border-0',
                      selectedUserId === user._id && 'bg-primary-light font-medium'
                    )}
                  >
                    <UserIcon className="w-4 h-4 text-ink-muted flex-shrink-0" />
                    <span className="truncate">{user.full_name}</span>
                  </button>
                ))
              )}
            </div>

            {/* TC_012: validation error message */}
            {validationError && (
              <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 font-medium">{validationError}</p>
              </div>
            )}
          </div>

          {/* Step 2: Add Hypothetical Roles */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-ink">2. Add Hypothetical Roles</label>
            <div className="max-h-48 overflow-y-auto border border-line rounded-md bg-surface-alt p-2 space-y-1">
              {isLoadingRoles ? (
                <div className="p-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-ink-muted" /></div>
              ) : !roles || roles.length === 0 ? (
                <div className="p-3 text-center text-xs text-ink-muted">No active roles available.</div>
              ) : (
                roles.map(role => (
                  <label key={role._id} className="flex items-center gap-2 p-1 hover:bg-white rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRoleIds.includes(role._id)}
                      onChange={() => handleRoleToggle(role._id)}
                      className="rounded text-primary focus:ring-primary/20"
                    />
                    <span className="text-sm text-ink truncate flex-1">{role.name}</span>
                    <span className="text-[10px] text-ink-muted font-mono uppercase bg-surface-alt px-1 rounded border border-line">{role.type}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <button
            onClick={handleSimulate}
            disabled={simulateMutation.isPending}
            className="w-full h-9 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {simulateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {simulateMutation.isPending ? 'Simulating...' : 'Simulate'}
          </button>
        </div>

        {/* Right column: Results */}
        <div className="w-full md:w-2/3 flex flex-col min-w-0">
          <label className="text-sm font-semibold text-ink mb-4">Simulation Results</label>

          {/* TC_017: Error state (e.g. 404 deleted user) */}
          {simulateError ? (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-red-200 rounded-lg p-6 bg-red-50/30">
              <UserX className="w-10 h-10 text-red-400 mb-3" />
              <h3 className="text-sm font-semibold text-red-700 mb-1">
                {simulateError.code === 'USER_NOT_FOUND' ? 'User Not Found' : 'Simulation Failed'}
              </h3>
              <p className="text-xs text-red-600 text-center max-w-xs">
                {simulateError.message}
              </p>
              <button
                onClick={() => { setSimulateError(null); simulateMutation.reset(); }}
                className="mt-4 h-8 px-4 text-xs font-medium rounded-md border border-red-300 text-red-700 hover:bg-red-100 transition-colors"
              >
                Dismiss
              </button>
            </div>
          ) : !simulatedData ? (
            /* Default empty state before any simulation */
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-line rounded-lg p-6">
              <Shield className="w-8 h-8 text-ink-muted mb-2 opacity-50" />
              <p className="text-sm text-ink-secondary text-center">
                Select a user and optionally add hypothetical roles, then click <strong>Simulate</strong> to view effective permissions.
              </p>
            </div>
          ) : (
            <div className="flex-1 border border-line rounded-lg overflow-hidden bg-white flex flex-col min-h-0">
              <div className="p-4 border-b border-line bg-surface-alt flex-shrink-0">
                <p className="text-sm text-ink font-medium">
                  Effective access for <span className="text-primary">{selectedUser?.full_name ?? 'selected user'}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {simulatedData.roles.map((r: any) => (
                    <span key={r.role_id} className="inline-flex items-center text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
                      {r.role_name}
                    </span>
                  ))}
                </div>

                {/* TC_006: Stale results banner */}
                {isStale && (
                  <div className="mt-3 flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <p className="text-xs text-amber-700 flex-1">
                      Your selection has changed. Results may be outdated.
                    </p>
                    <button
                      onClick={handleSimulate}
                      disabled={simulateMutation.isPending}
                      className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Re-simulate
                    </button>
                  </div>
                )}
              </div>

              {/* TC_009: Prominent empty state when 0 permissions */}
              {simulatedData.permissions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                  <Shield className="w-10 h-10 text-ink-muted mb-3 opacity-30" />
                  <h3 className="text-sm font-semibold text-ink mb-1">No Permissions Granted</h3>
                  <p className="text-xs text-ink-secondary text-center max-w-xs">
                    This user has no effective permissions with the selected role configuration. Assign roles or check the permission matrix.
                  </p>
                </div>
              ) : (
                /* TC_015: overflow-x-auto for mobile scrolling */
                <div className="flex-1 overflow-auto">
                  {/* TC_014: table with min-width to prevent column overlap */}
                  <table className="w-full text-left border-collapse" style={{ minWidth: '480px' }}>
                    <thead className="sticky top-0 bg-white shadow-sm z-10">
                      <tr>
                        <th className="px-4 py-2 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider border-b border-line w-1/4">Module</th>
                        <th className="px-4 py-2 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider border-b border-line w-1/4">Action</th>
                        <th className="px-4 py-2 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider border-b border-line w-1/4">Scope</th>
                        <th className="px-4 py-2 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider border-b border-line w-1/4">Access</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulatedData.permissions.map((p: any, idx: number) => (
                        <tr key={idx} className="border-b border-line last:border-0 hover:bg-surface-alt">
                          {/* TC_014: truncate long names with title tooltip */}
                          <td className="px-4 py-2 text-sm text-ink capitalize max-w-[120px]">
                            <span className="block truncate" title={p.module}>{p.module}</span>
                          </td>
                          <td className="px-4 py-2 text-sm text-ink capitalize max-w-[120px]">
                            <span className="block truncate" title={p.action}>{p.action}</span>
                          </td>
                          <td className="px-4 py-2 text-sm text-ink capitalize max-w-[120px]">
                            <span className="block truncate" title={p.data_scope}>{p.data_scope}</span>
                          </td>
                          <td className="px-4 py-2">
                            {p.granted ? (
                              <span className="inline-flex items-center text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">Granted</span>
                            ) : (
                              <span className="inline-flex items-center text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 rounded-full px-2 py-0.5">Denied</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-4 border-t border-line bg-[#F7F8FA] flex justify-end">
        <button onClick={handleClose} className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors">
          Close Simulator
        </button>
      </div>
    </Modal>
  );
}
