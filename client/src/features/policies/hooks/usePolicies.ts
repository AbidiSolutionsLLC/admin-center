// src/features/policies/hooks/usePolicies.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type {
  PolicyVersion,
  PublishPolicyInput,
  PolicyAcknowledgment,
  AcknowledgmentStatus,
} from '@/types';

/**
 * Fetches all policies (latest version per policy_key) for the current company.
 * Used on: PoliciesPage
 */
export const usePolicies = (filters?: { category?: string; status?: string }) => {
  return useQuery<PolicyVersion[]>({
    queryKey: QUERY_KEYS.POLICIES,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.category) params.append('category', filters.category);
      if (filters?.status) params.append('status', filters.status);

      const { data } = await apiClient.get(`/policies?${params.toString()}`);
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};

/**
 * Fetches all versions of a specific policy by policy_key.
 * Used on: PoliciesPage (version history view)
 */
export const usePolicyVersions = (policyKey: string) => {
  return useQuery<PolicyVersion[]>({
    queryKey: QUERY_KEYS.POLICY_VERSIONS(policyKey),
    queryFn: async () => {
      const { data } = await apiClient.get(`/policies/versions?policy_key=${policyKey}`);
      return data.data;
    },
    enabled: !!policyKey,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};

/**
 * Fetches a specific policy version by ID.
 * Used on: PoliciesPage (detail view)
 */
export const usePolicyDetail = (policyId: string) => {
  return useQuery<PolicyVersion>({
    queryKey: QUERY_KEYS.POLICY_DETAIL(policyId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/policies/${policyId}`);
      return data.data;
    },
    enabled: !!policyId,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};

/**
 * Publishes a new policy version (increments version number automatically).
 * Produces audit event: policy.published
 * Used on: PoliciesPage (publish modal)
 */
export const usePublishPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<PolicyVersion, Error, PublishPolicyInput>({
    mutationFn: async (input: PublishPolicyInput) => {
      const { data } = await apiClient.post('/policies/publish', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.POLICIES });
      toast.success('Policy published successfully');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to publish policy';
      toast.error(message);
    },
  });
};

/**
 * Acknowledges a policy version on behalf of the current user.
 * Used on: PoliciesPage (acknowledge modal)
 */
export const useAcknowledgePolicy = (policyId: string) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { policy_version_id: string }>({
    mutationFn: async (input: { policy_version_id: string }) => {
      await apiClient.post(`/policies/${policyId}/acknowledge`, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.POLICY_DETAIL(policyId) });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.POLICY_ACKNOWLEDGMENT_STATUS(policyId),
      });
      toast.success('Policy acknowledged successfully');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to acknowledge policy';
      toast.error(message);
    },
  });
};

/**
 * Fetches all acknowledgments for a specific policy version.
 * Used on: PoliciesPage (acknowledgments list)
 */
export const usePolicyAcknowledgments = (policyId: string) => {
  return useQuery<PolicyAcknowledgment[]>({
    queryKey: QUERY_KEYS.POLICY_ACKNOWLEDGMENTS(policyId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/policies/${policyId}/acknowledgments`);
      return data.data;
    },
    enabled: !!policyId,
    staleTime: 1000 * 60 * 2,
    retry: 2,
  });
};

/**
 * Fetches the acknowledgment status for the current user and a specific policy version.
 * Used on: PoliciesPage (status badge)
 */
export const useAcknowledgmentStatus = (policyId: string) => {
  return useQuery<AcknowledgmentStatus>({
    queryKey: QUERY_KEYS.POLICY_ACKNOWLEDGMENT_STATUS(policyId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/policies/${policyId}/acknowledgment-status`);
      return data.data;
    },
    enabled: !!policyId,
    staleTime: 1000 * 60 * 2,
    retry: 2,
  });
};
