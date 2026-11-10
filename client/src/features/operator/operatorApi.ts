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

const errMsg = (e: any, fallback: string) => e?.response?.data?.error || e?.response?.data?.message || fallback;

export interface OrgEntitlement { product_key: string; status: string; seats_limit?: number | null }
export interface OperatorOrg {
  id: string; slug: string; name: string; status: string; members_count?: number;
  entitlements?: OrgEntitlement[]; last_activity?: string | null; created_at?: string; plan_key?: string;
}
export interface Plan { id?: string; _id?: string; key: string; name: string; products: string[] }
export interface OperatorUser { id?: string; _id?: string; email: string; full_name?: string; roles?: string[]; status: string; mfa_enabled?: boolean; last_login_at?: string | null; created_at?: string }
export interface AuditEntry { id?: string; _id?: string; action: string; actor?: string; actor_email?: string; target?: string; target_type?: string; created_at?: string; [k: string]: unknown }

const idOf = <T extends { id?: string; _id?: string }>(x: T) => (x.id ?? x._id) as string;
export { idOf };

export const useOrgs = (params: { search?: string; status?: string; cursor?: string; limit?: number }) =>
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operator', 'orgs'] }); toast.success('Organization updated'); },
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

export const useSetEntitlement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, productKey, status, seats_limit }: { orgId: string; productKey: string; status: string; seats_limit?: number }) =>
      (await operatorApi.put(`/orgs/${orgId}/entitlements/${productKey}`, { status, seats_limit })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operator', 'orgs'] }); toast.success('Entitlement updated'); },
    onError: (e) => toast.error(errMsg(e, 'Failed to update entitlement')),
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

export const useOperators = () =>
  useQuery({
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

export const useOperatorAudit = (params: { cursor?: string; limit?: number; action?: string; company_id?: string }) =>
  useQuery({
    queryKey: ['operator', 'audit', params],
    queryFn: async () => {
      const r = (await operatorApi.get('/audit', { params })).data;
      return { data: (r.data ?? []) as AuditEntry[], next_cursor: (r.meta?.next_cursor ?? null) as string | null };
    },
  });
