// src/features/audit/hooks/useAuditEventDetail.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { AuditEvent } from '@/types';

interface AuditEventDetailResponse extends AuditEvent {
  actor_name?: string;
}

/**
 * Fetches a single audit event with full before/after state.
 * Used on: AuditLogsPage (AuditEventDetail modal)
 */
export const useAuditEventDetail = (eventId: string | null) => {
  return useQuery<AuditEventDetailResponse>({
    queryKey: ['audit', 'event', eventId],
    queryFn: async () => {
      if (!eventId) throw new Error('Event ID is required');
      const { data } = await apiClient.get(`/audit-logs/${eventId}`);
      return data.data;
    },
    enabled: !!eventId,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
