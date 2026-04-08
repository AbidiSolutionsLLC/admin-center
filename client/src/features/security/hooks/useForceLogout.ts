// src/features/security/hooks/useForceLogout.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';

interface ForceLogoutResult {
  userId: string;
}

/**
 * Force logs out a user by invalidating their refresh token.
 * Used on: SecurityPage (AccessLogTable)
 */
export const useForceLogout = () => {
  const queryClient = useQueryClient();

  return useMutation<ForceLogoutResult, Error, string>({
    mutationFn: async (userId: string) => {
      const { data } = await apiClient.post(`/security/force-logout/${userId}`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SECURITY_EVENTS() });
      toast.success('User has been logged out successfully');
    },
    onError: (error) => {
      logger.error('Failed to force logout user', { error });
      toast.error('Failed to log out user. Please try again.');
    },
  });
};
