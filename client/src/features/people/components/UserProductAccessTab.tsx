// client/src/features/people/components/UserProductAccessTab.tsx — 08 §3.2 User detail -> Product access tab
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  CheckCircle2, 
  XCircle, 
  ShieldCheck, 
  AlertCircle, 
  Plus, 
  RefreshCw, 
  Monitor, 
  Users,
  CheckSquare,
  FileText,
  Headphones
} from 'lucide-react';
import { useEffectiveAccess, useAppRoles, useSubscription, isEntitled } from '@/features/apps/productAccess';
import { useApps, useAssignApp } from '@/features/apps/useApps';
import { useUserAppHistory } from '@/features/people/hooks/useUserAppHistory';
import { Modal } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { UserAppAccessPanel } from './UserAppAccessPanel';
import { toast } from 'sonner';

interface UserProductAccessTabProps {
  userId: string;
  userName?: string;
}

const HUMAN_DENIED_REASONS: Record<string, string> = {
  ORG_SUSPENDED: 'Organization is currently suspended',
  MEMBER_NOT_ACTIVE: 'Member account is inactive or offboarded',
  IDENTITY_NOT_ACTIVE: 'Identity account is disabled or locked',
  NO_ASSIGNMENT: 'No active rule grants access to this product',
  NO_ENTITLEMENT: 'Product not included in organization subscription plan',
  NO_ROLE: 'No valid product role could be assigned',
};

const STANDARD_PRODUCTS = [
  { key: 'people', name: 'People', description: 'HR and people operations', icon: Users, color: 'text-sky-400' },
  { key: 'projects', name: 'Projects', description: 'Projects and work management', icon: CheckSquare, color: 'text-amber-400' },
  { key: 'sign', name: 'Sign', description: 'Document signing and workflows', icon: FileText, color: 'text-emerald-400' },
  { key: 'desk', name: 'Desk', description: 'Service desk and ticketing', icon: Headphones, color: 'text-violet-400' },
];

export function UserProductAccessTab({ userId, userName }: UserProductAccessTabProps) {
  const queryClient = useQueryClient();
  const { data: effectiveAccess, isLoading: isLoadingEA, isError: isErrorEA, refetch: refetchEA } = useEffectiveAccess(userId);
  const { data: history = [] } = useUserAppHistory(userId);
  const { data: apps = [] } = useApps();
  const { data: subscription } = useSubscription();

  // "Add direct access" modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProductKey, setSelectedProductKey] = useState<string>('people');
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>('');
  const [assignReason, setAssignReason] = useState<string>('Direct grant by administrator');

  // Find the app corresponding to the selected product
  const selectedApp = apps.find((a) => (a.product_key || a.slug) === selectedProductKey || a.product_key === selectedProductKey);
  const { data: appRoles = [], isLoading: isLoadingRoles } = useAppRoles(selectedApp?._id ?? '', !!selectedApp?._id);

  const assignApp = useAssignApp();

  const handleOpenModal = (defaultKey?: string) => {
    if (defaultKey) setSelectedProductKey(defaultKey);
    setSelectedRoleKey('');
    setAssignReason('Direct grant by administrator');
    setIsModalOpen(true);
  };

  const handleGrantDirectAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) {
      toast.error('Selected application was not found');
      return;
    }
    try {
      await assignApp.mutateAsync({
        appId: selectedApp._id,
        data: {
          target_type: 'user',
          target_id: userId,
          product_role_key: selectedRoleKey || undefined,
          reason: assignReason || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['people', 'effective-access', userId] });
      queryClient.invalidateQueries({ queryKey: ['userAppHistory', userId] });
      toast.success(`Direct access granted for ${selectedApp.name}`);
      setIsModalOpen(false);
    } catch {
      // error toast handled by mutation
    }
  };

  if (isLoadingEA) {
    return (
      <div className="space-y-4">
        <TableSkeleton rows={4} columns={5} />
      </div>
    );
  }

  if (isErrorEA || !effectiveAccess) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card p-8 text-center">
        <AlertCircle className="w-8 h-8 text-error mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-ink mb-1">Failed to load product access</h3>
        <p className="text-sm text-ink-secondary mb-3">Could not fetch effective access data.</p>
        <button
          onClick={() => refetchEA()}
          className="h-8 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  const grantedProducts = effectiveAccess.products ?? {};
  const denials = effectiveAccess.denials ?? {};

  return (
    <div className="space-y-6">
      {/* ── Header Row ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Product Access & Entitlements</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Which products this person can use, with which role, and which rule grants it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono px-2 py-1 rounded bg-surface-alt border border-line text-ink-muted">
            Authz Version: v{effectiveAccess.authz_ver}
          </span>
          <button
            onClick={() => handleOpenModal()}
            className="h-9 px-3.5 text-xs font-semibold rounded-md bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add direct access
          </button>
        </div>
      </div>

      {/* ── Product Access Table (08 §3.2) ── */}
      <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-line bg-surface-alt/60 text-[11px] font-bold text-ink-muted uppercase tracking-wider">
              <th className="py-3 px-4">Product</th>
              <th className="py-3 px-4">Access</th>
              <th className="py-3 px-4">Effective Role</th>
              <th className="py-3 px-4">Granted Via</th>
              <th className="py-3 px-4">Reason if Denied</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-sm">
            {STANDARD_PRODUCTS.map((prod) => {
              const accessInfo = grantedProducts[prod.key];
              const isGranted = !!accessInfo;
              const rawDenial = denials[prod.key];
              const humanReason = rawDenial ? (HUMAN_DENIED_REASONS[rawDenial] || rawDenial) : null;
              const app = apps.find((a) => (a.product_key || a.slug) === prod.key || a.product_key === prod.key);
              const entitled = isEntitled(subscription?.entitlements, prod.key);

              // Server-explained provenance (elevation 5.6): the assignments that give the role
              const reasons = effectiveAccess.reasons?.[prod.key] ?? [];

              // Fallback for older payloads: match assignments from user history
              const matchingAssignments = history.filter(
                (h) => h.is_active && (h.app_id === app?._id || h.app_info?.slug?.includes(prod.key) || h.app_info?.name?.toLowerCase().includes(prod.name.toLowerCase()))
              );

              return (
                <tr key={prod.key} className="hover:bg-surface-alt/30 transition-colors">
                  {/* Product */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-surface-alt border border-line flex items-center justify-center flex-shrink-0">
                        <prod.icon className={`w-4 h-4 ${prod.color}`} />
                      </div>
                      <div>
                        <div className="font-semibold text-ink flex items-center gap-1.5">
                          {prod.name}
                          {!entitled && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-50 text-amber-600 border border-amber-200">
                              Unentitled
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-ink-muted">{prod.description}</div>
                      </div>
                    </div>
                  </td>

                  {/* Access (Yes/No) */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isGranted ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                        <XCircle className="w-3.5 h-3.5" />
                        No
                      </span>
                    )}
                  </td>

                  {/* Role */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isGranted ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-alt border border-line text-xs font-semibold text-ink">
                        <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                        {accessInfo.role_name || accessInfo.role}
                      </span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>

                  {/* Granted via (rule chips) */}
                  <td className="py-3.5 px-4">
                    {isGranted ? (
                      <div className="flex flex-wrap gap-1.5">
                        {reasons.length > 0 ? (
                          reasons.map((r) => (
                            <span
                              key={r.assignment_id}
                              data-testid="granted-via"
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200"
                              title={`${r.product_role_key ? `Role ${r.product_role_key}` : 'Default role'}${r.include_descendants ? ', including sub-units' : ''}`}
                            >
                              {r.target_type === 'user' ? 'Direct User' : `${r.target_type}: ${r.target_name}`}
                            </span>
                          ))
                        ) : matchingAssignments.length > 0 ? (
                          matchingAssignments.map((a) => (
                            <span
                              key={a._id}
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200"
                              title={`Target: ${a.target_type} ${a.target_name || ''} (granted ${new Date(a.granted_at).toLocaleDateString()})`}
                            >
                              {a.target_type === 'user'
                                ? 'Direct User'
                                : `${a.target_type}: ${a.target_name || 'Rule'}`}
                            </span>
                          ))
                        ) : accessInfo.granted_by && accessInfo.granted_by.length > 0 ? (
                          accessInfo.granted_by.map((ruleId, idx) => (
                            <span
                              key={ruleId}
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200 font-mono"
                              title={`Rule Assignment ID: ${ruleId}`}
                            >
                              Rule #{idx + 1}
                            </span>
                          ))
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            Organization Default
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>

                  {/* Reason if denied */}
                  <td className="py-3.5 px-4">
                    {humanReason ? (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50/80 border border-amber-200/80 text-xs font-medium text-amber-800">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                        <span>{humanReason}</span>
                      </div>
                    ) : isGranted ? (
                      <span className="text-xs text-ink-muted">Access active</span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleOpenModal(prod.key)}
                      className="h-7 px-2.5 text-xs font-medium rounded border border-line bg-white text-ink hover:bg-surface-alt transition-colors inline-flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Direct Access
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── App Access History Timeline ── */}
      <div className="pt-2">
        <div className="flex items-center gap-2 mb-3">
          <Monitor className="w-4 h-4 text-ink-secondary" />
          <h3 className="text-sm font-semibold text-ink">App Access History & Audit Events</h3>
        </div>
        <UserAppAccessPanel userId={userId} />
      </div>

      {/* ── Add Direct Access Modal ── */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Add Direct Product Access"
          description={`Grant individual product access to ${userName || 'this user'}. This creates a direct user assignment rule.`}
          size="md"
          footer={
            <>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={assignApp.isPending}
                className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="direct-access-form"
                disabled={assignApp.isPending}
                className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {assignApp.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Granting...
                  </>
                ) : (
                  'Grant Access'
                )}
              </button>
            </>
          }
        >
          <form id="direct-access-form" onSubmit={handleGrantDirectAccess} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-ink-muted tracking-wider mb-1.5">
                Target Product
              </label>
              <select
                value={selectedProductKey}
                onChange={(e) => {
                  setSelectedProductKey(e.target.value);
                  setSelectedRoleKey('');
                }}
                className="w-full h-10 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary font-medium"
              >
                {STANDARD_PRODUCTS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name} ({p.description})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-ink-muted tracking-wider mb-1.5">
                Product Role
              </label>
              <select
                value={selectedRoleKey}
                onChange={(e) => setSelectedRoleKey(e.target.value)}
                disabled={isLoadingRoles}
                className="w-full h-10 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">{isLoadingRoles ? 'Loading catalog roles...' : 'Default Product Role'}</option>
                {appRoles
                  .filter((r) => r.assignable)
                  .map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name} (Rank: {r.rank}){r.is_default ? ' — default' : ''}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-ink-muted mt-1">
                Direct assignment overrides inherited default roles if of equal or higher rank.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-ink-muted tracking-wider mb-1.5">
                Grant Reason
              </label>
              <input
                type="text"
                value={assignReason}
                onChange={(e) => setAssignReason(e.target.value)}
                placeholder="e.g. Project Lead direct entitlement"
                className="w-full h-10 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
