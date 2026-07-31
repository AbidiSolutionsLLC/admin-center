// src/features/security/hooks/useActiveSessions.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { ActiveSession } from '@/types';

/**
 * Fetches all active sessions (refresh tokens) for the company.
 * Used on: SecurityPage (ActiveSessionsTable)
 */
export const useActiveSessions = (roleFilter?: 'admin') => {
  return useQuery<ActiveSession[]>({
    queryKey: roleFilter ? [...QUERY_KEYS.ACTIVE_SESSIONS, { roleFilter }] : QUERY_KEYS.ACTIVE_SESSIONS,
    queryFn: async () => {
      const url = roleFilter ? `/security/sessions?roleFilter=${roleFilter}` : '/security/sessions';
      const { data } = await apiClient.get(url);
      return data.data;
    },
    staleTime: 1000 * 30, // 30 seconds
    retry: 1,
  });
};
