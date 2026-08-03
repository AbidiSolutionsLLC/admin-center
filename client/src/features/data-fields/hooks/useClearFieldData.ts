// src/features/data-fields/hooks/useClearFieldData.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';

/**
 * Clears all data stored for a custom field across records of the target object type.
 * Used before deletion when a field has existing data that must be removed first.
 */
export const useClearFieldData = () => {
  const queryClient = useQueryClient();

  return useMutation<{ cleared_count: number }, Error, string>({
    mutationFn: async (fieldId) => {
      const { data } = await apiClient.post(`/data-fields/${fieldId}/clear-data`);
      return data.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOM_FIELDS() });
      toast.success(`Cleared data from ${result.cleared_count} record${result.cleared_count !== 1 ? 's' : ''}`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to clear field data. Please try again.';
      toast.error(message);
    },
  });
};
