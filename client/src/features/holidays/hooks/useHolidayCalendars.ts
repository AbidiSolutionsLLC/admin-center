import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { HolidayCalendar, CreateHolidayCalendarInput, UpdateHolidayCalendarInput } from '@/types';

export const useHolidayCalendars = () => {
  const queryClient = useQueryClient();

  const query = useQuery<HolidayCalendar[]>({
    queryKey: QUERY_KEYS.HOLIDAY_CALENDARS,
    queryFn: async () => {
      const { data } = await apiClient.get('/holidays/calendars');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  const createMutation = useMutation<HolidayCalendar, Error, CreateHolidayCalendarInput>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post('/holidays/calendars', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HOLIDAY_CALENDARS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HOLIDAY_CALENDAR_TREE });
      toast.success('Holiday calendar created successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create holiday calendar');
    },
  });

  const updateMutation = useMutation<HolidayCalendar, Error, { id: string; input: UpdateHolidayCalendarInput }>({
    mutationFn: async ({ id, input }) => {
      const { data } = await apiClient.put(`/holidays/calendars/${id}`, input);
      return data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HOLIDAY_CALENDARS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HOLIDAY_CALENDAR_TREE });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HOLIDAY_CALENDAR_DETAIL(id) });
      toast.success('Holiday calendar updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update holiday calendar');
    },
  });

  const deleteMutation = useMutation<void, Error, string>({
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

  return {
    ...query,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
};
