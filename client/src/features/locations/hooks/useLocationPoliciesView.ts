import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';

export const useLocationPoliciesView = (locationId: string | undefined) => {
  return useQuery({
    queryKey: QUERY_KEYS.LOCATION_POLICIES(locationId!),
    queryFn: async () => {
      const { data } = await apiClient.get(`/locations/${locationId}/policies`);
      return data.data;
    },
    enabled: !!locationId,
    staleTime: 1000 * 60 * 2,
  });
};

export const useLocationEffectiveSettings = (locationId: string | undefined) => {
  return useQuery({
    queryKey: QUERY_KEYS.LOCATION_EFFECTIVE_SETTINGS(locationId!),
    queryFn: async () => {
      const { data } = await apiClient.get(`/locations/${locationId}/effective-settings`);
      return data.data;
    },
    enabled: !!locationId,
    staleTime: 1000 * 60 * 2,
  });
};

export const useAssignPolicyToLocation = (locationId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (policyVersionId: string) => {
      await apiClient.post(`/locations/${locationId}/assign-policy`, { policy_version_id: policyVersionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LOCATION_POLICIES(locationId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LOCATION_EFFECTIVE_SETTINGS(locationId) });
      toast.success('Policy assigned to location');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to assign policy');
    },
  });
};

export const useRemovePolicyFromLocation = (locationId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (policyVersionId: string) => {
      await apiClient.delete(`/locations/${locationId}/policies/${policyVersionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LOCATION_POLICIES(locationId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LOCATION_EFFECTIVE_SETTINGS(locationId) });
      toast.success('Policy removed from location');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to remove policy');
    },
  });
};
