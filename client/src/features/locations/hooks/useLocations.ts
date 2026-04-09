// src/features/locations/hooks/useLocations.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Location } from '@/types';

/**
 * Fetches all locations for the current company.
 * Used on: LocationsPage, LocationTable.
 * Company scoping handled server-side via JWT middleware.
 */
export const useLocations = () => {
  return useQuery<Location[]>({
    queryKey: QUERY_KEYS.LOCATIONS,
    queryFn: async () => {
      const { data } = await apiClient.get('/locations');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
