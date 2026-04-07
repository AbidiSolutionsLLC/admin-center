import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Department } from '@/types';

/**
 * Fetches all active departments for the current company.
 * Used on: OrganizationPage, DepartmentTable.
 */
export const useDepartments = () => {
  return useQuery<Department[]>({
    queryKey: QUERY_KEYS.DEPARTMENTS,
    queryFn: async () => {
      const { data } = await apiClient.get('/organization');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
