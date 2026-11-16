import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useResetPassword } from '@/features/auth/hooks/useResetPassword';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthLayout, AUTH_CARD_CLASS } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, useNavigate } from 'react-router-dom';
import { AuthNotice } from '@/components/ui/AuthNotice';
import { Link2Off } from 'lucide-react';
import { ROUTES } from '@/constants/routes';

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters long'),
  confirmPassword: z.string().min(8, 'Password must be at least 8 characters long'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const { mutateAsync: resetPassword, isPending } = useResetPassword();
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: ResetPasswordFormValues) => {
    if (!token || !email) {
      return;
    }
    try {
      await resetPassword({
        token,
        email,
        newPassword: data.newPassword,
      });
      navigate(ROUTES.LOGIN);
    } catch (e) {
      // Handled by hook onError
    }
  };

  if (!token || !email) {
    return (
      <AuthNotice
        icon={Link2Off}
        tone="error"
        title="Invalid Link"
        testId="reset-invalid"
        action={<Link to={ROUTES.FORGOT_PASSWORD} className="text-sm text-primary hover:underline font-medium">Request a new reset link</Link>}
      >
        The password reset link is invalid or missing required parameters.
      </AuthNotice>
    );
  }

  return (
    <AuthLayout>
      <Card className={AUTH_CARD_CLASS}>
        <CardHeader className="space-y-2 text-center pb-6">
          <CardTitle className="text-2xl font-semibold tracking-tight">Set New Password</CardTitle>
          <CardDescription className="text-ink-muted">
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="newPassword">
                New Password
              </label>
              <Input
                id="newPassword"
                type="password"
                {...register('newPassword')}
                className={`flex w-full ${errors.newPassword ? 'border-red-500' : 'border-line'}`}
              />
              {errors.newPassword && (
                <p className="text-sm text-red-500">{errors.newPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="confirmPassword">
                Confirm Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                {...register('confirmPassword')}
                className={`flex w-full ${errors.confirmPassword ? 'border-red-500' : 'border-line'}`}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary-hover/90 text-black shadow-sm"
              disabled={isPending}
            >
              {isPending ? 'Resetting...' : 'Reset Password'}
            </Button>
            <div className="text-center mt-4">
              <Link to={ROUTES.LOGIN} className="text-sm text-ink-muted hover:text-ink font-medium">
                Back to Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
