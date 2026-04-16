// src/features/teams/hooks/useAddTeamMember.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { TeamMember, AddTeamMemberInput } from '@/types';

interface AddTeamMemberVariables {
  teamId: string;
  data: AddTeamMemberInput;
}

/**
 * Adds a user to a team and invalidates related queries.
 * Used on: TeamMembersPanel (add member form).
 */
export const useAddTeamMember = () => {
  const queryClient = useQueryClient();

  return useMutation<TeamMember, Error, AddTeamMemberVariables>({
    mutationFn: async ({ teamId, data }) => {
      const { data: responseData } = await apiClient.post(`/teams/${teamId}/members`, data);
      return responseData.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_MEMBERS(variables.teamId) });
      toast.success('Member added to team successfully');
    },
    onError: (error) => {
      console.error('Add team member failed', error);
    },
  });
};
