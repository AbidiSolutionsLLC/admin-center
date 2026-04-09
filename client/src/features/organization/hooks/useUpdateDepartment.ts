import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { Department, UpdateDepartmentInput } from '@/types';

/**
 * Updates an existing department and invalidates relevant queries.
 * Used on: DepartmentForm Modal.
 */
export const useUpdateDepartment = () => {
  const queryClient = useQueryClient();

  return useMutation<Department, Error, { id: string; data: UpdateDepartmentInput }>({
    mutationFn: async ({ id, data: input }) => {
      console.log("Payload:", input);
      const { data } = await apiClient.put(`/organization/${id}`, input);
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DEPARTMENTS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DEPARTMENT_DETAIL(variables.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORG_TREE });
      toast.success('Department updated successfully');
    },
    onError: (error) => {
      console.error('Department update failed', error);
      toast.error('Failed to update department. Please try again.');
    },
  });
};
