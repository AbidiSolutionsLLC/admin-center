// client/src/features/work-schedules/hooks/useWorkSchedules.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { WorkSchedule, CreateWorkScheduleInput, UpdateWorkScheduleInput } from '@/types';

/**
 * Fetches all work schedules for the current company.
 * Used on: WorkSchedulesPage.
 */
export const useWorkSchedules = () => {
  const queryClient = useQueryClient();

  const query = useQuery<WorkSchedule[]>({
    queryKey: QUERY_KEYS.WORK_SCHEDULES,
    queryFn: async () => {
      const { data } = await apiClient.get('/work-schedules');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  const createMutation = useMutation<WorkSchedule, Error, CreateWorkScheduleInput>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post('/work-schedules', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORK_SCHEDULES });
      toast.success('Work schedule created successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create work schedule');
    },
  });

  const updateMutation = useMutation<WorkSchedule, Error, { id: string; input: UpdateWorkScheduleInput }>({
    mutationFn: async ({ id, input }) => {
      const { data } = await apiClient.put(`/work-schedules/${id}`, input);
      return data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORK_SCHEDULES });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORK_SCHEDULE_DETAIL(id) });
      queryClient.invalidateQueries({ queryKey: ['user'] });
      toast.success('Work schedule updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update work schedule');
    },
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiClient.delete(`/work-schedules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORK_SCHEDULES });
      toast.success('Work schedule deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete work schedule');
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
