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
  UpdatePolicyDraftInput,
  PolicyAssignmentRule,
  PolicyTargetType,
  PolicyConflictCheck,
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
 * Fetches a specific policy version by ID, including assignment rules.
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
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to publish policy';
      toast.error(message);
    },
  });
};

/**
 * Updates a draft policy version before publishing.
 * Produces audit event: policy.draft_updated
 * Used on: PoliciesPage (edit modal)
 */
export const useUpdatePolicyDraft = (policyId: string) => {
  const queryClient = useQueryClient();

  return useMutation<PolicyVersion, Error, UpdatePolicyDraftInput>({
    mutationFn: async (input: UpdatePolicyDraftInput) => {
      const { data } = await apiClient.put(`/policies/${policyId}/draft`, input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.POLICIES });
      if (policyId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.POLICY_DETAIL(policyId) });
      }
      toast.success('Draft saved successfully');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to save draft';
      toast.error(message);
    },
  });
};

/**
 * Archives a published policy version (soft delete, keeps history accessible).
 * Produces audit event: policy.archived
 * Used on: PoliciesPage (version actions)
 */
export const useArchivePolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<PolicyVersion, Error, { policy_id: string }>({
    mutationFn: async ({ policy_id }: { policy_id: string }) => {
      const { data } = await apiClient.post(`/policies/${policy_id}/archive`);
      return data.data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.POLICIES });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.POLICY_DETAIL(vars.policy_id) });
      toast.success('Policy archived successfully');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to archive policy';
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
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to acknowledge policy';
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

/**
 * Saves assignment rules (targeting) for a policy version.
 * Produces audit event: policy.assignment_rules_updated
 * Also runs RULE-08 conflict check.
 * Used on: PoliciesPage (targeting modal)
 */
export const useSaveAssignmentRules = (policyId: string) => {
  const queryClient = useQueryClient();

  return useMutation<
    PolicyAssignmentRule[],
    Error,
    Array<{ target_type: PolicyTargetType; target_id: string }>
  >({
    mutationFn: async (rules: Array<{ target_type: PolicyTargetType; target_id: string }>) => {
      const { data } = await apiClient.post(`/policies/${policyId}/assignments`, { rules });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.POLICY_DETAIL(policyId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.POLICY_ASSIGNMENTS(policyId) });
      toast.success('Assignment rules saved');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to save assignment rules';
      toast.error(message);
    },
  });
};

/**
 * Checks for conflicting policies on the same user population (RULE-08).
 * Used on: PoliciesPage (after saving assignment rules)
 */
export const usePolicyConflictCheck = (policyId: string) => {
  return useQuery<PolicyConflictCheck>({
    queryKey: ['policy', policyId, 'conflicts'] as const,
    queryFn: async () => {
      const { data } = await apiClient.get(`/policies/${policyId}/conflict-check`);
      return data.data;
    },
    enabled: !!policyId,
    staleTime: 1000 * 60 * 1,
    retry: 1,
  });
};

/**
 * Compares two versions of the same policy and returns a diff.
 * Used on: PoliciesPage (version diff view)
 */
export const usePolicyVersionDiff = (policyKey: string, versionA: string, versionB: string) => {
  return useQuery<{
    policy_key: string;
    version_a: { version_number: number; title: string; content: string };
    version_b: { version_number: number; title: string; content: string };
    diff_summary: {
      added_lines: number;
      removed_lines: number;
      sample_added: string[];
      sample_removed: string[];
    };
  }>({
    queryKey: ['policy', policyKey, 'diff', versionA, versionB] as const,
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/policies/versions/diff?policy_key=${policyKey}&version_a=${versionA}&version_b=${versionB}`
      );
      return data.data;
    },
    enabled: !!policyKey && !!versionA && !!versionB,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};

/**
 * Fetches all assignment rules for a specific policy version.
 * Used on: PoliciesPage (targeting view)
 */
export const usePolicyAssignments = (policyId: string) => {
  return useQuery<PolicyAssignmentRule[]>({
    queryKey: QUERY_KEYS.POLICY_ASSIGNMENTS(policyId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/policies/${policyId}/assignments`);
      return data.data;
    },
    enabled: !!policyId,
    staleTime: 1000 * 60 * 2,
    retry: 2,
  });
};
