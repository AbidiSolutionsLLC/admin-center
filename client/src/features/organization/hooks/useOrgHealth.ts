// src/features/organization/hooks/useOrgHealth.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { Insight } from '@/types';

interface OrgHealthData {
  insights: { critical: Insight[]; high: Insight[]; medium: Insight[]; low: Insight[]; };
  counts: { critical: number; high: number; medium: number; low: number; total: number; };
}

/**
 * Fetches organizational health insights grouped by severity.
 * Used on: OrganizationPage (Health tab).
 */
export const useOrgHealth = () => {
  return useQuery<OrgHealthData>({
    queryKey: QUERY_KEYS.ORG_HEALTH,
    queryFn: async () => {
      const { data } = await apiClient.get('/organization/health');
      return data.data;
    },
    staleTime: 1000 * 30,
    retry: 2,
  });
};

/**
 * Dismisses an insight.
 * Used on: OrganizationPage (Health tab).
 */
export const useDismissInsight = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (insightId) => {
      await apiClient.put(`/intelligence/${insightId}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORG_HEALTH });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INSIGHTS() });
      toast.success('Insight dismissed');
    },
    onError: (error) => {
      console.error('Failed to dismiss insight', error);
      toast.error('Failed to dismiss insight. Please try again.');
    },
  });
};

/**
 * Resolves an insight.
 * Used on: OrganizationPage (Health tab).
 */
export const useResolveInsight = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (insightId) => {
      await apiClient.put(`/intelligence/${insightId}/resolve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORG_HEALTH });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INSIGHTS() });
      toast.success('Insight resolved');
    },
    onError: (error) => {
      console.error('Failed to resolve insight', error);
      toast.error('Failed to resolve insight. Please try again.');
    },
  });
};

/**
 * Automatically fixes an insight.
 * Used on: OrganizationPage (Health tab).
 */
export const useAutoFixInsight = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (insightId) => {
      await apiClient.post(`/intelligence/${insightId}/auto-fix`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORG_HEALTH });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INSIGHTS() });
      toast.success('Issue automatically fixed and resolved');
    },
    onError: (error) => {
      console.error('Failed to auto-fix insight', error);
      toast.error('Failed to apply auto-fix. Please try again.');
    },
  });
};
