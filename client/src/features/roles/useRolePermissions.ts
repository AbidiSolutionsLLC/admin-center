// client/src/features/roles/useRolePermissions.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Permission, ResolvedPermission, PermissionUpdate } from '@/types';
import { toast } from 'sonner';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/**
 * Fetch all available permissions (for building the permission matrix)
 */
export const useAllPermissions = () => {
  return useQuery({
    queryKey: QUERY_KEYS.ALL_PERMISSIONS,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Permission[]>>('/roles/permissions/all');
      return response.data.data;
    },
  });
};

/**
 * Fetch permissions for a specific role
 */
export const useRolePermissions = (roleId: string) => {
  return useQuery({
    queryKey: QUERY_KEYS.ROLE_PERMISSIONS(roleId),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ResolvedPermission[]>>(
        `/roles/${roleId}/permissions`
      );
      return response.data.data;
    },
    enabled: !!roleId,
  });
};

/**
 * Batch update role permissions
 */
export const useUpdateRolePermissions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      roleId,
      permissions,
    }: {
      roleId: string;
      permissions: PermissionUpdate[];
    }) => {
      const response = await apiClient.put(`/roles/${roleId}/permissions`, {
        permissions,
      });
      return response.data.data;
    },
    onSuccess: (_, { roleId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ROLE_PERMISSIONS(roleId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ROLES });
      toast.success('Permissions updated successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to update permissions';
      toast.error(message);
    },
  });
};
