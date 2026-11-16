// src/components/ui/AuthNotice.tsx
// One notice for the signed-out pages (Plan 2.3): icon, title, explanation and at most one action.
// Used by the activation page (expired, superseded, already used, revoked, not found) and by forgot/reset password.
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthLayout, AUTH_CARD_CLASS } from '@/components/layout/AuthLayout';

type Tone = 'info' | 'success' | 'warning' | 'error';

const TONE: Record<Tone, { ring: string; icon: string }> = {
  info: { ring: 'bg-primary-light', icon: 'text-primary' },
  success: { ring: 'bg-emerald-50', icon: 'text-emerald-600' },
  warning: { ring: 'bg-primary-light', icon: 'text-warning' },
  error: { ring: 'bg-red-50', icon: 'text-error' },
};

interface AuthNoticeProps {
  icon: LucideIcon;
  tone?: Tone;
  title: string;
  /** The explanation under the title. */
  children?: ReactNode;
  /** The one action (a button or link). Omit when the only advice is "contact your administrator". */
  action?: ReactNode;
  /** Stable hook for browser tests, for example `invite-expired`. */
  testId?: string;
}

export function AuthNotice({ icon: Icon, tone = 'info', title, children, action, testId }: AuthNoticeProps) {
  const t = TONE[tone];
  return (
    <AuthLayout>
      <Card className={`${AUTH_CARD_CLASS} text-center`} data-testid={testId} role="status">
        <CardHeader className="space-y-4 pb-6">
          <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${t.ring}`}>
            <Icon className={`h-6 w-6 ${t.icon}`} aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold tracking-tight">{title}</CardTitle>
            {children ? <CardDescription className="mt-2 text-ink-muted">{children}</CardDescription> : null}
          </div>
        </CardHeader>
        {action ? <CardContent className="pb-8">{action}</CardContent> : null}
      </Card>
    </AuthLayout>
  );
}
