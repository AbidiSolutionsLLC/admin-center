// Operator API client + hooks + contract types (one place to adapt to backend shape).
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { refreshOperatorSession, startOperatorLogin, useOperatorAuthStore } from './operatorAuth';

// Distinct instance: only ever carries the operator bearer token and only targets /operator/v1.
export const operatorApi = axios.create({
  baseURL: import.meta.env.VITE_OPERATOR_API_URL || `http://${window.location.hostname}:5000/operator/v1`,
  timeout: 15000,
});

operatorApi.interceptors.request.use((config) => {
  const token = useOperatorAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

operatorApi.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && original) {
      if (!original._retry && useOperatorAuthStore.getState().refreshToken) {
        original._retry = true;
        try {
          const token = await refreshOperatorSession();
          original.headers.Authorization = `Bearer ${token}`;
          return operatorApi(original);
        } catch { /* fall through */ }
      }
      useOperatorAuthStore.getState().clear();
      void startOperatorLogin(window.location.pathname);
    }
    return Promise.reject(err);
  },
);

export interface OperatorMe extends OperatorUser { permissions: string[] }

/** The signed-in operator and their permission list (GET /me). The SPA only hides what the API would refuse. */
export const useOperatorMe = () =>
  useQuery({
    queryKey: ['operator', 'me'],
    queryFn: async () => (await operatorApi.get('/me')).data.data as OperatorMe,
    staleTime: 5 * 60_000,
  });

export const useOperatorCan = (permission: string) => !!useOperatorMe().data?.permissions.includes(permission);

export const errMsg = (e: any, fallback: string) => e?.response?.data?.error || e?.response?.data?.message || fallback;

export interface OrgEntitlement { product_key: string; status: string; seats_limit?: number | null }
export interface OperatorOrg {
  id: string; slug: string; name: string; status: string; members_count?: number;
  entitlements?: OrgEntitlement[]; last_activity?: string | null; created_at?: string; plan_key?: string;
  members_total?: number; members_active?: number; products?: string[]; last_activity_at?: string | null; tags?: string[]; trial_ends_at?: string | null;
}
export interface Plan {
  id?: string; _id?: string; key: string; name: string; products: string[];
  description?: string | null; seat_defaults?: Record<string, number | null>; trial_days?: number | null; version?: number; tenant_count?: number; status?: string;
}
export interface PlanPreview {
  added: { product_key: string; tenants: number }[]; restricted: { product_key: string; tenants: number }[];
  unchanged: { product_key: string; tenants: number }[]; tenants_affected: number;
}
export interface OperatorUser { id?: string; _id?: string; email: string; full_name?: string; roles?: string[]; status: string; mfa_enabled?: boolean; last_login_at?: string | null; created_at?: string }
export interface AuditEntry {
  id?: string; _id?: string; action: string; operator_id?: string; operator_email?: string;
  target_type?: string; target_id?: string | null; company_id?: string | null;
  details?: Record<string, unknown> | null; correlation_id?: string | null; created_at?: string;
  category?: string; result?: 'success' | 'failure'; reason?: string | null; before?: unknown; after?: unknown;
}

export const AUDIT_CATEGORIES = ['tenant', 'plan', 'entitlement', 'onboarding', 'operator', 'product', 'security', 'system'] as const;
export interface AuditFilters { action?: string; category?: string; operator_id?: string; company_id?: string; from?: string; to?: string }

const idOf = <T extends { id?: string; _id?: string }>(x: T) => (x.id ?? x._id) as string;
export { idOf };

export const useOrgs = (params: { search?: string; status?: string; plan?: string; tag?: string; trial?: boolean; sort?: string; cursor?: string; limit?: number }) =>
  useQuery({
    queryKey: ['operator', 'orgs', params],
    queryFn: async () => {
      const r = (await operatorApi.get('/orgs', { params })).data;
      return { data: (r.data ?? []) as OperatorOrg[], total: r.meta?.total as number | undefined, next_cursor: (r.meta?.next_cursor ?? null) as string | null };
    },
  });

export const useOrgAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'suspend' | 'reactivate' | 'close' }) =>
      (await operatorApi.post(`/orgs/${id}/${action}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operator', 'orgs'] });
      qc.invalidateQueries({ queryKey: ['operator', 'org'] });
      toast.success('Organization updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Action failed')),
  });
};

export const useCreateOrg = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; slug?: string; plan_key: string; first_admin: { email: string; full_name: string } }) =>
      (await operatorApi.post('/orgs', body)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operator', 'orgs'] }); toast.success('Organization created'); },
    onError: (e) => toast.error(errMsg(e, 'Failed to create organization')),
  });
};

export interface EntitlementOverride { orgId: string; productKey: string; status: 'active' | 'suspended'; seats_limit?: number | null; reason: string; expires_at?: string | null }

/** Set an override (PUT): a reason is required, an active override may expire. */
export const useSetEntitlement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, productKey, ...body }: EntitlementOverride) =>
      (await operatorApi.put(`/orgs/${orgId}/entitlements/${productKey}`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operator', 'orgs'] });
      qc.invalidateQueries({ queryKey: ['operator', 'org'] });
      toast.success('Override saved');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to save override')),
  });
};

export const usePlans = () =>
  useQuery({
    queryKey: ['operator', 'plans'],
    queryFn: async () => ((await operatorApi.get('/plans')).data.data ?? []) as Plan[],
  });

export const useSavePlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id?: string; body: Partial<Plan> }) => // id = plan key for updates
      id ? (await operatorApi.patch(`/plans/${id}`, body)).data : (await operatorApi.post('/plans', body)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operator', 'plans'] }); toast.success('Plan saved'); },
    onError: (e) => toast.error(errMsg(e, 'Failed to save plan')),
  });
};

/** Dry run of applying a plan to every tenant on it (nothing is written). */
export const usePlanPreview = (key: string, enabled: boolean) =>
  useQuery({
    enabled,
    queryKey: ['operator', 'plan-preview', key],
    gcTime: 0,
    queryFn: async () => (await operatorApi.post(`/plans/${key}/apply`, null, { params: { dry_run: true } })).data.data as PlanPreview,
  });

export const useApplyPlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => (await operatorApi.post(`/plans/${key}/apply`)).data.data as { queued: number },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['operator'] }); toast.success(`Plan applying to ${r.queued} organization(s)`); },
    onError: (e) => toast.error(errMsg(e, 'Failed to apply plan')),
  });
};

export const useOperators = (opts: { enabled?: boolean } = {}) =>
  useQuery({
    enabled: opts.enabled ?? true,
    queryKey: ['operator', 'operators'],
    queryFn: async () => ((await operatorApi.get('/operators')).data.data ?? []) as OperatorUser[],
  });

export const useSaveOperator = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id?: string; body: Record<string, unknown> }) =>
      id ? (await operatorApi.patch(`/operators/${id}`, body)).data : (await operatorApi.post('/operators', body)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operator', 'operators'] }); toast.success('Operator saved'); },
    onError: (e) => toast.error(errMsg(e, 'Failed to save operator')),
  });
};

/** GET /audit/export with the current filters; hands the CSV to the browser as a download. */
export async function downloadAuditCsv(filters: AuditFilters) {
  const res = await operatorApi.get('/audit/export', { params: filters, responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `operator-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const useOperatorAudit = (params: AuditFilters & { cursor?: string; limit?: number }) =>
  useQuery({
    queryKey: ['operator', 'audit', params],
    queryFn: async () => {
      const r = (await operatorApi.get('/audit', { params })).data;
      return { data: (r.data ?? []) as AuditEntry[], next_cursor: (r.meta?.next_cursor ?? null) as string | null };
    },
  });

// ── Tenant profile (Plan 4.4) ────────────────────────────────────────────────────────────────
export interface OperatorOrgDetail extends OperatorOrg { first_admin: { email: string; full_name: string; lifecycle_state: string } | null }
export interface OrgProduct {
  product_key: string; name?: string; status: string; source: string | null; plan_key: string | null; seats_limit: number | null;
  plan_version?: number | null; reason?: string | null; expires_at?: string | null;
  seats_used?: number | null; seats_computed_at?: string | null;
}
export interface OrgAdmin { id: string; full_name: string; email: string; roles: string[]; mfa_enabled: boolean; last_login_at: string | null; status: string }
export interface OrgNote { id: string; operator_id: string; operator_email: string; body: string; created_at: string }
export interface OrgOnboarding {
  stage: string;
  first_admin: { user_id: string; email: string; full_name: string; lifecycle_state: string } | null;
  invitation: { state: string; sent_at: string | null; sent_count: number; expires_at: string; accepted_at: string | null; revoked_at: string | null } | null;
  delivery: { status: string; attempts: number; last_error: string | null; sent_at: string | null; queued_at: string } | null;
}
export interface OnboardingRow extends OrgOnboarding { organization: { id: string; slug: string; name: string; status: string } }
export interface OrgIdp {
  id: string; type: string; display_name: string; status: string; tenant_id: string | null;
  tenant_approval: { tenant_id: string; approved_at: string; operator_id: string } | null;
}

const orgKey = (id: string, part: string) => ['operator', 'org', id, part] as const;

export const useOrg = (id: string) =>
  useQuery({ queryKey: orgKey(id, 'detail'), queryFn: async () => (await operatorApi.get(`/orgs/${id}`)).data.data as OperatorOrgDetail });
export const useOrgProducts = (id: string) =>
  useQuery({ queryKey: orgKey(id, 'products'), queryFn: async () => ((await operatorApi.get(`/orgs/${id}/products`)).data.data ?? []) as OrgProduct[] });
export const useOrgAdmins = (id: string) =>
  useQuery({ queryKey: orgKey(id, 'admins'), queryFn: async () => ((await operatorApi.get(`/orgs/${id}/admins`)).data.data ?? []) as OrgAdmin[] });
export const useOrgNotes = (id: string) =>
  useQuery({ queryKey: orgKey(id, 'notes'), queryFn: async () => ((await operatorApi.get(`/orgs/${id}/notes`)).data.data ?? []) as OrgNote[] });
export const useOrgOnboarding = (id: string) =>
  useQuery({ queryKey: orgKey(id, 'onboarding'), queryFn: async () => (await operatorApi.get(`/orgs/${id}/onboarding`)).data.data as OrgOnboarding });
export const useOrgIdps = (id: string) =>
  useQuery({ queryKey: orgKey(id, 'idps'), queryFn: async () => ((await operatorApi.get(`/orgs/${id}/identity-providers`)).data.data ?? []) as OrgIdp[] });

/** A mutation on one organization that refreshes everything cached for it (and the list). */
function useOrgMutation<V>(id: string, fn: (v: V) => Promise<unknown>, done: string, failed: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operator', 'org', id] }); qc.invalidateQueries({ queryKey: ['operator', 'orgs'] }); toast.success(done); },
    onError: (e) => toast.error(errMsg(e, failed)),
  });
}

export const usePatchOrg = (id: string) =>
  useOrgMutation(id, (body: { tags?: string[]; trial_ends_at?: string | null }) => operatorApi.patch(`/orgs/${id}`, body), 'Organization updated', 'Failed to update organization');
export const useAddNote = (id: string) =>
  useOrgMutation(id, (body: string) => operatorApi.post(`/orgs/${id}/notes`, { body }), 'Note added', 'Failed to add note');
export const useDeleteNote = (id: string) =>
  useOrgMutation(id, (noteId: string) => operatorApi.delete(`/orgs/${id}/notes/${noteId}`), 'Note deleted', 'Failed to delete note');
export const useResendInvite = (id: string) =>
  useOrgMutation(id, (_: void) => operatorApi.post(`/orgs/${id}/onboarding/resend-invite`), 'Invitation sent', 'Failed to send invitation');
export const useChangeFirstAdmin = (id: string) =>
  useOrgMutation(id, (body: { email: string; full_name: string }) => operatorApi.patch(`/orgs/${id}/onboarding/first-admin`, body), 'First admin updated', 'Failed to update first admin');
export const useApproveTenant = (id: string) =>
  useOrgMutation(id, (connId: string) => operatorApi.post(`/orgs/${id}/identity-providers/${connId}/approve-tenant`), 'Tenant approved', 'Failed to approve');

export const useRemoveOverride = (id: string) =>
  useOrgMutation(id, ({ productKey, reason }: { productKey: string; reason: string }) =>
    operatorApi.delete(`/orgs/${id}/entitlements/${productKey}/override`, { params: { reason } }), 'Override removed', 'Failed to remove override');

/** Dry run of moving one organization to a plan (PATCH ?dry_run=true): nothing is written. */
export const useOrgPlanPreview = (id: string, planKey: string) =>
  useQuery({
    enabled: !!planKey,
    queryKey: ['operator', 'org', id, 'plan-preview', planKey],
    gcTime: 0,
    queryFn: async () => (await operatorApi.patch(`/orgs/${id}`, { plan_key: planKey }, { params: { dry_run: true } })).data.data as PlanPreview,
  });
export const useChangePlan = (id: string) =>
  useOrgMutation(id, (plan_key: string) => operatorApi.patch(`/orgs/${id}`, { plan_key }), 'Plan changed', 'Failed to change plan');

/** Organizations whose first admin has not finished onboarding (GET /onboarding), each with its stage. */
export const useOnboardingList = (params: { cursor?: string; limit?: number }) =>
  useQuery({
    queryKey: ['operator', 'onboarding', params],
    queryFn: async () => {
      const r = (await operatorApi.get('/onboarding', { params })).data;
      return { data: (r.data ?? []) as OnboardingRow[], next_cursor: (r.meta?.next_cursor ?? null) as string | null };
    },
  });

/** Resend the first-admin invitation of any organization (POST /orgs/:id/onboarding/resend-invite). */
export const useResendInviteFor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string) => (await operatorApi.post(`/orgs/${orgId}/onboarding/resend-invite`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operator'] }); toast.success('Invitation sent'); },
    onError: (e) => toast.error(errMsg(e, 'Failed to send invitation')),
  });
};

/** Read-only product catalogue (GET /products). */
export interface CatalogueProduct {
  product_key: string; name: string; status: string; category: string | null; manifest_version: number | null; icon: string | null;
  launch_url: string | null; roles: number; tenants_active: number; tenants_suspended: number; tenants_restricted: number;
}
export const useCatalogue = () =>
  useQuery({ queryKey: ['operator', 'catalogue'], queryFn: async () => ((await operatorApi.get('/products')).data.data ?? []) as CatalogueProduct[] });

// ── Platform health (Plan 4.9) ───────────────────────────────────────────────────────────────
export type HealthStateName = 'healthy' | 'degraded' | 'critical' | 'unknown';
export interface HealthComponent { component: string; state: HealthStateName; detail: string; metrics: Record<string, unknown> | null; checked_at: string | null }
export interface HealthSnapshot {
  state: HealthStateName; stale: boolean; components: HealthComponent[];
  history: { id: string; component: string; from: string; to: string; detail: string; at: string }[];
}
export interface HealthSyncRow { org_id: string; name: string | null; slug: string | null; lag: number; parked: number; last_error_code: string | null; last_applied_seq: number; pending_seq: number; updated_at: string | null }
export interface HealthSync { configured: boolean; answered: boolean; error?: string | null; rows: HealthSyncRow[]; summary: Record<string, unknown> | null; fetched_at: string | null }

export const useHealth = () =>
  useQuery({ queryKey: ['operator', 'health'], refetchInterval: 30_000, queryFn: async () => (await operatorApi.get('/health')).data.data as HealthSnapshot });
export const useHealthSync = () =>
  useQuery({ queryKey: ['operator', 'health-sync'], refetchInterval: 30_000, queryFn: async () => (await operatorApi.get('/health/sync')).data.data as HealthSync });

// ── Overview (Plan 4.10) ─────────────────────────────────────────────────────────────────────
export type OverviewBlock<T> = T | { error: true };
export interface AttentionRow { id: string; kind: string; severity: 'critical' | 'warning' | 'info'; company_id: string | null; summary: string; link: string; first_seen_at: string }
export interface Overview {
  tenants: OverviewBlock<{ total: number; active: number; trial: number; suspended: number; onboarding: number }>;
  members_active: OverviewBlock<number>;
  health: OverviewBlock<{ state: HealthStateName; components: { component: string; state: HealthStateName; detail: string }[] }>;
  attention: OverviewBlock<{ counts: { critical: number; warning: number; info: number }; top: AttentionRow[] }>;
  activity: OverviewBlock<{ id: string; operator_email: string; action: string; target_type: string; target_id: string | null; category: string; result: string; at: string }[]>;
}
export const useOverview = () =>
  useQuery({ queryKey: ['operator', 'overview'], refetchInterval: 60_000, queryFn: async () => (await operatorApi.get('/overview')).data.data as Overview });

// ── Security, operator sessions, operator invite (Plan 4.11) ─────────────────────────────────
export const OPERATOR_ROLE_OPTIONS = ['platform_admin', 'operations', 'support', 'auditor'] as const;
export interface SecuritySnapshot {
  operators_without_mfa: OverviewBlock<{ id: string; email: string; full_name: string; roles: string[] }[]>;
  failed_sign_ins: OverviewBlock<{ count: number; recent: { email: string | null; event_type: string; ip: string | null; at: string }[] }>;
  locked_accounts: OverviewBlock<{ id: string; email: string; full_name: string; locked_until: string }[]>;
  active_sessions: OverviewBlock<OperatorSessionRow[]>;
  tenants_without_mfa: OverviewBlock<{ company_id: string | null; summary: string; link: string }[]>;
  recent_role_changes: OverviewBlock<{ id: string; by: string; action: string; target_id: string | null; at: string }[]>;
}
export interface OperatorSessionRow { id: string; operator_id: string; operator_email: string | null; ip: string | null; user_agent: string | null; created_at: string; last_seen_at: string }
export interface OperatorOwnSession { id: string; ip: string | null; user_agent: string | null; created_at: string; last_seen_at: string; active: boolean; revoked_at: string | null; revoked_reason: string | null }

export const useSecurity = () =>
  useQuery({ queryKey: ['operator', 'security'], refetchInterval: 60_000, queryFn: async () => (await operatorApi.get('/security')).data.data as SecuritySnapshot });
export const useOperatorSessions = (id: string | null) =>
  useQuery({ queryKey: ['operator', 'operator-sessions', id], enabled: !!id, queryFn: async () => (await operatorApi.get(`/operators/${id}/sessions`)).data.data as OperatorOwnSession[] });
export const useRevokeOperatorSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ operatorId, sid }: { operatorId: string; sid: string }) => (await operatorApi.delete(`/operators/${operatorId}/sessions/${sid}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operator', 'operator-sessions'] }); qc.invalidateQueries({ queryKey: ['operator', 'security'] }); toast.success('Session revoked'); },
    onError: (e) => toast.error(errMsg(e, 'Failed to revoke the session')),
  });
};
export const useInviteOperator = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { email: string; full_name: string; roles: string[] }) => (await operatorApi.post('/operators/invite', body)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operator', 'operators'] }); toast.success('Invitation sent'); },
    onError: (e) => toast.error(errMsg(e, 'Failed to send the invitation')),
  });
};
