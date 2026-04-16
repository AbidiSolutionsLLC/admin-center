// src/features/teams/hooks/useUpdateTeam.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { Team, UpdateTeamInput } from '@/types';

interface UpdateTeamVariables {
  id: string;
  data: UpdateTeamInput;
}

/**
 * Updates an existing team and invalidates related queries.
 * Used on: TeamForm in TeamsPage modal (edit mode).
 */
export const useUpdateTeam = () => {
  const queryClient = useQueryClient();

  return useMutation<Team, Error, UpdateTeamVariables>({
    mutationFn: async ({ id, data }) => {
      console.log("Payload:", data);
      const { data: responseData } = await apiClient.put(`/teams/${id}`, data);
      return responseData.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TEAMS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_DETAIL(variables.id) });
      toast.success('Team updated successfully');
    },
    onError: (error) => {
      console.error('Team update failed', error);
    },
  });
};
