import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { User } from '@/types';

/**
 * Fetches all users for the current company.
 * Used on: PeoplePage, UserTable.
 */
export const useUsers = () => {
  return useQuery<User[]>({
    queryKey: QUERY_KEYS.USERS,
    queryFn: async () => {
      const { data } = await apiClient.get('/people');
      return data.data;
    },
    staleTime: 1000 * 60 * 2,
    retry: 2,
  });
};
