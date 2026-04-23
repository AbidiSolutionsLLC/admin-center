// src/features/teams/hooks/useRemoveBulkTeamMembers.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';

interface BulkRemoveParams {
  teamId: string;
  memberIds: string[];
}

export const useRemoveBulkTeamMembers = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, BulkRemoveParams>({
    mutationFn: async ({ teamId, memberIds }) => {
      await apiClient.post(`/teams/${teamId}/members/bulk-remove`, { memberIds });
    },
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TEAMS, teamId, 'members'] });
      // Also invalidate teams list since headcount might change
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TEAMS });
      toast.success('Members removed successfully');
    },
    onError: (error) => {
      console.error('Bulk removal failed', error);
      toast.error('Failed to remove members. Please try again.');
    },
  });
};
