import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { User } from '@/types';

interface AssignUserLocationInput {
  location_id: string | null;
}

interface AssignUserLocationVariables {
  userId: string;
  data: AssignUserLocationInput;
}

export const useAssignUserLocation = () => {
  const queryClient = useQueryClient();

  return useMutation<User, Error, AssignUserLocationVariables>({
    mutationFn: async ({ userId, data }) => {
      const { data: responseData } = await apiClient.put(`/people/${userId}`, data);
      return responseData.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USERS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_DETAIL(variables.userId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_EFFECTIVE_SETTINGS(variables.userId) });
      toast.success('User location assignment updated successfully');
    },
    onError: (error: any) => {
      console.error('User location assignment failed', error);
      const message = error.response?.data?.message || 'Failed to assign location';
      toast.error(message);
    },
  });
};
