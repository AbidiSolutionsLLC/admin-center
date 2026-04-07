import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { User } from '@/types';

/**
 * Fetches a single user detail by ID.
 * Used on: UserProfilePage, UserForm (for pre-population).
 */
export const useUserDetail = (userId: string) => {
  return useQuery<User>({
    queryKey: QUERY_KEYS.USER_DETAIL(userId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/people/${userId}`);
      return data.data;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
