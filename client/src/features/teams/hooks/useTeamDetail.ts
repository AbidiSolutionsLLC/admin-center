// src/features/teams/hooks/useTeamDetail.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Team } from '@/types';

/**
 * Fetches detail for a specific team.
 * Used on: TeamDetailPage, TeamPanel.
 */
export const useTeamDetail = (id: string, enabled: boolean = true) => {
  return useQuery<Team>({
    queryKey: QUERY_KEYS.TEAM_DETAIL(id),
    queryFn: async () => {
      const { data } = await apiClient.get(`/teams/${id}`);
      return data.data;
    },
    enabled: !!id && enabled,
    staleTime: 1000 * 60 * 5,
  });
};
