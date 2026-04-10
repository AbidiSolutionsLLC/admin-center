import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { toast } from 'sonner';

interface SetupPasswordParams {
  email: string;
  token: string;
  newPassword: string;
}

export const useSetupPassword = () => {
  return useMutation({
    mutationFn: async (params: SetupPasswordParams) => {
      const { data } = await apiClient.post('/auth/setup-password', params);
      return data;
    },
    onSuccess: () => {
      toast.success('Password set up successfully! You can now log in.');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to set up password';
      toast.error(message);
    },
  });
};
