import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';
import { PERMISSION_GROUPS } from '@/constants/roles';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface FormMetadata {
  required_fields: string[];
}

/**
 * The invite / edit form's option lists. The server answers only people admins (`requireRole(PEOPLE_MANAGERS)` on
 * `GET /people/form-metadata`), so other members do not ask: the Users and member pages caused a background 403 for
 * every IT Admin, Manager and Employee (B-18).
 */
export const useFormMetadata = () => {
  const userRole = useAuthStore((state) => state.userRole);
  const canLoad = !!userRole && (PERMISSION_GROUPS.PEOPLE_ADMINS as readonly string[]).includes(userRole);
  return useQuery({
    queryKey: QUERY_KEYS.FORM_METADATA,
    enabled: canLoad,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FormMetadata>>('/people/form-metadata');
      return response.data.data;
    },
  });
};