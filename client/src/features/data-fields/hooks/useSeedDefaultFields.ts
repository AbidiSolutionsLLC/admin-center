// src/features/data-fields/hooks/useSeedDefaultFields.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { TargetObject } from '@/types';

/**
 * Seeds system default fields for a target object.
 * Used on: DataFieldsPage (empty state / setup).
 */
export const useSeedDefaultFields = () => {
  const queryClient = useQueryClient();

  return useMutation<{ created_count: number; skipped_count: number }, Error, TargetObject>({
    mutationFn: async (targetObject) => {
      const { data } = await apiClient.post('/data-fields/seed-defaults', { target_object: targetObject });
      return data.data;
    },
    onSuccess: (result, targetObject) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOM_FIELDS(targetObject) });
      toast.success(`Seeded ${result.created_count} default field${result.created_count !== 1 ? 's' : ''}`);
    },
    onError: () => {
      toast.error('Failed to seed default fields. Please try again.');
    },
  });
};
