import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { UpdateLifecycleInput, User } from '@/types';

/**
 * Updates user lifecycle state.
 * Used on: UserTable, UserProfilePage, LifecycleStateSelector.
 */
export const useUpdateLifecycle = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation<User, Error, UpdateLifecycleInput>({
    mutationFn: async (input: UpdateLifecycleInput) => {
      const { data } = await apiClient.put(`/people/${userId}/lifecycle`, input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USERS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_DETAIL(userId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DEPARTMENTS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORG_TREE });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DASHBOARD_STATS });
      toast.success('Lifecycle state updated successfully');
    },
  });
};
