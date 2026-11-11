// src/pages/auth/LoginPage.tsx
import { Link, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';
import { startLogin } from '@/lib/oidc';

export default function LoginPage() {
  const location = useLocation();
  const signedOut = Boolean((location.state as { signedOut?: boolean } | null)?.signedOut)
    || new URLSearchParams(location.search).has('signed_out');

  return (
    <div className="flex h-screen w-full items-center justify-center bg-surface-base p-4 text-ink font-sans">
      <Card className="w-full max-w-md border-line">
        <CardHeader className="space-y-2 text-center pb-6">
          <CardTitle className="text-2xl font-semibold tracking-tight">Karbexa Admin</CardTitle>
          <CardDescription className="text-ink-muted">Sign in to your account to continue</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {signedOut && (
            <p className="text-sm text-center text-ink-muted">You have been signed out.</p>
          )}
          <Button
            type="button"
            className="w-full bg-primary hover:bg-primary-hover/90 text-white shadow-sm"
            onClick={() => { void startLogin(); }}
          >
            Sign in
          </Button>
          <div className="text-center">
            <Link to={ROUTES.FORGOT_PASSWORD} className="text-xs text-primary hover:underline font-medium">
              Forgot password?
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
