// client/src/features/apps/useApps.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { App, AppAssignment, AssignAppInput, DependencyCheckResult } from '@/types';
import { toast } from 'sonner';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/**
 * Fetch all apps
 */
export const useApps = () => {
  return useQuery({
    queryKey: QUERY_KEYS.APPS,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<App[]>>('/apps');
      return response.data.data;
    },
  });
};

/**
 * Fetch a single app by ID
 */
export const useApp = (appId: string) => {
  return useQuery({
    queryKey: QUERY_KEYS.APP_DETAIL(appId),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<App>>(`/apps/${appId}`);
      return response.data.data;
    },
    enabled: !!appId,
  });
};

/**
 * Assign an app to a role, department, group, or user
 */
export const useAssignApp = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ appId, data }: { appId: string; data: AssignAppInput }) => {
      const response = await apiClient.post(`/apps/${appId}/assign`, data);
      return response.data.data;
    },
    onSuccess: (data, { appId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.APPS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.APP_DETAIL(appId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.APP_ASSIGNMENTS(appId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.APP_TIMELINE(appId) });
      toast.success(`App assigned to ${data.affected_users} user(s)`);
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to assign app';
      toast.error(message);
    },
  });
};

/**
 * Revoke an app assignment
 */
export const useRevokeApp = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ appId, assignmentId }: { appId: string; assignmentId: string }) => {
      const response = await apiClient.post(`/apps/${appId}/revoke`, { assignment_id: assignmentId });
      return response.data.data;
    },
    onSuccess: (_, { appId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.APPS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.APP_DETAIL(appId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.APP_ASSIGNMENTS(appId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.APP_TIMELINE(appId) });
      toast.success('App assignment revoked');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to revoke assignment';
      toast.error(message);
    },
  });
};

/**
 * Fetch assignment timeline for an app
 */
export const useAppTimeline = (appId: string, page = 1, limit = 50) => {
  return useQuery({
    queryKey: QUERY_KEYS.APP_TIMELINE(appId),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<{
        assignments: (AppAssignment & {
          granted_by_info?: { full_name: string; email: string };
          revoked_by_info?: { full_name: string; email: string };
        })[];
        pagination: { page: number; limit: number; total: number; pages: number };
      }>>(`/apps/${appId}/timeline`, {
        params: { page, limit },
      });
      return response.data.data;
    },
    enabled: !!appId,
  });
};

/**
 * Check app dependencies for a target
 */
export const useCheckAppDependencies = (appId: string, targetType: string, targetId: string) => {
  return useQuery({
    queryKey: QUERY_KEYS.APP_DEPENDENCIES(appId, targetType, targetId),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<DependencyCheckResult>>(
        `/apps/${appId}/dependencies`,
        {
          params: { target_type: targetType, target_id: targetId },
        }
      );
      return response.data.data;
    },
    enabled: !!appId && !!targetType && !!targetId,
  });
};
