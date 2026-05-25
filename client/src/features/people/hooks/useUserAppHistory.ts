import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export interface UserAppAccessEvent {
  _id: string;
  app_id: string;
  app_info?: {
    name: string;
    slug: string;
    icon_url?: string;
  };
  target_type: string;
  target_id: string;
  target_name: string;
  granted_by: string;
  granted_at: string;
  granted_by_info?: { full_name: string; email: string };
  revoked_by?: string;
  revoked_at?: string;
  revoked_by_info?: { full_name: string; email: string };
  is_active: boolean;
  reason?: string;
}

export const useUserAppHistory = (userId: string) => {
  return useQuery<UserAppAccessEvent[]>({
    queryKey: ['userAppHistory', userId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/people/${userId}/app-history`);
      return data.data;
    },
    enabled: !!userId,
    staleTime: 1000 * 60,
  });
};
