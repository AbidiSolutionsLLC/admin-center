// src/features/data-fields/hooks/useDeleteCustomField.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { CustomField, TargetObject } from '@/types';

/**
 * Deletes (deactivates) a custom field.
 * Used on: DataFieldsPage.
 * Invalidates custom field queries and shows toast on success.
 */
export const useDeleteCustomField = (targetObject?: TargetObject) => {
  const queryClient = useQueryClient();

  return useMutation<CustomField, Error, string>({
    mutationFn: async (id) => {
      const { data } = await apiClient.delete(`/data-fields/${id}`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOM_FIELDS(targetObject) });
      toast.success('Custom field deleted successfully');
    },
    onError: (error) => {
      console.error('Custom field deletion failed:', error);
      toast.error('Failed to delete custom field. Please try again.');
    },
  });
};
