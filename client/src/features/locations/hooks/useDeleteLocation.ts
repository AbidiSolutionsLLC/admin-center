// src/features/locations/hooks/useDeleteLocation.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { Location } from '@/types';

interface DeleteLocationError {
  message: string;
  code: string;
  userCount?: number;
}

/**
 * Deletes a location.
 * Used on: LocationsPage.
 * Returns 409 with user count if location has assigned users.
 * Invalidates location queries and shows toast on success.
 */
export const useDeleteLocation = () => {
  const queryClient = useQueryClient();

  return useMutation<Location, DeleteLocationError, string>({
    mutationFn: async (id) => {
      const { data } = await apiClient.delete(`/locations/${id}`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LOCATIONS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LOCATION_TREE });
      toast.success('Location deleted successfully');
    },
    onError: (error) => {
      if (error.code === 'LOCATION_HAS_USERS') {
        toast.error(error.message);
      } else {
        console.error('Location deletion failed:', error);
        toast.error('Failed to delete location. Please try again.');
      }
    },
  });
};
