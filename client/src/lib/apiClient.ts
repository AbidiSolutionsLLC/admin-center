// src/lib/apiClient.ts
import axios from 'axios';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api/v1',
  withCredentials: true, // for httpOnly cookie (refresh token)
});

// Attach access token to every request
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh & Global Error Handling
apiClient.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config;
    
    // 1. Handle 401 & Token Refresh
    if (err.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/login' && originalRequest.url !== '/auth/refresh') {
      originalRequest._retry = true;
      try {
        const { data } = await apiClient.post('/auth/refresh');
        const token = data.data.accessToken;
        useAuthStore.getState().setAuth({ accessToken: token });
        
        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      }
    }

    // 2. Global Error Notification
    // We skip 401s as they are handled above or lead to login
    // We also skip cases where there's no response (network error) as we might want a different message
    if (err.response && err.response.status !== 401) {
      const errorMessage = err.response.data?.error || err.message || 'An unexpected error occurred';
      const errorCode = err.response.data?.code;
      
      // Optionally format message based on code
      toast.error(errorMessage, {
        description: errorCode ? `Error Code: ${errorCode}` : undefined,
      });
    } else if (!err.response) {
      toast.error('Network error. Please check your connection.');
    }

    return Promise.reject(err);
  }
);
