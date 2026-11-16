import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useCreateOrg, usePlans } from '@/features/operator/operatorApi';

const inputCls = 'w-full h-9 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600';

/** Three steps (Plan 4.12): organization and plan, first admin, review. */
export function CreateOrgDialog({ onClose }: { onClose: () => void }) {
  const { data: plans } = usePlans();
  const create = useCreateOrg();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: '', slug: '', plan_key: '', email: '', full_name: '' });
  const [result, setResult] = useState<any>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const stepValid = step === 1 ? !!form.name && !!form.plan_key : step === 2 ? !!form.email && !!form.full_name : true;
  const planName = (plans ?? []).find((p) => p.key === form.plan_key)?.name ?? form.plan_key;

  const submit = async () => {
    const res = await create.mutateAsync({
      name: form.name,
      slug: form.slug || undefined,
      plan_key: form.plan_key,
      first_admin: { email: form.email, full_name: form.full_name },
    });
    setResult({ ...(res?.data ?? {}), ...(res?.meta ?? {}) });
  };
  const invite = result && (result.invite_token || result.invite_link);

  return (
    <Modal isOpen onClose={onClose} title={result ? 'Create Organization' : `Create Organization (step ${step} of 3)`} size="sm">
      {result ? (
        <div className="space-y-3 text-sm">
          <p className="text-success font-medium">
            {result.already_existed ? 'Organization already existed (no changes made).' : result.invite_email_sent ? 'Organization created. Invite email sent to the first admin.' : 'Organization created. Invite email was not sent.'}
          </p>
          {!import.meta.env.PROD && invite && (
            <div>
              <p className="text-xs text-ink-muted mb-1">Invite (non-production only)</p>
              <code className="block break-all p-2 bg-surface-alt border border-line rounded text-xs">{String(invite)}</code>
            </div>
          )}
          <button onClick={onClose} className="h-9 px-4 bg-primary text-white rounded-md text-sm">Done</button>
        </div>
      ) : (
        <div className="space-y-3">
          {step === 1 && (
            <>
              <input className={inputCls} placeholder="Organization name" value={form.name} onChange={set('name')} />
              <input className={inputCls} placeholder="Slug (optional)" value={form.slug} onChange={set('slug')} />
              <select className={inputCls} aria-label="Plan" value={form.plan_key} onChange={set('plan_key')}>
                <option value="">Select plan...</option>
                {(plans ?? []).map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            </>
          )}
          {step === 2 && (
            <>
              <input className={inputCls} placeholder="First admin full name" value={form.full_name} onChange={set('full_name')} />
              <input className={inputCls} type="email" placeholder="First admin email" value={form.email} onChange={set('email')} />
            </>
          )}
          {step === 3 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-muted">Organization</dt><dd>{form.name}</dd>
              <dt className="text-ink-muted">Slug</dt><dd>{form.slug || 'from the name'}</dd>
              <dt className="text-ink-muted">Plan</dt><dd>{planName}</dd>
              <dt className="text-ink-muted">First admin</dt><dd>{form.full_name} ({form.email})</dd>
            </dl>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={step === 1 ? onClose : () => setStep(step - 1)} className="h-9 px-4 text-sm border border-line rounded-md">{step === 1 ? 'Cancel' : 'Back'}</button>
            {step < 3 ? (
              <button onClick={() => setStep(step + 1)} disabled={!stepValid} className="h-9 px-4 text-sm bg-primary text-white rounded-md disabled:opacity-50">Next</button>
            ) : (
              <button onClick={submit} disabled={create.isPending} className="h-9 px-4 text-sm bg-primary text-white rounded-md disabled:opacity-50">
                {create.isPending ? 'Creating...' : 'Create'}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
