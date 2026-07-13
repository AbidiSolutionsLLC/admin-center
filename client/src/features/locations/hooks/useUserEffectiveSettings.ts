import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useUserEffectiveSettings = (userId: string | undefined) => {
  return useQuery({
    queryKey: QUERY_KEYS.USER_EFFECTIVE_SETTINGS(userId!),
    queryFn: async () => {
      const { data } = await apiClient.get(`/people/${userId}/effective-settings`);
      return data.data;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  });
};
