// src/features/people/components/InvitationPanel.tsx
// Plan 2.4: what happened to this member's invitation, and the three things an admin can do about it.
import { useState } from 'react';
import { Mail, Link2, Ban, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useResendInvite } from '../hooks/useResendInvite';
import { useUserInvitation, useRevokeInvitation, useCopyInviteLink } from '../hooks/useUserInvitation';
import type { InvitationPanelState } from '../hooks/useUserInvitation';

const STATE_LABEL: Record<InvitationPanelState, { text: string; cls: string }> = {
  pending: { text: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  expired: { text: 'Expired', cls: 'bg-red-50 text-red-700 border-red-200' },
  accepted: { text: 'Accepted', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  revoked: { text: 'Revoked', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  superseded: { text: 'Replaced by a newer link', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const DELIVERY_LABEL: Record<string, string> = {
  queued: 'Queued, not sent yet',
  sending: 'Sending',
  sent: 'Delivered to the mail server',
  failed: 'Failed',
};

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : 'n/a');

const BUTTON = 'h-9 px-3 text-sm font-medium rounded-md border border-line bg-white hover:bg-surface-alt flex items-center gap-2 disabled:opacity-50';

export function InvitationPanel({ userId }: { userId: string }) {
  const { data, isLoading } = useUserInvitation(userId);
  const resend = useResendInvite();
  const revoke = useRevokeInvitation(userId);
  const copy = useCopyInviteLink(userId);
  const [confirm, setConfirm] = useState<'revoke' | 'copy' | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const inv = data?.invitation;
  if (isLoading || !inv) return null;
  const delivery = data?.delivery;
  const state = STATE_LABEL[inv.state];

  const onCopy = () => {
    copy.mutate(undefined, {
      onSuccess: async (url) => {
        setLink(url);
        try {
          await navigator.clipboard.writeText(url);
          toast.success('Link copied. The previous link no longer works.');
        } catch {
          toast.message('Copy the link below. The previous link no longer works.');
        }
      },
      onSettled: () => setConfirm(null),
    });
  };

  return (
    <section className="bg-white rounded-lg border border-line shadow-card p-5 space-y-4" data-testid="invitation-panel" aria-label="Invitation">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2"><Mail className="w-4 h-4" /> Invitation</h3>
          <p className="text-xs text-ink-secondary mt-0.5">What happened to the e-mail that invites this member.</p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${state.cls}`} data-testid="invitation-state">{state.text}</span>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><dt className="text-xs text-ink-secondary">Last sent</dt><dd className="text-ink">{fmt(inv.last_sent_at)}</dd></div>
        <div><dt className="text-xs text-ink-secondary">Times sent</dt><dd className="text-ink">{inv.sent_count}</dd></div>
        <div><dt className="text-xs text-ink-secondary">Expires</dt><dd className="text-ink">{fmt(inv.expires_at)}</dd></div>
        <div>
          <dt className="text-xs text-ink-secondary">E-mail delivery</dt>
          <dd className="text-ink" data-testid="invitation-delivery">{delivery ? (DELIVERY_LABEL[delivery.status] ?? delivery.status) : 'No e-mail for this link'}</dd>
        </div>
      </dl>

      {delivery?.status === 'failed' && delivery.last_error && (
        <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2" data-testid="invitation-error">
          Last error: {delivery.last_error}
        </p>
      )}

      {link && (
        <input
          readOnly
          value={link}
          aria-label="Invitation link"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full text-xs font-mono border border-line rounded-md px-3 py-2 bg-surface-alt"
        />
      )}

      {inv.state !== 'accepted' && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => resend.mutate(userId)} disabled={resend.isPending} className={`${BUTTON} text-ink`}>
            <RefreshCw className="w-4 h-4" /> Resend e-mail
          </button>
          <button onClick={() => setConfirm('copy')} disabled={copy.isPending} className={`${BUTTON} text-ink`}>
            <Link2 className="w-4 h-4" /> Copy link
          </button>
          {inv.state === 'pending' && (
            <button onClick={() => setConfirm('revoke')} disabled={revoke.isPending} className={`${BUTTON} text-red-600`}>
              <Ban className="w-4 h-4" /> Revoke
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirm === 'copy'}
        onClose={() => setConfirm(null)}
        onConfirm={onCopy}
        title="Copy a new invitation link?"
        description="This creates a new link and shows it once. No e-mail is sent, and the link the member already has stops working."
        confirmLabel="Create and copy"
        variant="warning"
        isLoading={copy.isPending}
      />
      <ConfirmDialog
        isOpen={confirm === 'revoke'}
        onClose={() => setConfirm(null)}
        onConfirm={() => revoke.mutate(undefined, { onSettled: () => setConfirm(null) })}
        title="Revoke this invitation?"
        description="The link stops working. You can send a new invitation later."
        confirmLabel="Revoke"
        isLoading={revoke.isPending}
      />
    </section>
  );
}
