// src/features/data-fields/hooks/useReorderCustomFields.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { TargetObject } from '@/types';

/**
 * Reorders custom fields by updating display_order for multiple fields.
 * Used for drag-to-reorder functionality in DataFieldsPage.
 * Invalidates custom field queries and shows toast on success.
 */
export const useReorderCustomFields = (targetObject?: TargetObject) => {
  const queryClient = useQueryClient();

  return useMutation<{ reordered_count: number }, Error, string[]>({
    mutationFn: async (field_ids) => {
      const { data } = await apiClient.put('/data-fields/reorder', { field_ids });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOM_FIELDS(targetObject) });
      toast.success('Field order updated successfully');
    },
    onError: (error) => {
      console.error('Field reorder failed:', error);
      toast.error('Failed to reorder fields. Please try again.');
    },
  });
};
