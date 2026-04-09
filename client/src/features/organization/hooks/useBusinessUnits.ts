// src/features/organization/hooks/useBusinessUnits.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Department } from '@/types';

interface BusinessUnitWithCounts extends Department {
  dept_count: number;
  team_count: number;
}

/**
 * Fetches all Business Units with department and team counts.
 * Used on: OrganizationPage (Business Units tab).
 */
export const useBusinessUnits = () => {
  return useQuery<BusinessUnitWithCounts[]>({
    queryKey: QUERY_KEYS.BUSINESS_UNITS,
    queryFn: async () => {
      const { data } = await apiClient.get('/organization/business-units');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
