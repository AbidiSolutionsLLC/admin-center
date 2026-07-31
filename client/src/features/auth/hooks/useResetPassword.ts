import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';

interface ResetPasswordParams {
  email: string;
  token: string;
  newPassword: string;
}

export const useResetPassword = () => {
  return useMutation({
    mutationFn: async (params: ResetPasswordParams) => {
      const { data } = await apiClient.post('/auth/reset-password', params);
      return data;
    },
    onSuccess: () => {
      toast.success('Password reset successfully. You can now log in.');
    },
    onError: (error: any) => {
      console.error('Reset password failed', error);
      const message = error.response?.data?.error || error.response?.data?.message || 'Failed to reset password.';
      toast.error(message);
    },
  });
};
