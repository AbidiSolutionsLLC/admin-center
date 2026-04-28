import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';

export interface AuditEvent {
  _id: string;
  actor_id: {
    _id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
  };
  actor_email: string;
  action: string;
  module: string;
  object_type: string;
  object_id: string;
  object_label: string;
  before_state: Record<string, any> | null;
  after_state: Record<string, any> | null;
  ip_address: string;
  created_at: string;
}

/**
 * Fetches the audit history for a specific user.
 */
export const useUserHistory = (userId: string) => {
  return useQuery<AuditEvent[]>({
    queryKey: QUERY_KEYS.USER_HISTORY(userId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/people/${userId}/history`);
      return data.data;
    },
    enabled: !!userId,
    staleTime: 1000 * 60, // 1 minute
  });
};
