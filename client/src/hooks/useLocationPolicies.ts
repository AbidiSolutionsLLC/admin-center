// client/src/hooks/useLocationPolicies.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { locationsApi } from '@/services/api';
import { useNotification } from './useNotification';
import type { AssignmentRulesForm } from '../services/api';

export interface UseLocationPoliciesOptions {
  policyVersionId: string;
  companyId: string;
  enabled?: boolean;
}

export const useLocationPolicies = (options: UseLocationPoliciesOptions) => {
  const queryClient = useQueryClient();
  const { showNotification } = useNotification();

  const {
    assignments,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['location-policies', options.policyVersionId, options.companyId],
    queryFn: () => locationsApi.getLocationAssignments(options.policyVersionId, options.companyId),
    enabled: options.enabled !== false,
  });

  const assignMutation = useMutation({
    mutationFn: async (locationIds: string[]) => {
      const rules: AssignmentRulesForm = {
        rules: locationIds.map((id) => ({
          target_type: 'location',
          target_id: id,
        })),
      };
      await locationsApi.assignPolicyToLocations(options.policyVersionId, rules);
    },
    onSuccess: () => {
      showNotification('Policies assigned to locations successfully', 'success');
      queryClient.invalidateQueries({
        queryKey: ['location-policies', options.policyVersionId, options.companyId],
      });
    },
    onError: (error: any) => {
      showNotification(error.message || 'Failed to assign policies', 'error');
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (locationId: string) => {
      await locationsApi.removeLocationAssignment(options.policyVersionId, locationId);
    },
    onSuccess: () => {
      showNotification('Policy assignment removed successfully', 'success');
      queryClient.invalidateQueries({
        queryKey: ['location-policies', options.policyVersionId, options.companyId],
      });
    },
    onError: (error: any) => {
      showNotification(error.message || 'Failed to remove assignment', 'error');
    },
  });

  return {
    assignments,
    isLoading,
    error,
    refetch,
    assignPolicyToLocations: assignMutation.mutateAsync,
    removeLocationAssignment: removeMutation.mutateAsync,
    isAssigning: assignMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
};