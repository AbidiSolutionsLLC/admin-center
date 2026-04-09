// src/features/integrations/hooks/useConnectIntegration.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { Integration, ConnectIntegrationInput } from '@/types';

/**
 * Connects a new integration with encrypted credential storage.
 * Used on: IntegrationsPage (connect modal).
 * Invalidates integration queries and shows toast on success.
 */
export const useConnectIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation<Integration, Error, ConnectIntegrationInput>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post('/integrations/connect', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INTEGRATIONS });
      toast.success('Integration connected successfully');
    },
    onError: (error) => {
      console.error('Integration connection failed:', error);
      toast.error('Failed to connect integration. Please check your credentials.');
    },
  });
};
