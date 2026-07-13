import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { Holiday, CreateHolidayInput, UpdateHolidayInput } from '@/types';

interface UseHolidaysOptions {
  calendarId?: string;
}

export const useHolidays = (options: UseHolidaysOptions = {}) => {
  const queryClient = useQueryClient();
  const { calendarId } = options;

  const query = useQuery<Holiday[]>({
    queryKey: QUERY_KEYS.HOLIDAYS_BY_CALENDAR(calendarId ?? ''),
    queryFn: async () => {
      if (!calendarId) return [];
      const { data } = await apiClient.get(`/holidays/calendars/${calendarId}/holidays`);
      return data.data;
    },
    enabled: !!calendarId,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  const createMutation = useMutation<Holiday, Error, { calendarId: string; data: CreateHolidayInput }>({
    mutationFn: async ({ calendarId: cId, data }) => {
      const { data: res } = await apiClient.post(`/holidays/calendars/${cId}/holidays`, data);
      return res.data;
    },
    onSuccess: (_data, { calendarId: cId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HOLIDAYS_BY_CALENDAR(cId) });
      toast.success('Holiday created successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create holiday');
    },
  });

  const updateMutation = useMutation<Holiday, Error, { holidayId: string; data: UpdateHolidayInput }>({
    mutationFn: async ({ holidayId, data }) => {
      const { data: res } = await apiClient.put(`/holidays/${holidayId}`, data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Holiday updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update holiday');
    },
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (holidayId) => {
      await apiClient.delete(`/holidays/${holidayId}`);
    },
    onSuccess: () => {
      if (calendarId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HOLIDAYS_BY_CALENDAR(calendarId) });
      }
      toast.success('Holiday deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete holiday');
    },
  });

  const exportMutation = useMutation<Blob, Error, string>({
    mutationFn: async (cId) => {
      const response = await apiClient.get(`/holidays/calendars/${cId}/holidays/export`, {
        responseType: 'blob',
      });
      return response.data;
    },
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'holidays.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Holidays exported successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to export holidays');
    },
  });

  return {
    ...query,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
    export: exportMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isExporting: exportMutation.isPending,
  };
};
