// client/src/features/work-schedules/hooks/useWorkScheduleAssignments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { WorkScheduleAssignment, CreateWorkScheduleAssignmentInput } from '@/types';

/**
 * Fetches all work schedule assignments for the current company.
 */
export const useWorkScheduleAssignments = () => {
  const queryClient = useQueryClient();

  const query = useQuery<WorkScheduleAssignment[]>({
    queryKey: QUERY_KEYS.WORK_SCHEDULE_ASSIGNMENTS,
    queryFn: async () => {
      const { data } = await apiClient.get('/work-schedules/assignments');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  const createMutation = useMutation<WorkScheduleAssignment, Error, CreateWorkScheduleAssignmentInput>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post('/work-schedules/assignments', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORK_SCHEDULE_ASSIGNMENTS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORK_SCHEDULES });
      toast.success('Work schedule assigned to location successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to assign work schedule');
    },
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiClient.delete(`/work-schedules/assignments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORK_SCHEDULE_ASSIGNMENTS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORK_SCHEDULES });
      toast.success('Work schedule assignment removed successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to remove assignment');
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
