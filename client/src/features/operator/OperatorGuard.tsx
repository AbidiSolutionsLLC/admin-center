import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { refreshOperatorSession, startOperatorLogin, useOperatorAuthStore } from './operatorAuth';

export const OperatorGuard = () => {
  const accessToken = useOperatorAuthStore((s) => s.accessToken);
  const location = useLocation();
  const isOperatorPath = location.pathname === '/operator' || location.pathname.startsWith('/operator/');

  useEffect(() => {
    if (accessToken || !isOperatorPath) return;
    const returnTo = location.pathname + location.search;
    if (useOperatorAuthStore.getState().refreshToken) {
      refreshOperatorSession().catch(() => {
        useOperatorAuthStore.getState().clear();
        void startOperatorLogin(returnTo);
      });
    } else {
      void startOperatorLogin(returnTo);
    }
  }, [accessToken, isOperatorPath, location.pathname, location.search]);

  if (!accessToken) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface-base text-ink-muted text-sm">
        Redirecting to operator sign-in...
      </div>
    );
  }
  return <Outlet />;
};
