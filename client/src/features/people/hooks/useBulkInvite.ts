import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { BulkInviteInput, BulkInviteResponse } from '@/types';

/**
 * Bulk invites users from CSV data.
 * Used on: InviteModal (bulk invite tab).
 */
export const useBulkInvite = () => {
  const queryClient = useQueryClient();

  return useMutation<BulkInviteResponse, Error, BulkInviteInput>({
    mutationFn: async (input: BulkInviteInput) => {
      const { data } = await apiClient.post('/people/invite-bulk', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USERS });
    },
  });
};
