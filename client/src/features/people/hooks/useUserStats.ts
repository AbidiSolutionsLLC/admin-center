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
      // One row is enough: the first page's meta carries the counts for the whole company.
      const { data } = await apiClient.get('/people', { params: { limit: 1 } });
      const byState = data.meta?.counts_by_state as Record<string, number> | undefined;
      if (byState) {
        return {
          total: Object.values(byState).reduce((a, b) => a + b, 0),
          active: byState.active ?? 0,
          invited: byState.invited ?? 0,
          on_leave: byState.on_leave ?? 0,
          terminated: byState.terminated ?? 0,
        };
      }
      const users = data.data; // a server without paging returns every member

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
