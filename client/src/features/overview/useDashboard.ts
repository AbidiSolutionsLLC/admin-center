// client/src/features/overview/useDashboard.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { DashboardStats, SetupProgress, AuditEvent, Insight } from '@/types';
import { toast } from 'sonner';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  summary?: {
    counts: {
      critical: number;
      warning: number;
      info: number;
      total: number;
    };
    area_counts: Record<string, number>;
  };
}

export interface OverviewInsightsResult {
  insights: Insight[];
  summary?: {
    counts: {
      critical: number;
      warning: number;
      info: number;
      total: number;
    };
    area_counts: Record<string, number>;
  };
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
    refetchInterval: 5000,
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
    refetchInterval: 10000,
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
    refetchInterval: 5000,
  });
};

/**
 * Fetch overview insights with optional filtering
 */
export const useOverviewInsights = (filters?: {
  severity?: string;
  area?: string;
  search?: string;
}) => {
  return useQuery({
    queryKey: QUERY_KEYS.OVERVIEW_INSIGHTS(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.severity && filters.severity !== 'all') {
        params.append('severity', filters.severity);
      }
      if (filters?.area && filters.area !== 'all') {
        params.append('area', filters.area);
      }
      if (filters?.search && filters.search.trim()) {
        params.append('search', filters.search.trim());
      }

      const queryString = params.toString();
      const endpoint = `/overview/insights${queryString ? `?${queryString}` : ''}`;
      const response = await apiClient.get<ApiResponse<Insight[]>>(endpoint);
      return response.data.data;
    },
    refetchInterval: 5000,
  });
};

/**
 * Dismiss an insight
 */
export const useDismissInsight = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (insightId: string) => {
      const response = await apiClient.put(`/overview/intelligence/${insightId}/dismiss`);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      queryClient.invalidateQueries({ queryKey: ['org', 'health'] });
      toast.success('Insight marked as dismissed');
    },
    onError: (error: any) => {
      console.error('Failed to dismiss insight', error);
      toast.error(error?.response?.data?.message || 'Failed to dismiss insight');
    },
  });
};

/**
 * Resolve an insight
 */
export const useResolveInsight = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (insightId: string) => {
      const response = await apiClient.put(`/overview/intelligence/${insightId}/resolve`);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      queryClient.invalidateQueries({ queryKey: ['org', 'health'] });
      toast.success('Insight marked as resolved');
    },
    onError: (error: any) => {
      console.error('Failed to resolve insight', error);
      toast.error(error?.response?.data?.message || 'Failed to resolve insight');
    },
  });
};

/**
 * Auto-fix an insight
 */
export const useAutoFixInsight = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (insightId: string) => {
      const response = await apiClient.post(`/overview/intelligence/${insightId}/auto-fix`);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      queryClient.invalidateQueries({ queryKey: ['org', 'health'] });
      toast.success('Issue automatically fixed and resolved');
    },
    onError: (error: any) => {
      console.error('Failed to auto-fix insight', error);
      toast.error(error?.response?.data?.message || 'Failed to apply auto-fix');
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
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      queryClient.invalidateQueries({ queryKey: ['org', 'health'] });
      toast.success('System health diagnostics completed successfully');
    },
    onError: (error: any) => {
      console.error('Failed to run intelligence', error);
      toast.error(error?.response?.data?.message || 'Failed to run health diagnostics');
    },
  });
};

