import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { InviteUserInput, User } from '@/types';

/**
 * Invites a single user.
 * Used on: InviteModal.
 */
export const useInviteUser = () => {
  const queryClient = useQueryClient();

  return useMutation<User, Error, InviteUserInput>({
    mutationFn: async (input: InviteUserInput) => {
      console.log("Payload:", input);
      const { data } = await apiClient.post('/people/invite', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USERS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DEPARTMENTS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORG_TREE });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DASHBOARD_STATS });
      toast.success('User invited successfully');
    },
    onError: (err: any) => {
      console.error('User invite failed', err);
    },
  });
};
