import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';
import type { AccessControlPolicy, DataGovernancePolicy, PolicyTemplate } from '@/types';

// Query Keys
export const ADVANCED_POLICY_KEYS = {
  accessControl: ['accessControlPolicies'] as const,
  dataGovernance: ['dataGovernancePolicies'] as const,
  templates: ['policyTemplates'] as const,
};

// ── Access Control Policies ──────────────────────────────────────────────

export const useAccessControlPolicies = () => {
  return useQuery<AccessControlPolicy[]>({
    queryKey: ADVANCED_POLICY_KEYS.accessControl,
    queryFn: async () => {
      const { data } = await apiClient.get('/access-control-policies');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

export const useCreateAccessControlPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation<AccessControlPolicy, Error, Partial<AccessControlPolicy>>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post('/access-control-policies', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADVANCED_POLICY_KEYS.accessControl });
      toast.success('Access control policy created successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to create access control policy');
    },
  });
};

export const useDeleteAccessControlPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiClient.delete(`/access-control-policies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADVANCED_POLICY_KEYS.accessControl });
      toast.success('Policy deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to delete policy');
    },
  });
};

// ── Data Governance Policies ──────────────────────────────────────────────

export const useDataGovernancePolicies = () => {
  return useQuery<DataGovernancePolicy[]>({
    queryKey: ADVANCED_POLICY_KEYS.dataGovernance,
    queryFn: async () => {
      const { data } = await apiClient.get('/data-governance-policies');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

export const useCreateDataGovernancePolicy = () => {
  const queryClient = useQueryClient();
  return useMutation<DataGovernancePolicy, Error, Partial<DataGovernancePolicy>>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post('/data-governance-policies', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADVANCED_POLICY_KEYS.dataGovernance });
      toast.success('Data governance policy created successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to create policy');
    },
  });
};

export const useDeleteDataGovernancePolicy = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiClient.delete(`/data-governance-policies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADVANCED_POLICY_KEYS.dataGovernance });
      toast.success('Policy deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to delete policy');
    },
  });
};

// ── Policy Templates ──────────────────────────────────────────────────────

export const usePolicyTemplates = () => {
  return useQuery<PolicyTemplate[]>({
    queryKey: ADVANCED_POLICY_KEYS.templates,
    queryFn: async () => {
      const { data } = await apiClient.get('/policy-templates');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

export const useCreatePolicyTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation<PolicyTemplate, Error, Partial<PolicyTemplate>>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post('/policy-templates', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADVANCED_POLICY_KEYS.templates });
      toast.success('Policy template created successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to create template');
    },
  });
};

export const useDeletePolicyTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiClient.delete(`/policy-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADVANCED_POLICY_KEYS.templates });
      toast.success('Template deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to delete template');
    },
  });
};
