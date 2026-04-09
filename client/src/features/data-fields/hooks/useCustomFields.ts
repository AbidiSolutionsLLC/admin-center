// src/features/data-fields/hooks/useCustomFields.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { CustomField, TargetObject } from '@/types';

/**
 * Fetches all custom fields for the current company, optionally filtered by target_object.
 * Used on: DataFieldsPage, dynamic form builders.
 * Company scoping handled server-side via JWT middleware.
 */
export const useCustomFields = (targetObject?: TargetObject) => {
  return useQuery<CustomField[]>({
    queryKey: QUERY_KEYS.CUSTOM_FIELDS(targetObject),
    queryFn: async () => {
      const params = targetObject ? { target_object: targetObject } : {};
      const { data } = await apiClient.get('/data-fields', { params });
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
