// src/features/teams/hooks/useTeams.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Team } from '@/types';

/**
 * Fetches all active teams for the current company.
 * Used on: TeamsPage, TeamTable.
 */
export const useTeams = () => {
  return useQuery<Team[]>({
    queryKey: QUERY_KEYS.TEAMS,
    queryFn: async () => {
      const { data } = await apiClient.get('/teams');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
