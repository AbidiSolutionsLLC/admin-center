// src/features/locations/hooks/useLocations.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Location } from '@/types';

/**
 * Fetches all locations for the current company.
 * Used on: PeoplePage (filter bar), UserForm (location select).
 */
export const useLocations = (filters?: { type?: string }) => {
  return useQuery<Location[]>({
    queryKey: QUERY_KEYS.LOCATIONS,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.type) params.append('type', filters.type);

      const { data } = await apiClient.get(`/locations?${params.toString()}`);
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
