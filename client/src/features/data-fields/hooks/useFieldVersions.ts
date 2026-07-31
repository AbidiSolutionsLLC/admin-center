// src/features/data-fields/hooks/useFieldVersions.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { CustomFieldVersion } from '@/types';

/**
 * Fetches the version history for a custom field.
 * Used on: DataFieldsPage (version history dialog).
 */
export const useFieldVersions = (fieldId: string | null) => {
  return useQuery<CustomFieldVersion[]>({
    queryKey: QUERY_KEYS.CUSTOM_FIELD_VERSIONS(fieldId!),
    queryFn: async () => {
      const { data } = await apiClient.get(`/data-fields/${fieldId}/versions`);
      return data.data;
    },
    enabled: !!fieldId,
    staleTime: 1000 * 30,
  });
};
