import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';

/**
 * Soft deletes a department and invalidates relevant queries.
 * Used on: Department Panel / List action.
 */
export const useDeleteDepartment = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/organization/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DEPARTMENTS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORG_TREE });
      toast.success('Department deleted successfully');
    },
    onError: (error) => {
      console.error('Department deletion failed', error);
    },
  });
};
