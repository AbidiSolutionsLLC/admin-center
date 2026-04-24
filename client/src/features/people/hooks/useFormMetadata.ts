import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface FormMetadata {
  required_fields: string[];
}

export const useFormMetadata = () => {
  return useQuery({
    queryKey: QUERY_KEYS.FORM_METADATA,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FormMetadata>>('/people/form-metadata');
      return response.data.data;
    },
  });
};