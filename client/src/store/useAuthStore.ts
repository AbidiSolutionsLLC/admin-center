// src/store/useAuthStore.ts
import { create } from 'zustand';

export type AdminRole = 'super_admin' | 'hr_admin' | 'it_admin' | 'ops_admin' | 'manager' | 'compliance';

interface AuthState {
  accessToken: string | null;
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
  companyId: null,
  userRole: null,
  userId: null,
  userEmail: null,
  userName: null,
  isLoading: false,
  setAuth: (payload) => set((state) => ({ ...state, ...payload })),
  clearAuth: () => set({
    accessToken: null,
    companyId: null,
    userRole: null,
    userId: null,
    userEmail: null,
    userName: null,
  }),
}));
