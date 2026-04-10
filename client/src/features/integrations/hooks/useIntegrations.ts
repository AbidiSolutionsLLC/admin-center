// src/features/integrations/hooks/useIntegrations.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Integration } from '@/types';

/**
 * Fetches all integrations for the current company.
 * Used on: IntegrationsPage.
 * Company scoping handled server-side via JWT middleware.
 * Credentials are never returned in the response.
 */
export const useIntegrations = () => {
  return useQuery<Integration[]>({
    queryKey: QUERY_KEYS.INTEGRATIONS,
    queryFn: async () => {
      const { data } = await apiClient.get('/integrations');
      return data.data;
    },
    staleTime: 1000 * 60 * 2,
    retry: 2,
  });
};
