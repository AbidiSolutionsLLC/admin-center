// src/features/integrations/hooks/useSyncLogs.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { IntegrationSyncLog } from '@/types';

/**
 * Fetches sync logs for a specific integration.
 * Used on: IntegrationsPage (sync log viewer).
 */
export const useSyncLogs = (integrationId: string, limit: number = 50) => {
  return useQuery<{
    logs: IntegrationSyncLog[];
    pagination: { limit: number; page: number; total: number; totalPages: number };
  }>({
    queryKey: QUERY_KEYS.INTEGRATION_SYNC_LOGS(integrationId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/integrations/${integrationId}/sync-logs`, {
        params: { limit },
      });
      return data.data;
    },
    enabled: !!integrationId,
    staleTime: 1000 * 60,
    retry: 2,
  });
};
