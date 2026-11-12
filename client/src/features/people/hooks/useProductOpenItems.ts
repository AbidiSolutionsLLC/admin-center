// src/features/people/hooks/useProductOpenItems.ts
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { ProductOpenItemsCounts } from '@/types';

export interface ProductOpenItemsResult {
  counts: ProductOpenItemsCounts | null;
  isUnavailable: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Hook to fetch product open items for a user prior to offboarding.
 * GET /api/v1/people/:id/product-open-items (07 §6, contract §2.1)
 * Handles 503 PRODUCTS_UNAVAILABLE gracefully as an unavailable state.
 */
export const useProductOpenItems = (userId: string, enabled = true): ProductOpenItemsResult => {
  const query = useQuery<{ counts: ProductOpenItemsCounts; isUnavailable: boolean }>({
    queryKey: QUERY_KEYS.USER_PRODUCT_OPEN_ITEMS(userId),
    queryFn: async () => {
      try {
        const { data } = await apiClient.get(`/people/${userId}/product-open-items`);
        return {
          counts: data.data.products as ProductOpenItemsCounts,
          isUnavailable: false,
        };
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          if (err.response?.status === 503 || (err.response?.data as { code?: string })?.code === 'PRODUCTS_UNAVAILABLE') {
            return {
              counts: {
                people: { pending_leave_requests: 0, pending_approvals: 0 },
                projects: { open_tasks: 0, owned_projects: 0 },
                sign: { agreements_as_sender_pending: 0, agreements_awaiting_signature: 0 },
                desk: { assigned_open_tickets: 0 },
              },
              isUnavailable: true,
            };
          }
        }
        throw err;
      }
    },
    enabled: !!userId && enabled,
    retry: 1,
    staleTime: 1000 * 30, // 30s
  });

  return {
    counts: query.data?.counts ?? null,
    isUnavailable: query.data?.isUnavailable ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
};
