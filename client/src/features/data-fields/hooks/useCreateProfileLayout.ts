// src/features/data-fields/hooks/useCreateProfileLayout.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { ProfileLayout, CreateProfileLayoutInput, TargetObject } from '@/types';

/**
 * Creates a new profile layout for role-based field visibility.
 * Used on: DataFieldsPage.
 */
export const useCreateProfileLayout = (targetObject?: TargetObject) => {
  const queryClient = useQueryClient();

  return useMutation<ProfileLayout, Error, CreateProfileLayoutInput>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post('/data-fields/layouts', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROFILE_LAYOUTS(targetObject) });
      toast.success('Profile layout created');
    },
    onError: () => {
      toast.error('Failed to create profile layout. Please try again.');
    },
  });
};
