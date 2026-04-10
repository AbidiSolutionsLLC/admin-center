// src/features/integrations/hooks/useSyncNow.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { Integration, IntegrationSyncLog } from '@/types';

interface SyncResult {
  sync_log: IntegrationSyncLog;
  integration: {
    last_sync_at: string;
    last_sync_status: string;
    last_sync_message?: string;
  };
}

/**
 * Triggers an immediate sync for an integration.
 * Used on: IntegrationsPage (Sync Now button).
 * Shows result toast with sync statistics.
 */
export const useSyncNow = () => {
  const queryClient = useQueryClient();

  return useMutation<SyncResult, Error, string>({
    mutationFn: async (id) => {
      const { data } = await apiClient.post(`/integrations/${id}/sync`);
      return data.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INTEGRATIONS });
      if (result.sync_log) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.INTEGRATION_SYNC_LOGS(result.sync_log.integration_id),
        });
      }

      if (result.integration.last_sync_status === 'success') {
        toast.success(
          `Sync completed: ${result.sync_log.records_processed} records processed, ` +
          `${result.sync_log.records_created} created, ${result.sync_log.records_updated} updated`
        );
      } else {
        toast.error(
          `Sync failed: ${result.integration.last_sync_message ?? 'Unknown error'}`,
          { duration: 5000 }
        );
      }
    },
    onError: (error) => {
      console.error('Sync failed:', error);
      toast.error('Sync failed. Please check your connection and try again.');
    },
  });
};
