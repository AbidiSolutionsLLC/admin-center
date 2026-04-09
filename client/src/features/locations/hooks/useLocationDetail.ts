// src/features/locations/hooks/useLocationDetail.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Location } from '@/types';

/**
 * Fetches a single location by ID.
 * Used on: Location detail views, edit modals.
 */
export const useLocationDetail = (id: string) => {
  return useQuery<Location>({
    queryKey: QUERY_KEYS.LOCATION_DETAIL(id),
    queryFn: async () => {
      const { data } = await apiClient.get(`/locations/${id}`);
      return data.data;
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
