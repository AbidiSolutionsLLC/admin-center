// src/features/data-fields/hooks/useCreateCustomField.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { CustomField, CreateCustomFieldInput, TargetObject } from '@/types';

/**
 * Creates a new custom field.
 * Used on: DataFieldsPage (field builder).
 * Invalidates custom field queries and shows toast on success.
 */
export const useCreateCustomField = (targetObject?: TargetObject) => {
  const queryClient = useQueryClient();

  return useMutation<CustomField, Error, CreateCustomFieldInput>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post('/data-fields', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOM_FIELDS(targetObject) });
      toast.success('Custom field created successfully');
    },
    onError: (error) => {
      console.error('Custom field creation failed:', error);
      toast.error('Failed to create custom field. Please try again.');
    },
  });
};
