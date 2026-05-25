import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

interface EffectivePermissionsResponse {
  user_id: string;
  company_id: string;
  roles: Array<{ _id: string; name: string }>;
  permissions: Record<string, boolean>;
}

/**
 * Custom hook to fetch effective permissions and assigned roles for a single user by ID.
 */
export const useUserEffectivePermissions = (userId: string) => {
  return useQuery<EffectivePermissionsResponse>({
    queryKey: ['user-effective-permissions', userId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/people/${userId}/effective-permissions`);
      return data.data;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });
};
