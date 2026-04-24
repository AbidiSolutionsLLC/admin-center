import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { CompanySettings } from '@/types';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface DomainEnforcementSettings {
  allowed_domains: string[];
  is_domain_enforcement_active: boolean;
}

export const useDomainEnforcement = () => {
  return useQuery({
    queryKey: QUERY_KEYS.DOMAIN_ENFORCEMENT,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<CompanySettings>>('/company/settings');
      const settings = response.data.data.settings;
      return {
        allowed_domains: settings?.allowed_domains || [],
        is_domain_enforcement_active: settings?.is_domain_enforcement_active || false,
      } as DomainEnforcementSettings;
    },
  });
};

export const useUpdateDomainEnforcement = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: DomainEnforcementSettings) => {
      const response = await apiClient.put<ApiResponse<CompanySettings>>(
        '/company/settings/domain-enforcement',
        payload
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DOMAIN_ENFORCEMENT });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.COMPANY_EMPLOYEE_ID_FORMAT });
      toast.success('Domain enforcement settings updated successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to update domain enforcement settings';
      toast.error(message);
    },
  });
};