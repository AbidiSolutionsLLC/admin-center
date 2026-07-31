// src/features/data-fields/hooks/useDeleteProfileLayout.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { TargetObject } from '@/types';

/**
 * Deletes a profile layout.
 * Used on: DataFieldsPage.
 */
export const useDeleteProfileLayout = (targetObject?: TargetObject) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiClient.delete(`/data-fields/layouts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROFILE_LAYOUTS(targetObject) });
      toast.success('Profile layout deleted');
    },
    onError: () => {
      toast.error('Failed to delete profile layout. Please try again.');
    },
  });
};
