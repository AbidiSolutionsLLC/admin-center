import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';

export interface AccessMapNode {
  _id: string;
  name: string;
  type: string;
  users: {
    _id: string;
    full_name: string;
    email: string;
    lifecycle_state: string;
    avatar_url?: string;
  }[];
  groups: {
    _id: string;
    name: string;
    type: string;
  }[];
  permissions: {
    module: string;
    actions: { action: string; data_scope: string }[];
  }[];
}

/**
 * Fetches the hierarchical access map data.
 * Used on: RolesPage (AccessMapView)
 */
export const useAccessMap = () => {
  return useQuery<AccessMapNode[]>({
    queryKey: QUERY_KEYS.ACCESS_MAP,
    queryFn: async () => {
      const { data } = await apiClient.get('/roles/access-map');
      return data.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });
};
