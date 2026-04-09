// src/features/security/hooks/useSecurityPolicy.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { SecurityPolicy } from '@/types';

/**
 * Fetches the security policy for the current company.
 * Used on: SecurityPage
 */
export const useSecurityPolicy = () => {
  return useQuery<SecurityPolicy>({
    queryKey: QUERY_KEYS.SECURITY_POLICY,
    queryFn: async () => {
      const { data } = await apiClient.get('/security/policy');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
