// src/features/people/hooks/useReportingLines.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { ReportingLineData, AddSecondaryManagerInput, ChangePrimaryManagerInput } from '@/types';

/**
 * Fetches the full reporting line for a user (primary manager, secondary managers, direct reports).
 * Used on: UserDetailPage, ReportingLinesPanel.
 */
export const useReportingLine = (userId: string) => {
  return useQuery<ReportingLineData>({
    queryKey: QUERY_KEYS.USER_REPORTING_LINE(userId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/people/${userId}/reporting-line`);
      return data.data;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
    retry: 2,
  });
};

/**
 * Adds a secondary manager to a user.
 * Invalidates reporting line query and shows toast on success.
 * Produces audit event: user.secondary_manager_added
 */
export const useAddSecondaryManager = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation<ReportingLineData, Error, AddSecondaryManagerInput>({
    mutationFn: async (input: AddSecondaryManagerInput) => {
      const { data } = await apiClient.post(`/people/${userId}/reporting-line/secondary`, input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_REPORTING_LINE(userId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_DETAIL(userId) });
      toast.success('Secondary manager added successfully');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to add secondary manager';
      toast.error(message);
    },
  });
};

/**
 * Removes a secondary manager from a user.
 * Invalidates reporting line query and shows toast on success.
 * Produces audit event: user.secondary_manager_removed
 */
export const useRemoveSecondaryManager = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation<ReportingLineData, Error, { managerId: string }>({
    mutationFn: async ({ managerId }: { managerId: string }) => {
      const { data } = await apiClient.delete(`/people/${userId}/reporting-line/secondary/${managerId}`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_REPORTING_LINE(userId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_DETAIL(userId) });
      toast.success('Secondary manager removed successfully');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to remove secondary manager';
      toast.error(message);
    },
  });
};

/**
 * Changes the primary manager for a user.
 * Invalidates reporting line query and shows toast on success.
 * Produces audit event: user.primary_manager_changed
 */
export const useChangePrimaryManager = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation<ReportingLineData, Error, ChangePrimaryManagerInput>({
    mutationFn: async (input: ChangePrimaryManagerInput) => {
      const { data } = await apiClient.put(`/people/${userId}/reporting-line/primary`, input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_REPORTING_LINE(userId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_DETAIL(userId) });
      toast.success('Primary manager updated successfully');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to change primary manager';
      toast.error(message);
    },
  });
};
