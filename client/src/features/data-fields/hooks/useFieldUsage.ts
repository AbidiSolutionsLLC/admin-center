// src/features/data-fields/hooks/useFieldUsage.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { FieldUsageInfo } from '@/types';

/**
 * Fetches usage information for a custom field, including data count and dependencies.
 * Used on: CustomFieldTable (delete confirmation, dependency warnings).
 */
export const useFieldUsage = (fieldId: string | null) => {
  return useQuery<FieldUsageInfo>({
    queryKey: QUERY_KEYS.CUSTOM_FIELD_USAGE(fieldId!),
    queryFn: async () => {
      const { data } = await apiClient.get(`/data-fields/${fieldId}/usage`);
      return data.data;
    },
    enabled: !!fieldId,
    staleTime: 1000 * 60,
  });
};
