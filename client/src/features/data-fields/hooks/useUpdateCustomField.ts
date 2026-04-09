// src/features/data-fields/hooks/useUpdateCustomField.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { CustomField, UpdateCustomFieldInput, TargetObject } from '@/types';

/**
 * Updates an existing custom field.
 * Used on: DataFieldsPage (field builder edit mode).
 * Invalidates custom field queries and shows toast on success.
 */
export const useUpdateCustomField = (targetObject?: TargetObject) => {
  const queryClient = useQueryClient();

  return useMutation<CustomField, Error, { id: string; input: UpdateCustomFieldInput }>({
    mutationFn: async ({ id, input }) => {
      const { data } = await apiClient.put(`/data-fields/${id}`, input);
      return data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOM_FIELDS(targetObject) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOM_FIELD_DETAIL(id) });
      toast.success('Custom field updated successfully');
    },
    onError: (error) => {
      console.error('Custom field update failed:', error);
      toast.error('Failed to update custom field. Please try again.');
    },
  });
};
