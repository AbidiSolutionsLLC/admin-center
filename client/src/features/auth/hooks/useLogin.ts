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
      const { data } = await apiClient.post('/auth/login', credentials);
      return data.data;
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
      console.error('Login failed', error);
    },
  });
};
