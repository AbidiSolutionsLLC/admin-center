import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { User, LifecycleState } from '@/types';

/**
 * Fetches all users for the current company.
 * Used on: PeoplePage, UserTable.
 */
export const useUsers = () => {
  return useQuery<User[]>({
    queryKey: QUERY_KEYS.USERS,
    queryFn: async () => {
      const { data } = await apiClient.get('/people');
      return data.data;
    },
    staleTime: 1000 * 60 * 2,
    retry: 2,
  });
};

/**
 * Bulk lifecycle change for multiple users.
 * Returns per-row results with success/failure status.
 * Each user produces individual audit event.
 */
export const useBulkLifecycleChange = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { total: number; successful: number; skipped: number; results: Array<{ user_id: string; user_name: string; success: boolean; error?: string }> },
    Error,
    { user_ids: string[]; lifecycle_state: LifecycleState }
  >({
    mutationFn: async (input) => {
      const { data } = await apiClient.put('/people/bulk-lifecycle', input);
      return data.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USERS });
      if (result.skipped > 0) {
        toast.warning(`${result.successful} updated, ${result.skipped} skipped — check invalid transitions`);
      } else {
        toast.success(`${result.successful} users updated`);
      }
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to bulk update lifecycle';
      toast.error(message);
    },
  });
};

/**
 * Bulk role assignment for multiple users.
 * Returns per-row results with success/failure status.
 * Each assignment produces an audit event.
 */
export const useBulkAssignRole = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { total: number; successful: number; skipped: number; results: Array<{ user_id: string; user_name: string; success: boolean; error?: string }> },
    Error,
    { user_ids: string[]; role_id: string }
  >({
    mutationFn: async (input) => {
      const { data } = await apiClient.post('/people/bulk-assign-role', input);
      return data.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USERS });
      if (result.skipped > 0) {
        toast.warning(`${result.successful} assigned, ${result.skipped} skipped (already have role)`);
      } else {
        toast.success(`Role assigned to ${result.successful} users`);
      }
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to bulk assign role';
      toast.error(message);
    },
  });
};

/**
 * Export users as CSV. Downloads file directly — no toast on success.
 */
export const useExportUsers = (filters?: { lifecycle_state?: string; department_id?: string; employment_type?: string }) => {
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const params = new URLSearchParams();
      if (filters?.lifecycle_state) params.append('lifecycle_state', filters.lifecycle_state);
      if (filters?.department_id) params.append('department_id', filters.department_id);
      if (filters?.employment_type) params.append('employment_type', filters.employment_type);

      const response = await apiClient.get(`/people/export?${params.toString()}`, {
        responseType: 'blob',
      });

      // Trigger download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const date = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `users_export_${date}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast.success('Export started — CSV downloaded');
    },
    onError: () => {
      toast.error('Failed to export users');
    },
  });
};
