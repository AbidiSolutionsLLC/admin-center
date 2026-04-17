// src/features/people/hooks/useAssignUserOrg.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { User } from '@/types';

interface AssignUserOrgInput {
  department_id?: string | null;
  team_ids?: string[] | null;
}

interface AssignUserOrgVariables {
  userId: string;
  data: AssignUserOrgInput;
}

/**
 * Assigns a user to a department and teams in one request.
 * Invalidates user detail and users list queries.
 * Used on: UserOrgAssignmentModal.
 */
export const useAssignUserOrg = () => {
  const queryClient = useQueryClient();

  return useMutation<User, Error, AssignUserOrgVariables>({
    mutationFn: async ({ userId, data }) => {
      const { data: responseData } = await apiClient.post(`/people/${userId}/assign-org`, data);
      return responseData.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USERS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_DETAIL(variables.userId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DEPARTMENTS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORG_TREE });
      toast.success('User organization assignment updated successfully');
    },
    onError: (error) => {
      console.error('User org assignment failed', error);
    },
  });
};
