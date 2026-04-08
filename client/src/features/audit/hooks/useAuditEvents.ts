// src/features/audit/hooks/useAuditEvents.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { AuditEvent } from '@/types';

interface UseAuditEventsParams {
  page?: number;
  limit?: number;
  module?: string;
  action?: string;
  search?: string;
  actor_email?: string;
  date_from?: string;
  date_to?: string;
}

interface AuditEventsResponse {
  events: (AuditEvent & { actor_name?: string })[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Fetches audit events with pagination and filters.
 * Used on: AuditLogsPage
 */
export const useAuditEvents = (params: UseAuditEventsParams = {}) => {
  const {
    page = 1,
    limit = 50,
    module,
    action,
    search,
    actor_email,
    date_from,
    date_to,
  } = params;

  const queryKey = QUERY_KEYS.AUDIT_EVENTS({
    page,
    limit,
    module,
    action,
    search,
    actor_email,
    date_from,
    date_to,
  });

  return useQuery<AuditEventsResponse>({
    queryKey,
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.set('page', page.toString());
      searchParams.set('limit', limit.toString());
      if (module) searchParams.set('module', module);
      if (action) searchParams.set('action', action);
      if (search) searchParams.set('search', search);
      if (actor_email) searchParams.set('actor_email', actor_email);
      if (date_from) searchParams.set('date_from', date_from);
      if (date_to) searchParams.set('date_to', date_to);

      const { data } = await apiClient.get(`/audit-logs?${searchParams.toString()}`);
      return data.data;
    },
    staleTime: 1000 * 30, // 30 seconds
    retry: 2,
  });
};
