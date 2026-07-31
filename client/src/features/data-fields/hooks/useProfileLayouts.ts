// src/features/data-fields/hooks/useProfileLayouts.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { ProfileLayout, TargetObject } from '@/types';

/**
 * Fetches all profile layouts for the company, optionally filtered by target_object.
 * Used on: DataFieldsPage (layout management tab).
 */
export const useProfileLayouts = (targetObject?: TargetObject) => {
  return useQuery<ProfileLayout[]>({
    queryKey: QUERY_KEYS.PROFILE_LAYOUTS(targetObject),
    queryFn: async () => {
      const params = targetObject ? { target_object: targetObject } : {};
      const { data } = await apiClient.get('/data-fields/layouts', { params });
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
