// client/src/features/organization/hooks/useInsights.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Insight } from '@/types';

interface UseInsightsParams {
  module?: string;
  severity?: 'critical' | 'warning' | 'info';
  affected_object_id?: string;
}

/**
 * Fetches active insights for the current company, optionally filtered.
 * Used on: OrganizationPage (intelligence banner), DepartmentTable (row warnings).
 * Company scoping handled server-side via JWT middleware.
 */
export const useInsights = (params?: UseInsightsParams) => {
  return useQuery<Insight[]>({
    queryKey: QUERY_KEYS.INSIGHTS(params),
    queryFn: async () => {
      const { data } = await apiClient.get('/intelligence', { params });
      return data.data;
    },
    staleTime: 1000 * 30, // 30 seconds - insights should be relatively fresh
    retry: 2,
  });
};
