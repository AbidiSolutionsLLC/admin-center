import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { OrgTreeNode } from '@/types';

/**
 * Fetches hierarchical organization tree.
 * Used on: OrgChartView.
 */
export const useOrgTree = () => {
  return useQuery<OrgTreeNode[]>({
    queryKey: QUERY_KEYS.ORG_TREE,
    queryFn: async () => {
      const { data } = await apiClient.get('/organization/tree');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};
