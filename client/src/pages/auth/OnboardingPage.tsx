import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useSetupPassword } from '@/hooks/useSetupPassword';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthLayout, AUTH_CARD_CLASS } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthNotice } from '@/components/ui/AuthNotice';
import { useVerifyInvite, useRenewInvite, isInviteProblemCode } from '@/features/auth/hooks/useInvitation';
import type { InviteProblemCode } from '@/features/auth/hooks/useInvitation';
import { AlertCircle, CheckCircle2, Clock, MailCheck, MailPlus, Link2Off, ShieldX } from 'lucide-react';
import { ROUTES } from '@/constants/routes';

const setupPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SetupPasswordFormValues = z.infer<typeof setupPasswordSchema>;

const formatDate = (iso?: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { dateStyle: 'long' });
};

const PRIMARY_BUTTON = 'w-full bg-primary hover:bg-primary-hover text-black rounded-md';

export default function OnboardingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenParam = searchParams.get('token') || '';

  const verify = useVerifyInvite(tokenParam);
  const renew = useRenewInvite();
  const { mutate: setupPassword, isPending, isSuccess } = useSetupPassword();
  // A problem found at submit time (for example the link was used in another tab), and a non-invite error message.
  const [lateProblem, setLateProblem] = useState<InviteProblemCode | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetupPasswordFormValues>({
    resolver: zodResolver(setupPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = (data: SetupPasswordFormValues) => {
    setFormError(null);
    // The e-mail is not sent: the token identifies the user.
    setupPassword({ token: tokenParam, newPassword: data.newPassword }, {
      onSuccess: () => {
        // success toast is handled in hook
        setTimeout(() => navigate(ROUTES.LOGIN), 2000);
      },
      onError: (error: any) => {
        const code = error.response?.data?.code;
        if (isInviteProblemCode(code)) setLateProblem(code);
        else setFormError(error.response?.data?.error || 'Could not set your password. Try again.');
      },
    });
  };

  // The page decides what to show from the verify answer.
  const verifyProblem = verify.data && !verify.data.ok ? verify.data : null;
  const problem: InviteProblemCode | null = lateProblem ?? verifyProblem?.code ?? (tokenParam ? null : 'INVITE_NOT_FOUND');
  const problemDate = formatDate(verifyProblem?.at);

  if (isSuccess) {
    return (
      <AuthLayout>
        <Card className={`${AUTH_CARD_CLASS} text-center`}>
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
            <Button onClick={() => navigate(ROUTES.LOGIN)} className={PRIMARY_BUTTON}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  if (tokenParam && verify.isLoading) {
    return <AuthNotice icon={Clock} title="Checking your link…" testId="invite-checking" />;
  }

  if (tokenParam && verify.isError) {
    return (
      <AuthNotice
        icon={ShieldX}
        tone="error"
        title="We could not check your link"
        testId="invite-error"
        action={<Button onClick={() => verify.refetch()} className={PRIMARY_BUTTON}>Try again</Button>}
      >
        Check your connection and try again.
      </AuthNotice>
    );
  }

  if (renew.isSuccess) {
    return (
      <AuthNotice icon={MailCheck} tone="success" title="Check your e-mail" testId="invite-renewed">
        If this link can be renewed, a new one is on its way to the address your invitation was sent to.
      </AuthNotice>
    );
  }

  if (problem) {
    const renewAction = (
      <Button onClick={() => renew.mutate(tokenParam)} disabled={renew.isPending} className={PRIMARY_BUTTON}>
        {renew.isPending ? 'Sending…' : 'Send me a new link'}
      </Button>
    );
    switch (problem) {
      case 'INVITE_EXPIRED':
        return (
          <AuthNotice icon={Clock} tone="warning" title="This link has expired" testId="invite-expired" action={renewAction}>
            {problemDate ? `This link expired on ${problemDate}.` : 'This link has expired.'}
          </AuthNotice>
        );
      case 'INVITE_SUPERSEDED':
        return (
          <AuthNotice icon={MailPlus} tone="warning" title="A newer link was sent" testId="invite-superseded" action={renewAction}>
            {problemDate ? `A newer link was sent on ${problemDate}. Use the latest e-mail.` : 'A newer link was sent. Use the latest e-mail.'}
          </AuthNotice>
        );
      case 'INVITE_ALREADY_USED':
        return (
          <AuthNotice
            icon={CheckCircle2}
            tone="success"
            title="Already set up"
            testId="invite-used"
            action={<Button onClick={() => navigate(ROUTES.LOGIN)} className={PRIMARY_BUTTON}>Sign in</Button>}
          >
            This account is already set up.
          </AuthNotice>
        );
      case 'INVITE_REVOKED':
        return (
          <AuthNotice icon={ShieldX} tone="error" title="Invitation cancelled" testId="invite-revoked">
            This invitation was cancelled. Contact your administrator.
          </AuthNotice>
        );
      default:
        return (
          <AuthNotice
            icon={Link2Off}
            tone="error"
            title="This link is not valid"
            testId="invite-not-found"
            action={<Link to={ROUTES.LOGIN} className="text-sm font-medium text-primary hover:underline">Go to sign in</Link>}
          >
            Check that you copied the whole link.
          </AuthNotice>
        );
    }
  }

  const verified = verify.data && verify.data.ok ? verify.data : null;

  return (
    <AuthLayout>
      <Card className={AUTH_CARD_CLASS} data-testid="invite-form">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="mx-auto w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center mb-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">Welcome to Karbexa Admin</CardTitle>
          <CardDescription className="text-ink-muted">
            Let's get your account ready by setting up your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink" htmlFor="email">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                value={verified?.email ?? ''}
                readOnly
                aria-readonly="true"
                className="cursor-not-allowed opacity-80"
              />
              {verified?.company_name && (
                <p className="text-xs text-ink-muted">Joining {verified.company_name}</p>
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

            {formError && (
              <p role="alert" className="text-xs text-error flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {formError}
              </p>
            )}

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary-hover text-black h-10 mt-2 font-semibold shadow-sm transition-all active:scale-[0.98]"
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
    </AuthLayout>
  );
}
