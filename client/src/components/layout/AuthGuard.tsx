// src/components/layout/AuthGuard.tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { ROUTES } from '@/constants/routes';

export const AuthGuard = () => {
  const { accessToken } = useAuthStore();
  const location = useLocation();

  if (!accessToken) {
    return <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />;
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
