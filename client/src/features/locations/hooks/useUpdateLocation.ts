// src/features/locations/hooks/useUpdateLocation.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { Location, UpdateLocationInput } from '@/types';

/**
 * Updates an existing location.
 * Used on: LocationForm (edit mode).
 * Invalidates location queries and shows toast on success.
 */
export const useUpdateLocation = () => {
  const queryClient = useQueryClient();

  return useMutation<Location, Error, { id: string; input: UpdateLocationInput }>({
    mutationFn: async ({ id, input }) => {
      const { data } = await apiClient.put(`/locations/${id}`, input);
      return data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LOCATIONS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LOCATION_TREE });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LOCATION_DETAIL(id) });
      toast.success('Location updated successfully');
    },
    onError: (error) => {
      console.error('Location update failed:', error);
      toast.error('Failed to update location. Please try again.');
    },
  });
};
