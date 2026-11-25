// E3 product-access API hooks. Contract types live here so backend shape changes are fixed in one place.
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
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
  /** 'plan' | 'operator' | 'seed'. The stored value `operator` is labelled "Override" in the UI. */
  source?: string;
  plan_key?: string | null;
  /** Overrides only: when the override falls back to the plan. */
  expires_at?: string | null;
}

/** One registry product as the tenant sees it (GET /organization/subscription `products`). */
export interface SubscriptionProduct {
  product_key: string;
  name: string;
  description: string | null;
  app_id: string;
  entitled: boolean;
  status: string | null;
  seats_limit: number | null;
  /** Last SeatUsage count: members with effective access. */
  seats_used: number;
  default_role: { key: string; name: string } | null;
  /** For a locked product: the active plans that include it. */
  included_in_plans: Array<{ key: string; name: string }>;
}

/** An assignment that explains a member's role in a product (GET /people/:id/effective-access `reasons`). */
export interface AccessReason {
  assignment_id: string;
  target_type: string;
  target_name: string;
  product_role_key: string | null;
  include_descendants: boolean | null;
}

export interface EffectiveAccess {
  member_id: string;
  authz_ver: number;
  products: Record<string, { role: string; role_name: string; granted_by: string[] }>;
  denials: Record<string, string>;
  reasons?: Record<string, AccessReason[]>;
}

/** Plain-language text for a denial code from computeEffectiveAccess. */
export const DENIAL_TEXT: Record<string, string> = {
  NO_ASSIGNMENT: 'No assignment reaches this member.',
  NO_ENTITLEMENT: 'Assigned, but the organisation has no active entitlement for this product.',
  NO_ROLE: 'Assigned, but the assignment names no usable role.',
  ORG_SUSPENDED: 'The organisation is not active.',
  MEMBER_NOT_ACTIVE: 'The member is not active.',
  IDENTITY_NOT_ACTIVE: 'The sign-in identity of the member is not active.',
};

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

/**
 * Seat counts (Apps & Access cards, Subscription page) come from `/organization/subscription`, which the server only
 * recomputes about a second after an access change. Refetch it now and once more after that delay, so the meter does
 * not keep showing the old count until a full reload.
 */
export const refreshSeatCounts = (queryClient: QueryClient) => {
  const key = ['organization', 'subscription'];
  queryClient.invalidateQueries({ queryKey: key });
  // The recompute takes longer against a remote database (about 5 s on Atlas), so refetch twice more.
  for (const ms of [1800, 5000]) setTimeout(() => queryClient.invalidateQueries({ queryKey: key }), ms);
};

export const useSubscription = () =>
  useQuery({
    queryKey: ['organization', 'subscription'],
    queryFn: async () => {
      const d = (await apiClient.get('/organization/subscription')).data.data;
      return {
        entitlements: (d?.entitlements ?? []) as Entitlement[],
        products: (d?.products ?? []) as SubscriptionProduct[],
        plan: (d?.plan ?? null) as { key: string; name: string } | null,
        trial_ends_at: (d?.trial_ends_at ?? null) as string | null,
      };
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
      refreshSeatCounts(qc);
      toast.success('Assignment updated');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update assignment'),
  });
};
