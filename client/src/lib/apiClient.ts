// src/lib/apiClient.ts
import axios from 'axios';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import { startLogin } from '@/lib/oidc';
import { clearSession, refreshSession } from '@/lib/session';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000/api/v1`,
  timeout: 15000, // 15s timeout for hanging requests
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
    
    // 1. Handle 401: single-flight refresh once, retry; otherwise re-login
    if (err.response?.status === 401 && originalRequest) {
      const code = err.response.data?.code;
      const hasRefresh = !!useAuthStore.getState().refreshToken;
      if (!originalRequest._retry && code !== 'SESSION_REVOKED' && hasRefresh) {
        originalRequest._retry = true;
        try {
          const token = await refreshSession();
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        } catch {
          // fall through to re-login
        }
      }
      clearSession();
      void startLogin(window.location.pathname + window.location.search);
      return Promise.reject(err);
    }

    // 2. Force logout on deactivated/terminated/archived account
    if (err.response?.status === 403 && !originalRequest._retry) {
      const errorData = err.response.data;
      const errorCode = errorData?.code;
      const errorMessage = errorData?.error || errorData?.message || '';

      if (errorCode === 'FORBIDDEN' && /deactivated|terminated|archived/i.test(errorMessage)) {
        clearSession();

        // Only redirect and toast if not already on login page or if it was a background request
        toast.error('Your account is no longer active. You have been logged out.');
        window.location.href = '/login';
        return Promise.reject(err);
      }
    }

    // 3. Global Error Notification
    // Skip notification if _skipErrorNotify is set or if it's a 401 (handled above)
    if (err.response && err.response.status !== 401 && !originalRequest._skipErrorNotify) {
      const errorData = err.response.data;
      const errorCode = errorData?.code;
      let errorMessage = errorData?.error || errorData?.message || err.message || 'An unexpected error occurred';
      
      // Handle Specific Error Codes with Friendly Messages
      if (errorCode === 'INSUFFICIENT_ROLE') {
        errorMessage = 'You do not have the required permissions to perform this action. Please contact your administrator if you believe this is an error.';
      }

      // Ensure the first letter is capitalized for professional look
      const formattedMessage = errorMessage.charAt(0).toUpperCase() + errorMessage.slice(1);

      // Hide technical codes for user-friendly operational errors
      const hiddenCodes = ['DUPLICATE_KEY_ERROR', 'VALIDATION_ERROR', 'DATABASE_VALIDATION_ERROR', 'INSUFFICIENT_ROLE'];
      const shouldShowDescription = errorCode && !hiddenCodes.includes(errorCode);

      toast.error(formattedMessage, {
        description: shouldShowDescription ? `Error Code: ${errorCode}` : undefined,
        duration: 5000,
      });
    } else if (!err.response && !originalRequest?._skipErrorNotify) {
      toast.error('Network error. Please check your internet connection and try again.');
    }

    return Promise.reject(err);
  }
);
