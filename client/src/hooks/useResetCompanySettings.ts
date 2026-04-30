import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';

/**
 * Resets company settings to factory defaults.
 * Used on: CompanySettingsPage.
 */
export const useResetCompanySettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/company/settings/reset');
      return response.data.data;
    },
    onSuccess: () => {
      // Invalidate all company-related queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.COMPANY_REQUIRED_USER_FIELDS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.COMPANY_EMPLOYEE_ID_FORMAT });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.COMPANY_DOMAIN_ENFORCEMENT });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.FORM_METADATA });
      
      toast.success('Company settings reset to factory defaults');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to reset settings';
      toast.error(message);
    },
  });
};
