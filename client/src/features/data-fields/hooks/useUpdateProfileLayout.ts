// src/features/data-fields/hooks/useUpdateProfileLayout.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { ProfileLayout, TargetObject } from '@/types';

/**
 * Updates an existing profile layout.
 * Used on: DataFieldsPage (layout management).
 */
export const useUpdateProfileLayout = (targetObject?: TargetObject) => {
  const queryClient = useQueryClient();

  return useMutation<ProfileLayout, Error, { id: string; input: Record<string, unknown> }>({
    mutationFn: async ({ id, input }) => {
      const { data } = await apiClient.put(`/data-fields/layouts/${id}`, input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROFILE_LAYOUTS(targetObject) });
      toast.success('Profile layout updated');
    },
    onError: () => {
      toast.error('Failed to update profile layout. Please try again.');
    },
  });
};
