import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';
import type { WorkflowTemplate } from '@/types';

export const useWorkflowTemplates = () => {
  return useQuery({
    queryKey: ['workflow-templates'],
    queryFn: async () => {
      const response = await apiClient.get('/workflow-templates');
      return response.data.data as WorkflowTemplate[];
    },
  });
};

export const useCreateWorkflowTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<WorkflowTemplate>) => {
      const response = await apiClient.post('/workflow-templates', data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
      toast.success('Template created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create template');
    },
  });
};

export const useUpdateWorkflowTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<WorkflowTemplate> }) => {
      const response = await apiClient.put(`/workflow-templates/${id}`, data);
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-templates', (variables as any).id] });
      toast.success('Template updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update template');
    },
  });
};

export const useDeleteWorkflowTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/workflow-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
      toast.success('Template deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete template');
    },
  });
};

export const useInstantiateWorkflowTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await apiClient.post(`/workflow-templates/${id}/instantiate`, { name });
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast.success('Workflow created from template successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to instantiate template');
    },
  });
};

export const useSaveWorkflowAsTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await apiClient.post(`/workflow-templates/from-workflow/${id}`, { name });
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
      toast.success('Workflow saved as template successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to save workflow as template');
    },
  });
};
