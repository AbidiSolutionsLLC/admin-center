// src/features/organization/hooks/useOrgHistory.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { AuditEvent } from '@/types';

interface UseOrgHistoryParams {
  object_type?: string;
  date_from?: string;
  date_to?: string;
}

/**
 * Fetches organization module audit events with optional filters.
 * Used on: OrganizationPage (History tab).
 */
export const useOrgHistory = (params?: UseOrgHistoryParams) => {
  return useQuery<AuditEvent[]>({
    queryKey: QUERY_KEYS.ORG_HISTORY,
    queryFn: async () => {
      const { data } = await apiClient.get('/organization/history', { params });
      return data.data;
    },
    staleTime: 1000 * 60,
    retry: 2,
    enabled: true,
  });
};
