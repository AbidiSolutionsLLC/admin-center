// client/src/features/roles/useRoles.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Role, CreateRoleInput, UpdateRoleInput } from '@/types';
import { toast } from 'sonner';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/**
 * Fetch all roles for the current company
 */
export const useRoles = (search?: string) => {
  return useQuery({
    queryKey: [...QUERY_KEYS.ROLES, search],
    queryFn: async () => {
      const params = search ? { search } : {};
      const response = await apiClient.get<ApiResponse<Role[]>>('/roles', { params });
      return response.data.data;
    },
  });
};


/**
 * Fetch a single role by ID with its permissions
 */
export const useRole = (roleId: string) => {
  return useQuery({
    queryKey: QUERY_KEYS.ROLE_DETAIL(roleId),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Role>>(`/roles/${roleId}`);
      return response.data.data;
    },
    enabled: !!roleId,
  });
};

/**
 * Create a new role
 */
export const useCreateRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateRoleInput) => {
      const response = await apiClient.post<ApiResponse<Role>>('/roles', data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ROLES });
      toast.success('Role created successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to create role';
      toast.error(message);
    },
  });
};

/**
 * Update an existing role
 */
export const useUpdateRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateRoleInput }) => {
      const response = await apiClient.put<ApiResponse<Role>>(`/roles/${id}`, data);
      return response.data.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ROLES });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ROLE_DETAIL(id) });
      toast.success('Role updated successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to update role';
      toast.error(message);
    },
  });
};

/**
 * Delete a role (blocked if users are assigned)
 */
export const useDeleteRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete(`/roles/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ROLES });
      toast.success('Role deleted successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to delete role';
      toast.error(message);
    },
  });
};
/**
 * Fetch all users assigned to a specific role
 */
export const useRoleUsers = (roleId: string) => {
  return useQuery({
    queryKey: QUERY_KEYS.ROLE_USERS(roleId),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<any[]>>(`/roles/${roleId}/users`);
      return response.data.data;
    },
    enabled: !!roleId,
  });
};

/**
 * Assign a user to a role
 */
export const useAssignRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, userId }: { roleId: string; userId: string }) => {
      console.log('DEBUG: Assigning role', { roleId, userId });
      const response = await apiClient.post(`/roles/${roleId}/users`, { user_id: userId });
      return response.data;
    },
    onSuccess: (_, { roleId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ROLE_USERS(roleId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ROLES });
      toast.success('User assigned to role');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to assign role';
      toast.error(message);
    },
  });
};

/**
 * Unassign a user from a role
 */
export const useUnassignRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, userId }: { roleId: string; userId: string }) => {
      const response = await apiClient.delete(`/roles/${roleId}/users/${userId}`);
      return response.data;
    },
    onSuccess: (_, { roleId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ROLE_USERS(roleId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ROLES });
      toast.success('User unassigned from role');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to unassign role';
      toast.error(message);
    },
  });
};

/**
 * Simulate permissions for a user with hypothetical roles
 */
export const useSimulatePermissions = () => {
  return useMutation({
    mutationFn: async ({ userId, hypotheticalRoleIds }: { userId: string; hypotheticalRoleIds: string[] }) => {
      const response = await apiClient.post(`/roles/simulate-permissions?user_id=${userId}`, {
        hypothetical_role_ids: hypotheticalRoleIds,
      });
      return response.data.data;
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to simulate permissions';
      toast.error(message);
    },
  });
};
