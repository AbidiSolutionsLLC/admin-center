import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';

interface ForgotPasswordParams {
  email: string;
}

export const useForgotPassword = () => {
  return useMutation({
    mutationFn: async (params: ForgotPasswordParams) => {
      const { data } = await apiClient.post('/auth/request-password-reset', params);
      return data;
    },
    onSuccess: () => {
      toast.success('If an account exists with that email, a password reset link has been sent.');
    },
    onError: (error: any) => {
      console.error('Forgot password failed', error);
      const message = error.response?.data?.error || error.response?.data?.message || 'Failed to request password reset.';
      toast.error(message);
    },
  });
};
