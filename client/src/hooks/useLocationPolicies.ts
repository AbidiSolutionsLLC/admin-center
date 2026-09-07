// client/src/hooks/useLocationPolicies.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { locationsApi, type AssignmentRulesForm } from '@/services/locationsApi';
import { toast } from 'sonner';

export interface UseLocationPoliciesOptions {
  policyVersionId: string;
  companyId?: string;
  enabled?: boolean;
}

export const useLocationPolicies = (options: UseLocationPoliciesOptions) => {
  const queryClient = useQueryClient();

  const {
    data: assignments,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['location-policies', options.policyVersionId, options.companyId],
    queryFn: () => locationsApi.getLocationAssignments(options.policyVersionId),
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
      toast.success('Policies assigned to locations successfully');
      queryClient.invalidateQueries({
        queryKey: ['location-policies', options.policyVersionId, options.companyId],
      });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to assign policies');
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (locationId: string) => {
      await locationsApi.removeLocationAssignment(options.policyVersionId, locationId);
    },
    onSuccess: () => {
      toast.success('Policy assignment removed successfully');
      queryClient.invalidateQueries({
        queryKey: ['location-policies', options.policyVersionId, options.companyId],
      });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to remove assignment');
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