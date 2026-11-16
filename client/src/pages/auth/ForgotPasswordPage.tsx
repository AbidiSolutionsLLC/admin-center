import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useForgotPassword } from '@/features/auth/hooks/useForgotPassword';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthLayout, AUTH_CARD_CLASS } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import { AuthNotice } from '@/components/ui/AuthNotice';
import { MailCheck } from 'lucide-react';
import { ROUTES } from '@/constants/routes';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const { mutateAsync: requestReset, isPending } = useForgotPassword();
  const [sent, setSent] = useState(false);
  const searchParams = new URLSearchParams(window.location.search);
  const defaultEmail = searchParams.get('email') || '';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: defaultEmail },
  });

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    try {
      await requestReset(data);
      setSent(true);
    } catch (e) {
      // Handled by hook onError
    }
  };

  if (sent) {
    return (
      <AuthNotice
        icon={MailCheck}
        tone="success"
        title="Check your e-mail"
        testId="forgot-sent"
        action={<Link to={ROUTES.LOGIN} className="text-sm font-medium text-primary hover:underline">Back to Login</Link>}
      >
        If an account exists with that email, a password reset link has been sent.
      </AuthNotice>
    );
  }

  return (
    <AuthLayout>
      <Card className={AUTH_CARD_CLASS}>
        <CardHeader className="space-y-2 text-center pb-6">
          <CardTitle className="text-2xl font-semibold tracking-tight">Forgot Password</CardTitle>
          <CardDescription className="text-ink-muted">
            Enter your email to request a password reset link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                {...register('email')}
                className={`flex w-full ${errors.email ? 'border-red-500' : 'border-line'}`}
              />
              {errors.email && (
                <p className="text-sm text-red-500">{errors.email.message}</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary-hover/90 text-black shadow-sm"
              disabled={isPending}
            >
              {isPending ? 'Sending request...' : 'Send Reset Link'}
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
