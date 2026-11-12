// src/features/security/hooks/useIdentityProviders.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type {
  IdentityProviderConnection,
  CreateIdentityProviderInput,
  UpdateIdentityProviderInput,
} from '@/types';

interface ApiErrorResponse {
  code?: string;
  message?: string;
  error?: string;
}

/**
 * Hook to fetch all identity provider connections for the current organization.
 * GET /api/v1/security/identity-providers
 */
export const useIdentityProviders = () => {
  return useQuery<IdentityProviderConnection[]>({
    queryKey: QUERY_KEYS.IDENTITY_PROVIDERS,
    queryFn: async () => {
      const { data } = await apiClient.get('/security/identity-providers');
      return data.data;
    },
    staleTime: 1000 * 60 * 2,
    retry: 2,
  });
};

/**
 * Hook to create a new Entra identity provider connection.
 * POST /api/v1/security/identity-providers
 */
export const useCreateIdentityProvider = () => {
  const queryClient = useQueryClient();

  return useMutation<
    IdentityProviderConnection,
    Error,
    CreateIdentityProviderInput
  >({
    mutationFn: async (payload) => {
      const { data } = await apiClient.post('/security/identity-providers', payload);
      return data.data;
    },
    onSuccess: (newConnection) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.IDENTITY_PROVIDERS });
      toast.success(`Identity provider "${newConnection.display_name}" created in draft status`);
    },
    onError: (error: unknown) => {
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data as ApiErrorResponse | undefined;
        const msg = errorData?.message || errorData?.error || 'Failed to create identity provider';
        toast.error(msg);
        return;
      }
      toast.error('Failed to create identity provider');
    },
  });
};

/**
 * Hook to update an existing identity provider connection.
 * PATCH /api/v1/security/identity-providers/:id
 */
export const useUpdateIdentityProvider = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation<
    IdentityProviderConnection,
    Error,
    UpdateIdentityProviderInput
  >({
    mutationFn: async (payload) => {
      const { data } = await apiClient.patch(`/security/identity-providers/${id}`, payload);
      return data.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.IDENTITY_PROVIDERS });
      toast.success(`Connection "${updated.display_name}" updated successfully`);
    },
    onError: (error: unknown) => {
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data as ApiErrorResponse | undefined;
        const code = errorData?.code;
        const msg = errorData?.message || errorData?.error;
        if (code === 'NO_VERIFIED_DOMAINS') {
          toast.error('Cannot activate identity provider: at least one verified domain is required');
          return;
        }
        if (code === 'OPERATOR_APPROVAL_REQUIRED') {
          toast.error('A Karbexa operator must approve this Entra tenant before the connection can be activated. Contact Karbexa support.');
          return;
        }
        toast.error(msg || 'Failed to update identity provider');
        return;
      }
      toast.error('Failed to update identity provider');
    },
  });
};

/**
 * Hook to trigger DNS TXT verification for a domain.
 * POST /api/v1/security/identity-providers/:id/domains/:domain/verify
 */
export const useVerifyDomain = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation<
    { verified: boolean; data: IdentityProviderConnection },
    Error,
    { domain: string }
  >({
    mutationFn: async ({ domain }) => {
      const encodedDomain = encodeURIComponent(domain);
      const { data } = await apiClient.post(
        `/security/identity-providers/${id}/domains/${encodedDomain}/verify`
      );
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.IDENTITY_PROVIDERS });
      toast.success(`Domain "${variables.domain}" verified successfully!`);
    },
    onError: (error: unknown, variables) => {
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data as ApiErrorResponse | undefined;
        const code = errorData?.code;
        if (code === 'DOMAIN_TAKEN') {
          toast.error(`Domain "${variables.domain}" is already claimed and verified by another organization.`);
          return;
        }
        if (code === 'DNS_RECORD_NOT_FOUND') {
          toast.error(`DNS TXT verification record not found for "${variables.domain}". Please check DNS configuration and retry after propagation.`);
          return;
        }
        const msg = errorData?.message || errorData?.error || 'Domain verification failed';
        toast.error(msg);
        return;
      }
      toast.error('Domain verification failed');
    },
  });
};
