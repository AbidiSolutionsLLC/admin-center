import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { CompanySettings } from '@/types';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export const useRequiredUserFields = () => {
  return useQuery({
    queryKey: QUERY_KEYS.COMPANY_REQUIRED_USER_FIELDS,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<CompanySettings>>('/company/settings');
      return response.data.data.settings?.required_user_fields || ['email', 'full_name'];
    },
  });
};

export const useUpdateRequiredUserFields = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { required_user_fields: string[] }) => {
      const response = await apiClient.put<ApiResponse<CompanySettings>>(
        '/company/settings/required-user-fields',
        payload
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.COMPANY_REQUIRED_USER_FIELDS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.COMPANY_EMPLOYEE_ID_FORMAT });
      toast.success('Required user fields updated successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to update required user fields';
      toast.error(message);
    },
  });
};