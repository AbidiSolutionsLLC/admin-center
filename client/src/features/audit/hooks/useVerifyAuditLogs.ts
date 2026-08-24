// src/features/audit/hooks/useVerifyAuditLogs.ts
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';

interface VerificationResponse {
  success: boolean;
  data: {
    total: number;
    tampered: number;
    is_intact: boolean;
    tampered_samples: any[];
  };
}

/**
 * Verifies the integrity of all audit logs for the company.
 * Used on: AuditLogsPage
 */
export const useVerifyAuditLogs = () => {
  return useMutation<VerificationResponse, Error, void>({
    mutationFn: async () => {
      const response = await apiClient.post('/audit-logs/verify');
      return response.data;
    },
    onSuccess: (data) => {
      if (data.data.is_intact) {
        toast.success(`Integrity verified: ${data.data.total.toLocaleString()} logs are unchanged.`);
      } else {
        toast.error(`Integrity compromised: ${data.data.tampered.toLocaleString()} logs have been tampered with!`);
      }
    },
    onError: (error: any) => {
      console.error('Failed to verify audit log integrity', error);
      toast.error(error.response?.data?.error || 'Failed to verify logs. Please try again.');
    },
  });
};
