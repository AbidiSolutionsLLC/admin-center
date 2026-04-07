import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Department } from '@/types';

/**
 * Fetches detail for a specific department.
 * Used on: DepartmentDetailPage, DepartmentPanel.
 */
export const useDepartmentDetail = (id: string, enabled: boolean = true) => {
  return useQuery<Department>({
    queryKey: QUERY_KEYS.DEPARTMENT_DETAIL(id),
    queryFn: async () => {
      const { data } = await apiClient.get(`/organization/${id}`);
      return data.data;
    },
    enabled: !!id && enabled,
    staleTime: 1000 * 60 * 5,
  });
};
