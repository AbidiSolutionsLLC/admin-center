import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { HolidayAssignment, LocationCalendarAssignment } from '@/types';

export const useHolidayAssignments = () => {
  const queryClient = useQueryClient();

  const query = useQuery<HolidayAssignment[]>({
    queryKey: QUERY_KEYS.HOLIDAY_ASSIGNMENTS,
    queryFn: async () => {
      const { data } = await apiClient.get('/holidays/assignments');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  const createMutation = useMutation<HolidayAssignment, Error, LocationCalendarAssignment>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post('/holidays/assignments', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HOLIDAY_ASSIGNMENTS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HOLIDAY_CALENDARS });
      toast.success('Holiday calendar assigned to location successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to assign holiday calendar');
    },
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiClient.delete(`/holidays/assignments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HOLIDAY_ASSIGNMENTS });
      toast.success('Holiday assignment removed successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to remove holiday assignment');
    },
  });

  return {
    ...query,
    create: createMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
};
