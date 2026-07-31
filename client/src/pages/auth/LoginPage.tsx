// src/pages/auth/LoginPage.tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useLogin } from '@/features/auth/hooks/useLogin';
import { useVerifyMfa } from '@/features/auth/hooks/useVerifyMfa';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const mfaSchema = z.object({
  otp_code: z.string().length(6, 'Verification code must be exactly 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type MfaFormValues = z.infer<typeof mfaSchema>;

export default function LoginPage() {
  const [step, setStep] = useState<'login' | 'mfa'>('login');
  const [tempToken, setTempToken] = useState<string>('');

  const { mutateAsync: login, isPending: isLoginPending } = useLogin();
  const { mutateAsync: verifyMfa, isPending: isMfaPending } = useVerifyMfa();
  
  const {
    register: registerLogin,
    handleSubmit: handleSubmitLogin,
    formState: { errors: loginErrors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const {
    register: registerMfa,
    handleSubmit: handleSubmitMfa,
    formState: { errors: mfaErrors },
  } = useForm<MfaFormValues>({
    resolver: zodResolver(mfaSchema),
  });

  const onLoginSubmit = async (data: LoginFormValues) => {
    try {
      const response = await login(data);
      if (response?.requires_mfa) {
        setTempToken(response.temp_token);
        setStep('mfa');
      }
    } catch (e) {
      // Handled by hook onError
    }
  };

  const onMfaSubmit = async (data: MfaFormValues) => {
    try {
      await verifyMfa({
        temp_token: tempToken,
        otp_code: data.otp_code,
      });
    } catch (e) {
      // Handled by hook onError
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-surface-base p-4 text-ink font-sans">
      <Card className="w-full max-w-md border-line">
        <CardHeader className="space-y-2 text-center pb-6">
          <CardTitle className="text-2xl font-semibold tracking-tight">Sowaye</CardTitle>
          <CardDescription className="text-ink-muted">
            {step === 'login' ? 'Sign in to your account to continue' : 'Enter the verification code sent to your email'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'login' ? (
            <form onSubmit={handleSubmitLogin(onLoginSubmit)} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="email">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  {...registerLogin('email')}
                  className={`flex w-full ${loginErrors.email ? 'border-red-500' : 'border-line'}`}
                />
                {loginErrors.email && (
                  <p className="text-sm text-red-500">{loginErrors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium leading-none" htmlFor="password">
                    Password
                  </label>
                  <Link to={ROUTES.FORGOT_PASSWORD} className="text-xs text-primary hover:underline font-medium">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  {...registerLogin('password')}
                  className={`flex w-full ${loginErrors.password ? 'border-red-500' : 'border-line'}`}
                />
                {loginErrors.password && (
                  <p className="text-sm text-red-500">{loginErrors.password.message}</p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary-hover/90 text-white shadow-sm"
                disabled={isLoginPending}
              >
                {isLoginPending ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmitMfa(onMfaSubmit)} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="otp_code">
                  Verification Code
                </label>
                <Input
                  id="otp_code"
                  type="text"
                  placeholder="123456"
                  maxLength={6}
                  autoComplete="one-time-code"
                  {...registerMfa('otp_code')}
                  className={`flex w-full text-center tracking-widest text-lg ${mfaErrors.otp_code ? 'border-red-500' : 'border-line'}`}
                />
                {mfaErrors.otp_code && (
                  <p className="text-sm text-red-500">{mfaErrors.otp_code.message}</p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary-hover/90 text-white shadow-sm"
                disabled={isMfaPending}
              >
                {isMfaPending ? 'Verifying...' : 'Verify Code'}
              </Button>
              <div className="text-center mt-4">
                <Button 
                  type="button" 
                  variant="link" 
                  onClick={() => setStep('login')}
                  className="text-sm text-ink-muted hover:text-ink"
                >
                  Back to login
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
