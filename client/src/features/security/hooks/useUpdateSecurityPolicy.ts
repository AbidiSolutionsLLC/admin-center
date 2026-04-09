// src/features/security/hooks/useUpdateSecurityPolicy.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { SecurityPolicy, UpdateSecurityPolicyInput } from '@/types';

/**
 * Updates the security policy for the current company.
 * Used on: SecurityPage (SecurityPolicyForm)
 */
export const useUpdateSecurityPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<SecurityPolicy, Error, UpdateSecurityPolicyInput>({
    mutationFn: async (input) => {
      const { data } = await apiClient.put('/security/policy', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SECURITY_POLICY });
      toast.success('Security policy updated successfully');
    },
    onError: (error) => {
      console.error('Failed to update security policy', error);
      toast.error('Failed to update security policy. Please try again.');
    },
  });
};
