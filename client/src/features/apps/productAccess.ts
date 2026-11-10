// E3 product-access API hooks. Contract types live here so backend shape changes are fixed in one place.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';

export interface ProductRole {
  key: string;
  name: string;
  rank: number;
  is_default: boolean;
  assignable: boolean;
}

export interface Entitlement {
  product_key: string;
  status: string;
  seats_limit?: number | null;
}

export interface EffectiveAccess {
  member_id: string;
  authz_ver: number;
  products: Record<string, { role: string; role_name: string; granted_by: string[] }>;
  denials: Record<string, string>;
}

// Server field is `app_type` (App.model); `type` kept as a fallback for older payloads.
export const isProductApp = (app?: { app_type?: string; type?: string } | null) =>
  (app?.app_type ?? app?.type) === 'karbexa_product';
export const appProductKey = (app?: { product_key?: string; slug?: string } | null) => app?.product_key || app?.slug || '';
export const isEntitled = (entitlements: Entitlement[] | undefined, productKey: string) =>
  !!entitlements?.some((e) => e.product_key === productKey && e.status === 'active');

export const useAppRoles = (appId: string, enabled = true) =>
  useQuery({
    queryKey: ['app', 'roles', appId],
    queryFn: async () => (await apiClient.get<{ data: ProductRole[] }>(`/apps/${appId}/roles`)).data.data,
    enabled: !!appId && enabled,
  });

export const useSubscription = () =>
  useQuery({
    queryKey: ['organization', 'subscription'],
    queryFn: async () => {
      const d = (await apiClient.get('/organization/subscription')).data.data;
      return { entitlements: (d?.entitlements ?? []) as Entitlement[] };
    },
    staleTime: 60_000,
  });

export const useEffectiveAccess = (memberId: string) =>
  useQuery({
    queryKey: ['people', 'effective-access', memberId],
    queryFn: async () => (await apiClient.get<{ data: EffectiveAccess }>(`/people/${memberId}/effective-access`)).data.data,
    enabled: !!memberId,
  });

export const useUpdateAssignment = (appId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ assignmentId, data }: { assignmentId: string; data: { product_role_key?: string; include_descendants?: boolean; is_active?: boolean } }) =>
      (await apiClient.patch(`/apps/assignments/${assignmentId}`, data)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.APP_DETAIL(appId) });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.APP_TIMELINE(appId) });
      qc.invalidateQueries({ queryKey: ['people', 'effective-access'] });
      toast.success('Assignment updated');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update assignment'),
  });
};
