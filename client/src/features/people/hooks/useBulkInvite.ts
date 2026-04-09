import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { BulkInviteInput, BulkInviteResponse } from '@/types';

/**
 * Bulk invites users from CSV data.
 * Used on: InviteModal (bulk invite tab).
 */
export const useBulkInvite = () => {
  const queryClient = useQueryClient();

  return useMutation<BulkInviteResponse, any, BulkInviteInput>({
    mutationFn: async (input: BulkInviteInput) => {
      const { data } = await apiClient.post('/people/bulk-invite', input);
      return data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USERS });
      toast.success(`Successfully processed bulk invite: ${data.successful} successful, ${data.failed} failed.`);
    },
    onError: (err: any) => {
      console.error('Bulk invite failed', err);
      const message = err.response?.data?.error || 'Failed to process bulk invite. Please try again.';
      toast.error(message);
    },
  });
};
