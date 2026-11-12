// src/features/people/hooks/useResetMfa.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';

/**
 * Hook to reset multi-factor authentication for a user.
 * POST /api/v1/people/:id/mfa-reset (03 §4.4, A3-4, A2-6)
 * Available only to it_admin and super_admin with role hierarchy enforcement.
 */
export const useResetMfa = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(`/people/${userId}/mfa-reset`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_DETAIL(userId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USERS });
      toast.success(
        data?.message || 'MFA reset successfully. The member must re-enrol at next login.'
      );
    },
    onError: (error: unknown) => {
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data as { code?: string; message?: string; error?: string } | undefined;
        const code = errorData?.code;
        const msg = errorData?.message || errorData?.error;
        if (code === 'ROLE_HIERARCHY_VIOLATION') {
          toast.error('You cannot reset MFA for a user with higher privileges than yours.');
          return;
        }
        toast.error(msg || 'Failed to reset MFA');
        return;
      }
      toast.error('Failed to reset MFA');
    },
  });
};
