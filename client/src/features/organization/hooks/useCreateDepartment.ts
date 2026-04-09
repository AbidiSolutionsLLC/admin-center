import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { Department, CreateDepartmentInput } from '@/types';

/**
 * Creates a new department and invalidates relevant queries.
 * Used on: DepartmentForm Modal.
 */
export const useCreateDepartment = () => {
  const queryClient = useQueryClient();

  return useMutation<Department, Error, CreateDepartmentInput>({
    mutationFn: async (input) => {
      console.log("Payload:", input);
      const { data } = await apiClient.post('/organization', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DEPARTMENTS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORG_TREE });
      toast.success('Department created successfully');
    },
    onError: (error) => {
      console.error('Department creation failed', error);
      toast.error('Failed to create department. Please try again.');
    },
  });
};
