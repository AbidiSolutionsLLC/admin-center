import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { completeOperatorLogin, startOperatorLogin, useOperatorAuthStore } from '@/features/operator/operatorAuth';
import { ROUTES } from '@/constants/routes';

export default function OperatorCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // code is single-use (StrictMode double-invoke)
    ran.current = true;
    completeOperatorLogin(window.location.href)
      .then((returnTo) => navigate(returnTo || ROUTES.OPERATOR_ORGS, { replace: true }))
      .catch((e) => {
        useOperatorAuthStore.getState().clear();
        setError(e instanceof Error ? e.message : 'Sign-in failed');
      });
  }, [navigate]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-surface-base text-ink text-sm">
      {error ? (
        <div className="text-center space-y-3">
          <p className="text-red-500">{error}</p>
          <Button onClick={() => { void startOperatorLogin(); }}>Try again</Button>
        </div>
      ) : 'Signing you in as operator...'}
    </div>
  );
}
