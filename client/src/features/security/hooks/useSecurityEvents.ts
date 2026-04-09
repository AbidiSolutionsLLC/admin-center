// src/features/security/hooks/useSecurityEvents.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { SecurityEventsResponse } from '@/types';

interface UseSecurityEventsParams {
  page?: number;
  limit?: number;
  event_type?: string;
  is_suspicious?: boolean;
  email?: string;
}

/**
 * Fetches security events (access log) for the current company.
 * Used on: SecurityPage (AccessLogTable)
 */
export const useSecurityEvents = (params: UseSecurityEventsParams = {}) => {
  const { page = 1, limit = 50, event_type, is_suspicious, email } = params;

  const queryKey = QUERY_KEYS.SECURITY_EVENTS({
    page,
    limit,
    event_type,
    is_suspicious,
    email,
  });

  return useQuery<SecurityEventsResponse>({
    queryKey,
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.set('page', page.toString());
      searchParams.set('limit', limit.toString());
      if (event_type) searchParams.set('event_type', event_type);
      if (is_suspicious !== undefined) searchParams.set('is_suspicious', is_suspicious.toString());
      if (email) searchParams.set('email', email);

      const { data } = await apiClient.get(`/security/events?${searchParams.toString()}`);
      return data.data;
    },
    staleTime: 1000 * 30, // 30 seconds - security events should be fresh
    retry: 2,
  });
};
