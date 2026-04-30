import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { UpdateUserInput, User } from '@/types';

/**
 * Updates user profile information.
 * Used on: UserForm.
 */
export const useUpdateUser = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation<User, Error, UpdateUserInput>({
    mutationFn: async (input: UpdateUserInput) => {
      const { data } = await apiClient.put(`/people/${userId}`, input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USERS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_DETAIL(userId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_STATS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DEPARTMENTS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORG_TREE });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DASHBOARD_STATS });
      toast.success('User updated successfully');
    },
    onError: (error: any) => {
      console.error('User update failed', error);
      const message = error.response?.data?.message || 'Failed to update user';
      toast.error(message);
    },
  });
};
