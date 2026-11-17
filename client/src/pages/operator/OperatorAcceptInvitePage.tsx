// Plan 04 C2: an invited Karbexa operator sets a password from the e-mail link, then signs in to the Command Center,
// where the first sign-in enrols an authenticator (TOTP is mandatory for operators). Public page: no operator session.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { AlertCircle, CheckCircle2, Clock, Link2Off, MailPlus, ShieldCheck, ShieldX } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthLayout, AUTH_CARD_CLASS } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthNotice } from '@/components/ui/AuthNotice';
import { isInviteProblemCode, type InviteProblemCode } from '@/features/auth/hooks/useInvitation';
import { useAcceptOperatorInvite, useVerifyOperatorInvite } from '@/features/operator/useOperatorInvite';
import { startOperatorLogin } from '@/features/operator/operatorAuth';
import { ROUTES } from '@/constants/routes';

const schema = z.object({
  password: z.string().min(12, 'Use at least 12 characters'),
  confirm: z.string().min(1, 'Repeat your password'),
}).refine((d) => d.password === d.confirm, { message: "Passwords don't match", path: ['confirm'] });
type FormValues = z.infer<typeof schema>;

const PRIMARY_BUTTON = 'w-full bg-primary hover:bg-primary-hover text-black rounded-md';
const ROLE_LABEL: Record<string, string> = { platform_admin: 'Platform admin', operations: 'Operations', support: 'Support', auditor: 'Auditor' };

const formatDate = (iso?: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { dateStyle: 'long' });
};

const signIn = () => void startOperatorLogin(ROUTES.OPERATOR_OVERVIEW);

export default function OperatorAcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const verify = useVerifyOperatorInvite(token);
  const accept = useAcceptOperatorInvite();
  const [lateProblem, setLateProblem] = useState<InviteProblemCode | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });

  const onSubmit = (v: FormValues) => {
    setFormError(null);
    accept.mutate({ token, password: v.password }, {
      onError: (err: any) => {
        const code = err.response?.data?.code;
        if (isInviteProblemCode(code)) setLateProblem(code);
        else setFormError(err.response?.data?.error || 'Could not set your password. Try again.');
      },
    });
  };

  if (accept.isSuccess) {
    return (
      <AuthNotice
        icon={ShieldCheck}
        tone="success"
        title="Your password is set"
        testId="op-invite-done"
        action={<Button onClick={signIn} className={PRIMARY_BUTTON}>Sign in to the Command Center</Button>}
      >
        Sign in now. You will be asked to scan a QR code with an authenticator app: every operator sign-in needs a code from it.
      </AuthNotice>
    );
  }

  if (token && verify.isLoading) return <AuthNotice icon={Clock} title="Checking your link…" testId="op-invite-checking" />;

  if (token && verify.isError) {
    return (
      <AuthNotice icon={ShieldX} tone="error" title="We could not check your link" testId="op-invite-error"
        action={<Button onClick={() => verify.refetch()} className={PRIMARY_BUTTON}>Try again</Button>}>
        Check your connection and try again. Command Center links only work from an approved network.
      </AuthNotice>
    );
  }

  const verifyProblem = verify.data && !verify.data.ok ? verify.data : null;
  const problem: InviteProblemCode | null = lateProblem ?? verifyProblem?.code ?? (token ? null : 'INVITE_NOT_FOUND');
  const problemDate = formatDate(verifyProblem?.at);
  const askAdmin = 'Ask a platform administrator to send you a new invitation.';

  if (problem) {
    switch (problem) {
      case 'INVITE_EXPIRED':
        return <AuthNotice icon={Clock} tone="warning" title="This link has expired" testId="op-invite-expired">{problemDate ? `This link expired on ${problemDate}. ` : ''}{askAdmin}</AuthNotice>;
      case 'INVITE_SUPERSEDED':
        return <AuthNotice icon={MailPlus} tone="warning" title="A newer link was sent" testId="op-invite-superseded">Use the latest invitation e-mail.</AuthNotice>;
      case 'INVITE_ALREADY_USED':
        return (
          <AuthNotice icon={CheckCircle2} tone="success" title="Already set up" testId="op-invite-used"
            action={<Button onClick={signIn} className={PRIMARY_BUTTON}>Sign in</Button>}>
            This account is already set up.
          </AuthNotice>
        );
      case 'INVITE_REVOKED':
        return <AuthNotice icon={ShieldX} tone="error" title="Invitation cancelled" testId="op-invite-revoked">This invitation was cancelled. {askAdmin}</AuthNotice>;
      default:
        return <AuthNotice icon={Link2Off} tone="error" title="This link is not valid" testId="op-invite-not-found">Check that you copied the whole link from the e-mail.</AuthNotice>;
    }
  }

  const invited = verify.data && verify.data.ok ? verify.data : null;
  return (
    <AuthLayout>
      <Card className={AUTH_CARD_CLASS} data-testid="op-invite-form">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="mx-auto w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center mb-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">Join the Karbexa Command Center</CardTitle>
          <CardDescription className="text-ink-muted">
            {invited ? `Hi ${invited.full_name}, set a password for your operator account.` : 'Set a password for your operator account.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink" htmlFor="op-email">Email address</label>
              <Input id="op-email" type="email" value={invited?.email ?? ''} readOnly aria-readonly="true" className="cursor-not-allowed opacity-80" />
              {invited && invited.roles.length > 0 && (
                <p className="text-xs text-ink-muted">Role: {invited.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink" htmlFor="op-password">New password</label>
              <Input id="op-password" type="password" autoComplete="new-password" placeholder="At least 12 characters" {...register('password')}
                className={errors.password ? 'border-error focus:ring-error/30' : ''} />
              {errors.password && <p className="text-xs text-error mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.password.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink" htmlFor="op-confirm">Confirm password</label>
              <Input id="op-confirm" type="password" autoComplete="new-password" placeholder="Repeat your password" {...register('confirm')}
                className={errors.confirm ? 'border-error focus:ring-error/30' : ''} />
              {errors.confirm && <p className="text-xs text-error mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.confirm.message}</p>}
            </div>
            {formError && <p role="alert" className="text-xs text-error flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {formError}</p>}
            <Button type="submit" disabled={accept.isPending} className="w-full bg-primary hover:bg-primary-hover text-black h-10 mt-2 font-semibold">
              {accept.isPending ? 'Setting up…' : 'Set password'}
            </Button>
            <p className="text-[11px] text-ink-muted text-center">After this you will set up an authenticator app at your first sign-in.</p>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
