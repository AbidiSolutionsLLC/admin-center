// src/features/organization/hooks/useCreateBU.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { Department, CreateDepartmentInput } from '@/types';

/**
 * Creates a new Business Unit (type locked to 'business_unit').
 * Used on: OrganizationPage (Business Units tab - create modal).
 */
export const useCreateBU = () => {
  const queryClient = useQueryClient();

  return useMutation<Department, Error, Omit<CreateDepartmentInput, 'type'>>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post('/organization', {
        ...input,
        type: 'business_unit',
      });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DEPARTMENTS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORG_TREE });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BUSINESS_UNITS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BU_TREE });
      toast.success('Business Unit created successfully');
    },
    onError: (error) => {
      console.error('BU creation failed', error);
      toast.error('Failed to create Business Unit. Please try again.');
    },
  });
};
