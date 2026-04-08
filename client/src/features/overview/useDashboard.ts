// client/src/features/overview/useDashboard.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { DashboardStats, SetupProgress, AuditEvent, Insight } from '@/types';
import { toast } from 'sonner';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/**
 * Fetch dashboard statistics
 */
export const useDashboardStats = () => {
  return useQuery({
    queryKey: QUERY_KEYS.DASHBOARD_STATS,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<DashboardStats>>('/overview/stats');
      return response.data.data;
    },
  });
};

/**
 * Fetch setup progress
 */
export const useSetupProgress = () => {
  return useQuery({
    queryKey: QUERY_KEYS.SETUP_PROGRESS,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SetupProgress>>('/overview/setup-progress');
      return response.data.data;
    },
  });
};

/**
 * Fetch recent activity (last 10 audit events)
 */
export const useRecentActivity = () => {
  return useQuery({
    queryKey: QUERY_KEYS.RECENT_ACTIVITY,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<AuditEvent[]>>('/overview/recent-activity');
      return response.data.data;
    },
  });
};

/**
 * Fetch overview insights (active only, sorted by severity)
 */
export const useOverviewInsights = () => {
  return useQuery({
    queryKey: QUERY_KEYS.OVERVIEW_INSIGHTS,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Insight[]>>('/overview/insights');
      return response.data.data;
    },
  });
};

/**
 * Dismiss/resolve an insight
 */
export const useDismissInsight = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (insightId: string) => {
      const response = await apiClient.put(`/overview/intelligence/${insightId}/resolve`);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.OVERVIEW_INSIGHTS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.RECENT_ACTIVITY });
      toast.success('Insight dismissed');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to dismiss insight';
      toast.error(message);
    },
  });
};

/**
 * Run intelligence rules manually
 */
export const useRunIntelligence = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/overview/intelligence/run');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.OVERVIEW_INSIGHTS });
      toast.success('Intelligence rules executed');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to run intelligence';
      toast.error(message);
    },
  });
};
