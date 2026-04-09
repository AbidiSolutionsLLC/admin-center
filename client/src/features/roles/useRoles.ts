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
export const useRoles = () => {
  return useQuery({
    queryKey: QUERY_KEYS.ROLES,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Role[]>>('/roles');
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
