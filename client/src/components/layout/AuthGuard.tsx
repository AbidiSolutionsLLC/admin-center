// src/components/layout/AuthGuard.tsx
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { ROUTES } from '@/constants/routes';
import { startLogin } from '@/lib/oidc';
import { clearSession, refreshSession } from '@/lib/session';

export const AuthGuard = () => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const location = useLocation();

  useEffect(() => {
    if (accessToken) return;
    const returnTo = location.pathname + location.search;
    if (useAuthStore.getState().refreshToken) {
      refreshSession().catch(() => {
        clearSession();
        void startLogin(returnTo);
      });
    } else {
      void startLogin(returnTo);
    }
  }, [accessToken, location.pathname, location.search]);

  if (!accessToken) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface-base text-ink-muted text-sm">
        Signing you in...
      </div>
    );
  }

  return <Outlet />;
};

export const GuestGuard = () => {
  const { accessToken } = useAuthStore();

  if (accessToken) {
    return <Navigate to={ROUTES.OVERVIEW} replace />;
  }

  return <Outlet />;
};
