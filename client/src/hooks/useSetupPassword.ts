import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { toast } from 'sonner';

interface SetupPasswordParams {
  email?: string; // optional: the token identifies the user
  token: string;
  newPassword: string;
}

export const useSetupPassword = () => {
  return useMutation({
    mutationFn: async (params: SetupPasswordParams) => {
      const { data } = await apiClient.post('/auth/setup-password', params, { _skipErrorNotify: true } as Record<string, unknown>);
      return data;
    },
    onSuccess: () => {
      toast.success('Password set up successfully! You can now log in.');
    },
    // The activation page shows the outcome itself (invite codes) or the server message (password policy).
    onError: (error: any) => {
      console.error('Password setup failed', error);
    },
  });
};
