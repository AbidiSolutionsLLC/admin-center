import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';
import type { ApprovalRequest } from '@/types';

interface ApprovalsResponse {
  success: boolean;
  data: ApprovalRequest[];
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: async () => {
      const response = await apiClient.get<ApprovalsResponse>('/approvals/pending');
      return response.data;
    },
  });
}

export function useApproveRequest() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, comments }: { id: string; comments?: string }) => {
      const response = await apiClient.post(`/approvals/${id}/approve`, { comments });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Approval granted');
      queryClient.invalidateQueries({ queryKey: ['approvals', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['workflows', 'runs'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });
}

export function useRejectRequest() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, comments }: { id: string; comments?: string }) => {
      const response = await apiClient.post(`/approvals/${id}/reject`, { comments });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Approval rejected');
      queryClient.invalidateQueries({ queryKey: ['approvals', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['workflows', 'runs'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to reject: ${error.message}`);
    },
  });
}
