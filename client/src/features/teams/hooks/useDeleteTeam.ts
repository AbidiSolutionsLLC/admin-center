// src/features/teams/hooks/useDeleteTeam.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import axios from 'axios';

/**
 * Soft-deletes (archives) a team and invalidates related queries.
 * Used on: TeamsPage (archive confirmation dialog).
 */
export const useDeleteTeam = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiClient.delete(`/teams/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TEAMS });
      toast.success('Team archived successfully');
    },
    onError: (error) => {
      console.error('Team archive failed', error);
      if (axios.isAxiosError(error) && error.response?.data?.code === 'TEAM_HAS_ACTIVE_MEMBERS') {
        toast.error(error.response.data.error || 'Cannot archive team with active members');
      } else {
        toast.error('Failed to archive team. Please try again.');
      }
    },
  });
};
