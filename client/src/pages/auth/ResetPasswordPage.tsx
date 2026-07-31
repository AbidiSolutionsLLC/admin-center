import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useResetPassword } from '@/features/auth/hooks/useResetPassword';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, useNavigate } from 'react-router-dom';
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
      <div className="flex h-screen w-full items-center justify-center bg-surface-base p-4 text-ink font-sans">
        <Card className="w-full max-w-md border-line shadow-sm">
          <CardHeader className="space-y-2 text-center pb-6">
            <CardTitle className="text-2xl font-semibold tracking-tight text-red-500">Invalid Link</CardTitle>
            <CardDescription className="text-ink-muted">
              The password reset link is invalid or missing required parameters.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link to={ROUTES.FORGOT_PASSWORD} className="text-sm text-primary hover:underline font-medium">
              Request a new reset link
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-surface-base p-4 text-ink font-sans">
      <Card className="w-full max-w-md border-line shadow-sm">
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
              className="w-full bg-primary hover:bg-primary-hover/90 text-white shadow-sm"
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
    </div>
  );
}
