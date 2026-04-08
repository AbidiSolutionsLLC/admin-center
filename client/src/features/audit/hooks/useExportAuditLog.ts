// src/features/audit/hooks/useExportAuditLog.ts
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';

interface ExportFilters {
  module?: string;
  action?: string;
  search?: string;
  actor_email?: string;
  date_from?: string;
  date_to?: string;
}

/**
 * Exports audit log to CSV file.
 * Downloads the file directly via browser (no data returned to JS).
 * Used on: AuditLogsPage
 */
export const useExportAuditLog = () => {
  return useMutation<unknown, Error, ExportFilters>({
    mutationFn: async (filters) => {
      const searchParams = new URLSearchParams();
      if (filters.module) searchParams.set('module', filters.module);
      if (filters.action) searchParams.set('action', filters.action);
      if (filters.search) searchParams.set('search', filters.search);
      if (filters.actor_email) searchParams.set('actor_email', filters.actor_email);
      if (filters.date_from) searchParams.set('date_from', filters.date_from);
      if (filters.date_to) searchParams.set('date_to', filters.date_to);

      // Use fetch blob for file download
      const response = await apiClient.get(`/audit-logs/export/csv?${searchParams.toString()}`, {
        responseType: 'blob',
      });

      // Create blob and download
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Extract filename from Content-Disposition header
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'audit-log-export.csv';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/i);
        if (match) {
          filename = match[1];
        }
      }

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      return response;
    },
    onSuccess: () => {
      toast.success('Audit log exported successfully');
    },
    onError: (error) => {
      console.error('Failed to export audit log', error);
      toast.error('Failed to export audit log. Please try again.');
    },
  });
};
