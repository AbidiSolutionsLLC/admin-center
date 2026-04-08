// src/features/organization/hooks/useDeleteBU.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import axios from 'axios';

/**
 * Deletes (archives) a Business Unit.
 * Blocked if BU has child departments (409).
 * Used on: OrganizationPage (Business Units tab).
 */
export const useDeleteBU = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiClient.delete(`/organization/business-units/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BUSINESS_UNITS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BU_TREE });
      toast.success('Business Unit archived successfully');
    },
    onError: (error) => {
      console.error('BU archive failed', error);
      if (axios.isAxiosError(error) && error.response?.data?.code === 'BU_HAS_CHILD_DEPARTMENTS') {
        toast.error(error.response.data.error || 'Cannot archive Business Unit with child departments');
      } else {
        toast.error('Failed to archive Business Unit. Please try again.');
      }
    },
  });
};
