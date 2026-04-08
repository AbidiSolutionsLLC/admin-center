// src/features/people/hooks/useUserStats.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';

export interface UserStats {
  total: number;
  active: number;
  invited: number;
  on_leave: number;
  terminated: number;
}

/**
 * Fetches live user statistics for the People page stats row.
 * Returns counts for total, active, invited, on_leave, and terminated users.
 * Used on: PeoplePage.
 */
export const useUserStats = () => {
  return useQuery<UserStats>({
    queryKey: QUERY_KEYS.USER_STATS,
    queryFn: async () => {
      const { data } = await apiClient.get('/people');
      const users = data.data;

      const stats: UserStats = {
        total: users.length,
        active: users.filter((u: any) => u.lifecycle_state === 'active').length,
        invited: users.filter((u: any) => u.lifecycle_state === 'invited').length,
        on_leave: users.filter((u: any) => u.lifecycle_state === 'on_leave').length,
        terminated: users.filter((u: any) => u.lifecycle_state === 'terminated').length,
      };

      return stats;
    },
    staleTime: 1000 * 60 * 1,
    retry: 2,
  });
};
