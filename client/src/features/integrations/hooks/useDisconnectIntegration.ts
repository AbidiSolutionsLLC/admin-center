// src/features/integrations/hooks/useDisconnectIntegration.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { Integration } from '@/types';

/**
 * Disconnects an integration and wipes encrypted credentials.
 * Used on: IntegrationsPage.
 * Invalidates integration queries and shows toast on success.
 */
export const useDisconnectIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation<Integration, Error, string>({
    mutationFn: async (id) => {
      const { data } = await apiClient.post(`/integrations/${id}/disconnect`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INTEGRATIONS });
      toast.success('Integration disconnected. Credentials wiped.');
    },
    onError: (error) => {
      console.error('Integration disconnection failed:', error);
      toast.error('Failed to disconnect integration. Please try again.');
    },
  });
};
