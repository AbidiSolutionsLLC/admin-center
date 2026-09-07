// client/src/features/overview/useInsightHistory.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { Insight } from '@/types';

export interface InsightTrend {
  date: string;
  resolved: number;
  dismissed: number;
}

export interface InsightHistoryResponse {
  success: boolean;
  data: (Insight & { is_recurring: boolean; recurrence_count: number })[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  trends: InsightTrend[];
}

export const useInsightHistory = (filters: {
  severity?: string;
  category?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) => {
  return useQuery({
    queryKey: ['insight-history', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.severity && filters.severity !== 'all') params.append('severity', filters.severity);
      if (filters.category && filters.category !== 'all') params.append('category', filters.category);
      if (filters.status && filters.status !== 'all') params.append('status', filters.status);
      if (filters.search) params.append('search', filters.search);
      if (filters.page) params.append('page', filters.page.toString());
      if (filters.limit) params.append('limit', filters.limit.toString());

      const response = await apiClient.get<InsightHistoryResponse>(
        `/intelligence/history?${params.toString()}`
      );
      return response.data;
    },
  });
};
