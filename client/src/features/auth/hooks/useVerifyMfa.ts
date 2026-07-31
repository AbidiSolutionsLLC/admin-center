import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';

interface VerifyMfaData {
  temp_token: string;
  otp_code: string;
}

export const useVerifyMfa = () => {
  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (data: VerifyMfaData) => {
      const response = await apiClient.post('/auth/verify-mfa', data, { _skipErrorNotify: true } as any);
      return response.data.data;
    },
    onSuccess: (data) => {
      setAuth({
        accessToken: data.accessToken,
        companyId: data.user.company_id,
        userRole: data.user.role,
        userId: data.user._id,
        userEmail: data.user.email,
        userName: data.user.full_name,
      });
      toast.success('Successfully logged in');
      navigate(ROUTES.OVERVIEW, { replace: true });
    },
    onError: (error: any) => {
      console.error('MFA verification failed', error);
      const message = error.response?.data?.error || error.response?.data?.message || 'Verification failed. Please check your code.';
      toast.error(message);
    },
  });
};
