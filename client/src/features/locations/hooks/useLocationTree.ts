// src/features/locations/hooks/useLocationTree.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { LocationTreeNode } from '@/types';

/**
 * Fetches the location hierarchy as a nested tree.
 * Used on: LocationsPage (tree view), LocationHierarchy component.
 */
export const useLocationTree = () => {
  return useQuery<LocationTreeNode[]>({
    queryKey: QUERY_KEYS.LOCATION_TREE,
    queryFn: async () => {
      const { data } = await apiClient.get('/locations/tree');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
