import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export interface Group {
  _id: string;
  name: string;
  description: string;
  type: 'static' | 'dynamic';
  user_count: number;
  is_active: boolean;
}

export const useGroups = () => {
  return useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data } = await apiClient.get('/groups');
      return data.data as Group[];
    },
  });
};

export const useGroupUsers = (groupId: string) => {
  return useQuery({
    queryKey: ['groups', groupId, 'users'],
    queryFn: async () => {
      if (!groupId) return [];
      const { data } = await apiClient.get(`/groups/${groupId}/users`);
      return data.data;
    },
    enabled: !!groupId,
  });
};

export const useCreateGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; type?: 'static' | 'dynamic' }) => {
      const response = await apiClient.post('/groups', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
};

export const useUpdateGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Group> }) => {
      const response = await apiClient.put(`/groups/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
};

export const useDeleteGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete(`/groups/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
};

export const useAddUsersToGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, userIds }: { groupId: string; userIds: string[] }) => {
      const response = await apiClient.post(`/groups/${groupId}/users`, { userIds });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['groups', variables.groupId, 'users'] });
    },
  });
};

export const useRemoveUsersFromGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, userIds }: { groupId: string; userIds: string[] }) => {
      // Axios delete with body
      const response = await apiClient.delete(`/groups/${groupId}/users`, { data: { userIds } });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['groups', variables.groupId, 'users'] });
    },
  });
};
