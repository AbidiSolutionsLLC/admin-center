import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';

export const useResendInvite = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (userId) => {
      await apiClient.post(`/people/${userId}/resend-invite`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USERS });
      toast.success('Invitation resent successfully');
    },
    onError: (error: unknown) => {
      console.error('Resend invite failed', error);
      toast.error('Failed to resend invite');
    },
  });
};
