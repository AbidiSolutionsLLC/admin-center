import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';

export const useDeleteHolidayCalendar = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiClient.delete(`/holidays/calendars/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HOLIDAY_CALENDARS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HOLIDAY_CALENDAR_TREE });
      toast.success('Holiday calendar deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete holiday calendar');
    },
  });
};
