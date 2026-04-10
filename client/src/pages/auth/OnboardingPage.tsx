import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useSetupPassword } from '@/hooks/useSetupPassword';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { ROUTES } from '@/constants/routes';

const setupPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  token: z.string().min(1, 'Invite token is missing'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SetupPasswordFormValues = z.infer<typeof setupPasswordSchema>;

export default function OnboardingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const emailParam = searchParams.get('email') || '';
  const tokenParam = searchParams.get('token') || '';
  
  const { mutate: setupPassword, isPending, isSuccess } = useSetupPassword();
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetupPasswordFormValues>({
    resolver: zodResolver(setupPasswordSchema),
    defaultValues: {
      email: emailParam,
      token: tokenParam,
    },
  });

  const onSubmit = (data: SetupPasswordFormValues) => {
    setupPassword(data, {
      onSuccess: () => {
        // success toast is handled in hook
        setTimeout(() => navigate(ROUTES.LOGIN), 2000);
      }
    });
  };

  if (isSuccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F7F8FA] p-4 text-ink font-sans">
        <Card className="w-full max-w-md border-line shadow-card text-center">
          <CardHeader className="space-y-4 pb-8">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-2xl font-semibold tracking-tight">Account Activated!</CardTitle>
              <CardDescription className="text-ink-muted mt-2">
                Your password has been set up successfully.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pb-8">
            <p className="text-sm text-ink-secondary mb-6">
              You will be redirected to the login page in a few seconds...
            </p>
            <Button 
              onClick={() => navigate(ROUTES.LOGIN)}
              className="w-full bg-primary hover:bg-primary-hover text-white rounded-md"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#F7F8FA] p-4 text-ink font-sans">
      <Card className="w-full max-w-md border-line shadow-card">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="mx-auto w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center mb-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">Welcome to Admin Center</CardTitle>
          <CardDescription className="text-ink-muted">
            Let's get your account ready by setting up your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Hidden field for token and email if not in URL but we use URL params as default values */}
            <input type="hidden" {...register('token')} />
            
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink" htmlFor="email">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                disabled
                {...register('email')}
                className="bg-surface-alt font-medium"
              />
              {errors.email && (
                <p className="text-xs text-error mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink" htmlFor="newPassword">
                New Password
              </label>
              <Input
                id="newPassword"
                type="password"
                placeholder="At least 8 characters"
                {...register('newPassword')}
                className={errors.newPassword ? 'border-error focus:ring-error/30' : ''}
              />
              {errors.newPassword && (
                <p className="text-xs text-error mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.newPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink" htmlFor="confirmPassword">
                Confirm Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                {...register('confirmPassword')}
                className={errors.confirmPassword ? 'border-error focus:ring-error/30' : ''}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-error mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary-hover text-white h-10 mt-2 font-semibold shadow-sm transition-all active:scale-[0.98]"
              disabled={isPending}
            >
              {isPending ? 'Activating Account...' : 'Set Password & Activate'}
            </Button>
            
            <p className="text-[11px] text-ink-muted text-center mt-4">
              By activating your account, you agree to our terms of service and privacy policy.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
