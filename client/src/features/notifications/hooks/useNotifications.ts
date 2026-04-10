// src/features/notifications/hooks/useNotifications.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type {
  NotificationTemplate,
  InAppNotification,
  NotificationEvent,
  CreateNotificationTemplateInput,
  UpdateNotificationTemplateInput,
  TestTemplateInput,
  TestTemplateResult,
  UnreadCount,
} from '@/types';

/**
 * Fetches all notification templates for the current company.
 * Used on: NotificationsPage
 */
export const useNotificationTemplates = (filters?: { trigger_event?: string; is_active?: boolean }) => {
  return useQuery<NotificationTemplate[]>({
    queryKey: QUERY_KEYS.NOTIFICATION_TEMPLATES,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.trigger_event) params.append('trigger_event', filters.trigger_event);
      if (filters?.is_active !== undefined) params.append('is_active', String(filters.is_active));

      const { data } = await apiClient.get(`/notifications/templates?${params.toString()}`);
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};

/**
 * Fetches a single notification template detail.
 * Used on: NotificationsPage (edit modal)
 */
export const useNotificationTemplateDetail = (templateId: string) => {
  return useQuery<NotificationTemplate>({
    queryKey: QUERY_KEYS.NOTIFICATION_TEMPLATE_DETAIL(templateId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/notifications/templates/${templateId}`);
      return data.data;
    },
    enabled: !!templateId,
    staleTime: 1000 * 60 * 2,
    retry: 2,
  });
};

/**
 * Creates a new notification template.
 * Produces audit event: notification_template.created
 * Used on: NotificationsPage (create modal)
 */
export const useCreateNotificationTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation<NotificationTemplate, Error, CreateNotificationTemplateInput>({
    mutationFn: async (input: CreateNotificationTemplateInput) => {
      const { data } = await apiClient.post('/notifications/templates', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATION_TEMPLATES });
      toast.success('Notification template created');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to create template';
      toast.error(message);
    },
  });
};

/**
 * Updates a notification template.
 * Produces audit event: notification_template.updated
 * Used on: NotificationsPage (edit modal)
 */
export const useUpdateNotificationTemplate = (templateId: string) => {
  const queryClient = useQueryClient();

  return useMutation<NotificationTemplate, Error, UpdateNotificationTemplateInput>({
    mutationFn: async (input: UpdateNotificationTemplateInput) => {
      const { data } = await apiClient.put(`/notifications/templates/${templateId}`, input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATION_TEMPLATES });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATION_TEMPLATE_DETAIL(templateId) });
      toast.success('Template updated');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to update template';
      toast.error(message);
    },
  });
};

/**
 * Soft-deletes a notification template.
 * Produces audit event: notification_template.deleted
 * Used on: NotificationsPage (delete action)
 */
export const useDeleteNotificationTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { template_id: string }>({
    mutationFn: async ({ template_id }: { template_id: string }) => {
      await apiClient.delete(`/notifications/templates/${template_id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATION_TEMPLATES });
      toast.success('Template deleted');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to delete template';
      toast.error(message);
    },
  });
};

/**
 * Tests a template with mock variable substitution.
 * Produces audit event: notification_template.tested
 * Used on: NotificationsPage (test modal)
 */
export const useTestTemplate = (templateId: string) => {
  return useMutation<TestTemplateResult, Error, TestTemplateInput>({
    mutationFn: async (input: TestTemplateInput) => {
      const { data } = await apiClient.post(`/notifications/templates/${templateId}/test`, input);
      return data.data;
    },
    onSuccess: () => {
      toast.success('Template rendered successfully');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      const message = err?.response?.data?.error || 'Failed to test template';
      toast.error(message);
    },
  });
};

/**
 * Fetches in-app notifications for the current user.
 * Used on: TopBar notification bell
 */
export const useInAppNotifications = () => {
  return useQuery<InAppNotification[]>({
    queryKey: QUERY_KEYS.IN_APP_NOTIFICATIONS,
    queryFn: async () => {
      const { data } = await apiClient.get('/notifications/in-app');
      return data.data;
    },
    staleTime: 1000 * 30,
    retry: 2,
    refetchInterval: 1000 * 30,
  });
};

/**
 * Fetches the unread notification count for the current user.
 * Used on: TopBar bell badge
 */
export const useUnreadNotificationCount = () => {
  return useQuery<UnreadCount>({
    queryKey: QUERY_KEYS.UNREAD_NOTIFICATION_COUNT,
    queryFn: async () => {
      const { data } = await apiClient.get('/notifications/in-app/unread-count');
      return data.data;
    },
    staleTime: 1000 * 15,
    retry: 2,
    refetchInterval: 1000 * 15,
  });
};

/**
 * Marks a single in-app notification as read.
 * Produces audit event: notification.read
 * Used on: TopBar notification dropdown
 */
export const useMarkAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation<InAppNotification, Error, { notification_id: string }>({
    mutationFn: async ({ notification_id }: { notification_id: string }) => {
      const { data } = await apiClient.post(`/notifications/in-app/${notification_id}/read`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.IN_APP_NOTIFICATIONS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.UNREAD_NOTIFICATION_COUNT });
    },
    onError: () => {
      toast.error('Failed to mark notification as read');
    },
  });
};

/**
 * Marks all in-app notifications as read.
 * Produces audit event: notification.mark_all_read
 * Used on: TopBar notification dropdown
 */
export const useMarkAllAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation<{ marked_count: number }, Error, void>({
    mutationFn: async () => {
      const { data } = await apiClient.post('/notifications/in-app/mark-all-read');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.IN_APP_NOTIFICATIONS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.UNREAD_NOTIFICATION_COUNT });
      toast.success('All notifications marked as read');
    },
    onError: () => {
      toast.error('Failed to mark all as read');
    },
  });
};

/**
 * Fetches the notification delivery event log.
 * Used on: NotificationsPage (delivery log tab)
 */
export const useNotificationEvents = (filters?: { template_id?: string; status?: string; channel?: string }) => {
  return useQuery<NotificationEvent[]>({
    queryKey: QUERY_KEYS.NOTIFICATION_EVENTS,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.template_id) params.append('template_id', filters.template_id);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.channel) params.append('channel', filters.channel);

      const { data } = await apiClient.get(`/notifications/events?${params.toString()}`);
      return data.data;
    },
    staleTime: 1000 * 60,
    retry: 2,
  });
};
