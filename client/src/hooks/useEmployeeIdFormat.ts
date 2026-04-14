import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { CompanySettings } from '@/types';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export const useEmployeeIdFormat = () => {
  return useQuery({
    queryKey: QUERY_KEYS.COMPANY_EMPLOYEE_ID_FORMAT,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<CompanySettings>>('/company/settings');
      return response.data.data;
    },
  });
};

export const useUpdateEmployeeIdFormat = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { employee_id_format: string }) => {
      const response = await apiClient.put<ApiResponse<CompanySettings>>(
        '/company/settings/employee-id-format',
        payload
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.COMPANY_EMPLOYEE_ID_FORMAT });
      toast.success('Employee ID format updated successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to update employee ID format';
      toast.error(message);
    },
  });
};
