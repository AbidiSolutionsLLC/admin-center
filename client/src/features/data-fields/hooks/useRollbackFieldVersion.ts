// src/features/data-fields/hooks/useRollbackFieldVersion.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { CustomField } from '@/types';

/**
 * Rolls back a custom field to a previous version.
 * Used on: DataFieldsPage (version history dialog).
 */
export const useRollbackFieldVersion = () => {
  const queryClient = useQueryClient();

  return useMutation<CustomField, Error, { fieldId: string; version_number: number }>({
    mutationFn: async ({ fieldId, version_number }) => {
      const { data } = await apiClient.post(`/data-fields/${fieldId}/rollback`, { version_number });
      return data.data;
    },
    onSuccess: (_data, { fieldId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOM_FIELD_DETAIL(fieldId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOM_FIELD_VERSIONS(fieldId) });
      toast.success('Field rolled back to previous version');
    },
    onError: () => {
      toast.error('Failed to roll back field version. Please try again.');
    },
  });
};
