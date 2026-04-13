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
      console.log("Payload:", input);
      const { data } = await apiClient.put(`/people/${userId}`, input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USERS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_DETAIL(userId) });
      toast.success('User updated successfully');
    },
    onError: (error) => {
      console.error('User update failed', error);
    },
  });
};
