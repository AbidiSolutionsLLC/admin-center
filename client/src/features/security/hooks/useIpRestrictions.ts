import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';

export interface IpRestriction {
  _id: string;
  label: string;
  ip_address: string;
  target_type: 'portal' | 'all_apps' | 'app';
  target_id?: string;
  subject_type: 'all_users' | 'user' | 'group' | 'role' | 'department';
  subject_id?: string;
  subject_label?: string;
  is_enabled: boolean;
  created_at: string;
}

export const useIpRestrictions = () => {
  return useQuery({
    queryKey: ['ip-restrictions'],
    queryFn: async () => {
      const { data } = await apiClient.get('/security/ip-restrictions');
      return data.data as IpRestriction[];
    },
  });
};

export const useGlobalIpRestrictionsStatus = () => {
  return useQuery({
    queryKey: ['ip-restrictions-global-status'],
    queryFn: async () => {
      const { data } = await apiClient.get('/security/ip-restrictions/global-status');
      return data.data.ip_restrictions_enabled as boolean;
    },
  });
};

export const useToggleGlobalIpRestrictions = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data } = await apiClient.put('/security/ip-restrictions/global-toggle', { enabled });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-restrictions-global-status'] });
      toast.success('IP restrictions settings updated');
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update settings');
    },
  });
};

export const useCreateIpRestriction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Partial<IpRestriction>) => {
      const { data } = await apiClient.post('/security/ip-restrictions', payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-restrictions'] });
      toast.success('IP restriction added');
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to add IP restriction');
    },
  });
};

export const useUpdateIpRestriction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<IpRestriction> & { id: string }) => {
      const { data } = await apiClient.put(`/security/ip-restrictions/${id}`, payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-restrictions'] });
      toast.success('IP restriction updated');
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update IP restriction');
    },
  });
};

export const useDeleteIpRestriction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/security/ip-restrictions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-restrictions'] });
      toast.success('IP restriction deleted');
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to delete IP restriction');
    },
  });
};
