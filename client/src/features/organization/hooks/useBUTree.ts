// src/features/organization/hooks/useBUTree.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { OrgTreeNode } from '@/types';

interface BUTreeNode extends OrgTreeNode {
  dept_count: number;
  team_count: number;
  teams?: Array<{
    _id: string;
    name: string;
    slug: string;
    team_lead?: { full_name: string };
  }>;
}

/**
 * Fetches full BU hierarchy tree: BU → Departments → Teams.
 * Used on: OrganizationPage (Business Units tab - tree view).
 */
export const useBUTree = () => {
  return useQuery<BUTreeNode[]>({
    queryKey: QUERY_KEYS.BU_TREE,
    queryFn: async () => {
      const { data } = await apiClient.get('/organization/bu-tree');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
