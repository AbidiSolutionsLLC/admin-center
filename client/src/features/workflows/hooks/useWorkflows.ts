// src/features/workflows/hooks/useWorkflows.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type {
  Workflow,
  WorkflowStep,
  WorkflowRun,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  CreateWorkflowStepInput,
  ReorderStepsInput,
  TestWorkflowInput,
  WorkflowTestResult,
} from '@/types';

/**
 * Fetches all workflows for the current company.
 * Used on: WorkflowsPage
 */
export const useWorkflows = (filters?: { status?: string }) => {
  return useQuery<Workflow[]>({
    queryKey: QUERY_KEYS.WORKFLOWS,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);

      const { data } = await apiClient.get(`/workflows?${params.toString()}`);
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};

/**
 * Fetches a single workflow with its steps.
 * Used on: WorkflowsPage (detail view)
 */
export const useWorkflowDetail = (workflowId: string) => {
  return useQuery<Workflow & { steps: WorkflowStep[] }>({
    queryKey: QUERY_KEYS.WORKFLOW_DETAIL(workflowId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/workflows/${workflowId}`);
      return data.data;
    },
    enabled: !!workflowId,
    staleTime: 1000 * 60 * 2,
    retry: 2,
  });
};

/**
 * Creates a new workflow in draft status.
 * Produces audit event: workflow.created
 * Used on: WorkflowsPage (create modal)
 */
export const useCreateWorkflow = () => {
  const queryClient = useQueryClient();

  return useMutation<Workflow, Error, CreateWorkflowInput>({
    mutationFn: async (input: CreateWorkflowInput) => {
      const { data } = await apiClient.post('/workflows', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORKFLOWS });
      toast.success('Workflow created');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to create workflow';
      toast.error(message);
    },
  });
};

/**
 * Updates a draft workflow.
 * Produces audit event: workflow.updated
 * Used on: WorkflowsPage (edit modal)
 */
export const useUpdateWorkflow = (workflowId: string) => {
  const queryClient = useQueryClient();

  return useMutation<Workflow, Error, UpdateWorkflowInput>({
    mutationFn: async (input: UpdateWorkflowInput) => {
      const { data } = await apiClient.put(`/workflows/${workflowId}`, input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORKFLOWS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORKFLOW_DETAIL(workflowId) });
      toast.success('Workflow updated');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to update workflow';
      toast.error(message);
    },
  });
};

/**
 * Enables a draft workflow.
 * Produces audit event: workflow.enabled
 * Used on: WorkflowsPage (status actions)
 */
export const useEnableWorkflow = (workflowId: string) => {
  const queryClient = useQueryClient();

  return useMutation<Workflow, Error, void>({
    mutationFn: async () => {
      const { data } = await apiClient.post(`/workflows/${workflowId}/enable`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORKFLOWS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORKFLOW_DETAIL(workflowId) });
      toast.success('Workflow enabled');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to enable workflow';
      toast.error(message);
    },
  });
};

/**
 * Disables an enabled workflow.
 * Produces audit event: workflow.disabled
 * Used on: WorkflowsPage (status actions)
 */
export const useDisableWorkflow = (workflowId: string) => {
  const queryClient = useQueryClient();

  return useMutation<Workflow, Error, void>({
    mutationFn: async () => {
      const { data } = await apiClient.post(`/workflows/${workflowId}/disable`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORKFLOWS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORKFLOW_DETAIL(workflowId) });
      toast.success('Workflow disabled');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to disable workflow';
      toast.error(message);
    },
  });
};

/**
 * Deletes a draft workflow.
 * Produces audit event: workflow.deleted
 * Used on: WorkflowsPage (delete action)
 */
export const useDeleteWorkflow = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { workflow_id: string }>({
    mutationFn: async ({ workflow_id }: { workflow_id: string }) => {
      await apiClient.delete(`/workflows/${workflow_id}`);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORKFLOWS });
      toast.success('Workflow deleted');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to delete workflow';
      toast.error(message);
    },
  });
};

/**
 * Adds a step to a workflow.
 * Produces audit event: workflow.step_added
 * Used on: WorkflowsPage (step builder)
 */
export const useAddWorkflowStep = (workflowId: string) => {
  const queryClient = useQueryClient();

  return useMutation<WorkflowStep, Error, CreateWorkflowStepInput>({
    mutationFn: async (input: CreateWorkflowStepInput) => {
      const { data } = await apiClient.post(`/workflows/${workflowId}/steps`, input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORKFLOW_DETAIL(workflowId) });
      toast.success('Step added');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to add step';
      toast.error(message);
    },
  });
};

/**
 * Updates an existing workflow step.
 * Produces audit event: workflow.step_updated
 * Used on: WorkflowsPage (step builder)
 */
export const useUpdateWorkflowStep = (workflowId: string, stepId: string) => {
  const queryClient = useQueryClient();

  return useMutation<WorkflowStep, Error, Partial<CreateWorkflowStepInput>>({
    mutationFn: async (input: Partial<CreateWorkflowStepInput>) => {
      const { data } = await apiClient.put(
        `/workflows/${workflowId}/steps/${stepId}`,
        input
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORKFLOW_DETAIL(workflowId) });
      toast.success('Step updated');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to update step';
      toast.error(message);
    },
  });
};

/**
 * Deletes a workflow step.
 * Produces audit event: workflow.step_deleted
 * Used on: WorkflowsPage (step builder)
 */
export const useDeleteWorkflowStep = (workflowId: string) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { step_id: string }>({
    mutationFn: async ({ step_id }: { step_id: string }) => {
      await apiClient.delete(`/workflows/${workflowId}/steps/${step_id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORKFLOW_DETAIL(workflowId) });
      toast.success('Step deleted');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to delete step';
      toast.error(message);
    },
  });
};

/**
 * Reorders workflow steps (drag-and-drop).
 * Produces audit event: workflow.steps_reordered
 * Used on: WorkflowsPage (step builder)
 */
export const useReorderWorkflowSteps = (workflowId: string) => {
  const queryClient = useQueryClient();

  return useMutation<WorkflowStep[], Error, ReorderStepsInput>({
    mutationFn: async (input: ReorderStepsInput) => {
      const { data } = await apiClient.post(
        `/workflows/${workflowId}/steps/reorder`,
        input
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORKFLOW_DETAIL(workflowId) });
      toast.success('Steps reordered');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to reorder steps';
      toast.error(message);
    },
  });
};

/**
 * Fetches execution history for a workflow.
 * Used on: WorkflowsPage (runs tab)
 */
export const useWorkflowRuns = (workflowId: string) => {
  return useQuery<WorkflowRun[]>({
    queryKey: QUERY_KEYS.WORKFLOW_RUNS(workflowId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/workflows/${workflowId}/runs`);
      return data.data;
    },
    enabled: !!workflowId,
    staleTime: 1000 * 60 * 1,
    retry: 2,
  });
};

/**
 * Tests a workflow with a mock payload.
 * Produces audit event: workflow.tested
 * Used on: WorkflowsPage (test modal)
 */
export const useTestWorkflow = (workflowId: string) => {
  const queryClient = useQueryClient();

  return useMutation<WorkflowTestResult, Error, TestWorkflowInput>({
    mutationFn: async (input: TestWorkflowInput) => {
      const { data } = await apiClient.post(`/workflows/${workflowId}/test`, input);
      return data.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WORKFLOW_RUNS(workflowId) });
      if (result.status === 'success') {
        toast.success('Workflow test passed');
      } else {
        toast.error(`Test failed: ${result.errorMessage || 'Unknown error'}`);
      }
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to test workflow';
      toast.error(message);
    },
  });
};
