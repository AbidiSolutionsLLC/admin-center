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

export const useApps = (params?: { search?: string; status?: string; category?: string; page?: number; limit?: number }) => {
  return useQuery({
    queryKey: params ? [...QUERY_KEYS.APPS, params] : [...QUERY_KEYS.APPS],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<App[]>>('/apps', { params });
      const data = response.data.data;
      if ((response.data as any).pagination) {
        (data as any).pagination = (response.data as any).pagination;
      }
      return data;
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
      const response = await apiClient.get<ApiResponse<App & { assignments?: AppAssignment[]; owner_info?: any }>>(`/apps/${appId}`);
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
    onMutate: async ({ appId, assignmentId }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.APP_DETAIL(appId) });
      const previousApp = queryClient.getQueryData(QUERY_KEYS.APP_DETAIL(appId));

      queryClient.setQueryData(QUERY_KEYS.APP_DETAIL(appId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          assignments: old.assignments?.filter((a: any) => a._id !== assignmentId),
        };
      });

      return { previousApp, appId };
    },
    onError: (error: any, variables, context) => {
      if (context?.previousApp) {
        queryClient.setQueryData(QUERY_KEYS.APP_DETAIL(context.appId), context.previousApp);
      }
      const message = error.response?.data?.error || 'Failed to revoke assignment';
      toast.error(message);
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.APPS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.APP_DETAIL(variables.appId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.APP_ASSIGNMENTS(variables.appId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.APP_TIMELINE(variables.appId) });
    },
    onSuccess: () => {
      toast.success('App assignment revoked');
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
export const useCheckAppDependencies = (appId: string, targetType: string, targetId: string, attributeName?: string, attributeValue?: string) => {
  return useQuery({
    queryKey: QUERY_KEYS.APP_DEPENDENCIES(appId, targetType, targetId, attributeName, attributeValue),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<DependencyCheckResult>>(
        `/apps/${appId}/dependencies`,
        {
          params: { target_type: targetType, target_id: targetId, attribute_name: attributeName, attribute_value: attributeValue },
        }
      );
      return response.data.data;
    },
    enabled: !!appId && !!targetType && !!targetId,
  });
};

/**
 * Update an app (e.g. toggling status or is_active)
 */
export const useUpdateApp = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ appId, data }: { appId: string; data: Partial<App> }) => {
      const response = await apiClient.put(`/apps/${appId}`, data);
      return response.data.data;
    },
    onSuccess: (data, { appId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.APPS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.APP_DETAIL(appId) });
      toast.success('App updated successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to update app';
      toast.error(message);
    },
  });
};

/**
 * Fetch all apps assigned to a specific target (role, dept, etc.)
 */
export const useTargetApps = (targetType: string, targetId: string) => {
  return useQuery({
    queryKey: [...QUERY_KEYS.APPS, 'target', targetType, targetId],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<(AppAssignment & { app_info?: any; granted_by_info?: any })[]>>(
        `/apps/target/${targetType}/${targetId}`
      );
      return response.data.data;
    },
    enabled: !!targetType && !!targetId,
  });
};


