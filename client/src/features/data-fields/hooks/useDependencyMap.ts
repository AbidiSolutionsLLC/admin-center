// src/features/data-fields/hooks/useDependencyMap.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { FieldDependencyMapEntry, TargetObject } from '@/types';

/**
 * Fetches dependency counts for all fields of a given target_object.
 * Used by CustomFieldTable to show at-a-glance dependency info per field.
 */
export const useDependencyMap = (targetObject: TargetObject) => {
  return useQuery<FieldDependencyMapEntry[]>({
    queryKey: QUERY_KEYS.CUSTOM_FIELD_DEPENDENCY_MAP(targetObject),
    queryFn: async () => {
      const { data } = await apiClient.get('/data-fields/dependency-map', {
        params: { target_object: targetObject },
      });
      return data.data;
    },
    staleTime: 1000 * 60,
  });
};
