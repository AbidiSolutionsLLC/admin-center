import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { InviteUserInput, User } from '@/types';

/**
 * Invites a single user.
 * Used on: InviteModal.
 */
export const useInviteUser = () => {
  const queryClient = useQueryClient();

  return useMutation<User, Error, InviteUserInput>({
    mutationFn: async (input: InviteUserInput) => {
      const { data } = await apiClient.post('/people/invite', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USERS });
    },
  });
};
