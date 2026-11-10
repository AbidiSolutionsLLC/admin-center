import { create } from 'zustand';
import type { UserRole } from '../types';

export type AdminRole = UserRole | 'super_admin' | 'hr_admin' | 'it_admin' | 'ops_admin' | 'manager' | 'compliance';

// Tokens are held in memory only (no persist middleware, no web storage).
interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null; // epoch ms
  companyId: string | null;
  userRole: AdminRole | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  isLoading: boolean;
  setAuth: (payload: Partial<Omit<AuthState, 'isLoading' | 'setAuth' | 'clearAuth'>>) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  companyId: null,
  userRole: null,
  userId: null,
  userEmail: null,
  userName: null,
  isLoading: false,
  setAuth: (payload) => set((state) => ({ ...state, ...payload })),
  clearAuth: () => set({
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    companyId: null,
    userRole: null,
    userId: null,
    userEmail: null,
    userName: null,
  }),
}));
