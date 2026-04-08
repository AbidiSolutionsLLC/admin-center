// src/features/teams/hooks/useCreateTeam.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { Team, CreateTeamInput } from '@/types';

/**
 * Creates a new team and invalidates related queries.
 * Used on: TeamForm in TeamsPage modal.
 */
export const useCreateTeam = () => {
  const queryClient = useQueryClient();

  return useMutation<Team, Error, CreateTeamInput>({
    mutationFn: async (input) => {
      console.log("Payload:", input);
      const { data } = await apiClient.post('/teams', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TEAMS });
      toast.success('Team created successfully');
    },
    onError: (error) => {
      console.error('Team creation failed', error);
      toast.error('Failed to create team. Please try again.');
    },
  });
};
