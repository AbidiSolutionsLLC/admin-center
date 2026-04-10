// src/features/locations/hooks/useCreateLocation.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { Location, CreateLocationInput } from '@/types';

/**
 * Creates a new location.
 * Used on: LocationForm (create mode), LocationsPage.
 * Invalidates location queries and shows toast on success.
 */
export const useCreateLocation = () => {
  const queryClient = useQueryClient();

  return useMutation<Location, Error, CreateLocationInput>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post('/locations', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LOCATIONS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LOCATION_TREE });
      toast.success('Location created successfully');
    },
    onError: (error) => {
      console.error('Location creation failed:', error);
      toast.error('Failed to create location. Please try again.');
    },
  });
};
