// src/features/auth/hooks/useLogin.ts
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';

export const useLogin = () => {
  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (credentials: Record<string, string>) => {
      const { data } = await apiClient.post('/auth/login', credentials, { _skipErrorNotify: true } as any);
      return data.data;
    },
    onSuccess: (data) => {
      if (data.requires_mfa) {
        return; // Handled in the component via mutateAsync or onSuccess callback
      }
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
    onError: (error: any, variables) => {
      console.error('Login failed', error);
      const code = error.response?.data?.code;
      const message = error.response?.data?.error || error.response?.data?.message || 'Login failed. Please check your credentials.';
      toast.error(message);
      
      if (code === 'PASSWORD_EXPIRED') {
        const email = variables?.email;
        if (email) {
          navigate(`${ROUTES.FORGOT_PASSWORD}?email=${encodeURIComponent(email)}`);
        } else {
          navigate(ROUTES.FORGOT_PASSWORD);
        }
      }
    },
  });
};
