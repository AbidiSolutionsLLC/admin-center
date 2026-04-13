// src/features/integrations/hooks/useUpdateFieldMapping.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { Integration } from '@/types';

/**
 * Updates field mapping for an integration.
 * Used on: IntegrationsPage (Field Mapping tab in config modal).
 * Invalidates integration queries to reflect updated mappings.
 */
export const useUpdateFieldMapping = () => {
  const queryClient = useQueryClient();

  return useMutation<Integration, Error, { id: string; field_mapping: Record<string, string> }>({
    mutationFn: async ({ id, field_mapping }) => {
      const { data } = await apiClient.put(`/integrations/${id}/field-mapping`, { field_mapping });
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INTEGRATIONS });
      toast.success('Field mapping updated successfully');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to update field mapping';
      toast.error(message);
    },
  });
};
