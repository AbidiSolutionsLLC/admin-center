// src/features/teams/hooks/useTeams.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Team } from '@/types';

/**
 * Fetches teams for the current company with optional status filtering.
 * Used on: TeamsPage, TeamTable.
 */
export const useTeams = (status: 'active' | 'inactive' | 'all' = 'active') => {
  return useQuery<Team[]>({
    queryKey: [...QUERY_KEYS.TEAMS, status],
    queryFn: async () => {
      const { data } = await apiClient.get('/teams', {
        params: { status }
      });
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
