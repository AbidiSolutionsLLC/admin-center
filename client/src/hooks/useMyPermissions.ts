import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/useAuthStore';

interface MyPermissionsResponse {
  user_id: string;
  company_id: string;
  roles: Array<{ _id: string; name: string }>;
  permissions: Record<string, boolean>;
}

/**
 * Custom hook to fetch effective permissions and assigned roles for the currently logged-in user.
 */
export const useMyPermissions = () => {
  const userId = useAuthStore(state => state.userId);

  return useQuery<MyPermissionsResponse>({
    queryKey: ['my-permissions', userId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/auth/my-permissions`);
      return data.data;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
};

/**
 * Helper hook to quickly check if the logged-in user has a specific permission.
 * 
 * @param module - The module name (e.g. 'people', 'audit')
 * @param action - The action name (e.g. 'export', 'read')
 * @param dataScope - The data scope (e.g. 'all', 'department', 'own'). Defaults to 'all'.
 */
export const useHasPermission = (module: string, action: string, dataScope: string = 'all') => {
  const { data } = useMyPermissions();
  if (!data) return false;
  return data.permissions[`${module}:${action}:${dataScope}`] === true;
};
