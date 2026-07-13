import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useLocationUsers = (locationId: string | undefined) => {
  return useQuery({
    queryKey: QUERY_KEYS.LOCATION_USERS(locationId!),
    queryFn: async () => {
      const { data } = await apiClient.get(`/locations/${locationId}/users`);
      return data.data;
    },
    enabled: !!locationId,
    staleTime: 1000 * 60 * 2,
  });
};
