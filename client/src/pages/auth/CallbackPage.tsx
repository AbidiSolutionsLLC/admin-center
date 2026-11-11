import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { clearTransient, completeLogin, consumeReturnTo, startLogin } from '@/lib/oidc';
import { clearSession, loadProfile, storeTokens } from '@/lib/session';
import { ROUTES } from '@/constants/routes';

export default function CallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode double-invoke: the code is single-use
    ran.current = true;
    (async () => {
      try {
        const tokens = await completeLogin(window.location.href);
        storeTokens(tokens);
        await loadProfile(tokens.access_token);
        const returnTo = consumeReturnTo();
        clearTransient();
        navigate(returnTo || ROUTES.OVERVIEW, { replace: true });
      } catch (e) {
        clearTransient();
        clearSession();
        setError(e instanceof Error ? e.message : 'Sign-in failed');
      }
    })();
  }, [navigate]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-surface-base p-4 text-ink font-sans">
      <Card className="w-full max-w-md border-line">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl font-semibold tracking-tight">Karbexa Admin</CardTitle>
          <CardDescription className="text-ink-muted">
            {error ? 'We could not complete sign-in' : 'Signing you in...'}
          </CardDescription>
        </CardHeader>
        {error && (
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <Button
              className="w-full bg-primary hover:bg-primary-hover/90 text-white shadow-sm"
              onClick={() => { void startLogin(); }}
            >
              Try again
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
