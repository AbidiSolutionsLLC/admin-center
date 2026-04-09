// src/features/teams/hooks/useTeamMembers.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { TeamMember } from '@/types';

/**
 * Fetches all members of a specific team.
 * Used on: TeamMembersTable, TeamDetailPage.
 */
export const useTeamMembers = (id: string, enabled: boolean = true) => {
  return useQuery<TeamMember[]>({
    queryKey: QUERY_KEYS.TEAM_MEMBERS(id),
    queryFn: async () => {
      const { data } = await apiClient.get(`/teams/${id}/members`);
      return data.data;
    },
    enabled: !!id && enabled,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
