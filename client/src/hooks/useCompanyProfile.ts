// client/src/hooks/useCompanyProfile.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { CompanySettings } from '@/types';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

// ── Update company name ──────────────────────────────────────────────────────
export const useUpdateCompanyName = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { name: string }) => {
      const response = await apiClient.put<ApiResponse<CompanySettings>>(
        '/company/settings/company-name',
        payload
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.COMPANY_EMPLOYEE_ID_FORMAT });
      toast.success('Company name updated successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to update company name';
      toast.error(message);
    },
  });
};

// ── Update timezone ──────────────────────────────────────────────────────────
export const useUpdateTimezone = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { timezone: string }) => {
      const response = await apiClient.put<ApiResponse<CompanySettings>>(
        '/company/settings/timezone',
        payload
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.COMPANY_EMPLOYEE_ID_FORMAT });
      toast.success('Timezone updated successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to update timezone';
      toast.error(message);
    },
  });
};

// ── Update default location ──────────────────────────────────────────────────
export const useUpdateDefaultLocation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { default_location_id: string | null }) => {
      const response = await apiClient.put<ApiResponse<CompanySettings>>(
        '/company/settings/default-location',
        payload
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.COMPANY_EMPLOYEE_ID_FORMAT });
      toast.success('Default location updated successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to update default location';
      toast.error(message);
    },
  });
};

// ── Update locale ────────────────────────────────────────────────────────────
export const useUpdateLocale = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { locale: string }) => {
      const response = await apiClient.put<ApiResponse<CompanySettings>>(
        '/company/settings/locale',
        payload
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.COMPANY_EMPLOYEE_ID_FORMAT });
      toast.success('Locale updated successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to update locale';
      toast.error(message);
    },
  });
};
