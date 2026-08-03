// src/features/data-fields/hooks/useFieldDependents.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { FieldDependentsInfo } from '@/types';

/**
 * Fetches all fields that depend on the given custom field (reverse dependency lookup).
 * Used on: CustomFieldTable (delete confirmation, dependency warnings).
 * Company scoping handled server-side via JWT middleware.
 */
export const useFieldDependents = (fieldId: string | null) => {
  return useQuery<FieldDependentsInfo>({
    queryKey: QUERY_KEYS.CUSTOM_FIELD_DEPENDENTS(fieldId!),
    queryFn: async () => {
      const { data } = await apiClient.get(`/data-fields/${fieldId}/dependents`);
      return data.data;
    },
    enabled: !!fieldId,
    staleTime: 1000 * 60,
  });
};
