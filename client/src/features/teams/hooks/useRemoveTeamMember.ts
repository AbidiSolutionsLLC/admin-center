// src/features/teams/hooks/useRemoveTeamMember.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';

interface RemoveTeamMemberVariables {
  teamId: string;
  memberId: string;
}

/**
 * Removes a user from a team and invalidates related queries.
 * Used on: TeamMembersPanel (remove member confirmation).
 */
export const useRemoveTeamMember = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, RemoveTeamMemberVariables>({
    mutationFn: async ({ teamId, memberId }) => {
      await apiClient.delete(`/teams/${teamId}/members/${memberId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_MEMBERS(variables.teamId) });
      toast.success('Member removed from team successfully');
    },
    onError: (error) => {
      console.error('Remove team member failed', error);
      toast.error('Failed to remove member from team. Please try again.');
    },
  });
};
