import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import {
  idOf, useInviteOperator, useOperatorCan, useOperators, useOperatorSessions, useRevokeOperatorSession, useSaveOperator, OPERATOR_ROLE_OPTIONS,
} from '@/features/operator/operatorApi';

const inputCls = 'w-full h-9 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600';

export default function OperatorOperatorsPage() {
  const { data: operators, isLoading } = useOperators();
  const save = useSaveOperator();
  const canWrite = useOperatorCan('operators.write');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const invite = useInviteOperator();
  const [inviting, setInviting] = useState(false);
  const [inviteRole, setInviteRole] = useState<string>('support');
  const [sessionsFor, setSessionsFor] = useState<string | null>(null);
  const sessions = useOperatorSessions(sessionsFor);
  const revoke = useRevokeOperatorSession();

  const sendInvite = async () => {
    await invite.mutateAsync({ email, full_name: fullName, roles: [inviteRole] });
    setInviting(false); setEmail(''); setFullName(''); setInviteRole('support');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Operators</h1>
        <div className="flex gap-2">
          {canWrite && <button onClick={() => setInviting(true)} className="h-9 px-4 bg-primary text-white text-sm rounded-md">Invite operator</button>}
        </div>
      </div>
      <div className="bg-surface border border-line rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-ink-muted text-xs uppercase">
            <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3">Status</th><th className="p-3" /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {isLoading && <tr><td colSpan={4} className="p-6 text-center text-ink-muted">Loading...</td></tr>}
            {(operators ?? []).map((o) => (
              <tr key={idOf(o)}>
                <td className="p-3">{o.full_name ?? '-'}</td>
                <td className="p-3">{o.email}</td>
                <td className="p-3">{o.status}</td>
                <td className="p-3 text-right">
                  <button onClick={() => setSessionsFor(idOf(o))} className="mr-2 text-xs px-2 h-7 border border-line rounded-md hover:bg-surface-alt">Sessions</button>
                  {canWrite && <button
                    disabled={save.isPending}
                    onClick={() => save.mutate({ id: idOf(o), body: { status: o.status === 'suspended' ? 'active' : 'suspended' } })}
                    className="text-xs px-2 h-7 border border-line rounded-md hover:bg-surface-alt"
                  >{o.status === 'suspended' ? 'Reactivate' : 'Suspend'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {inviting && (
        <Modal isOpen onClose={() => setInviting(false)} title="Invite operator" size="sm">
          <div className="space-y-3">
            <input className={inputCls} placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <input className={inputCls} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select className={inputCls} aria-label="Role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              {OPERATOR_ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role.replace('_', ' ')}</option>)}
            </select>
            <p className="text-xs text-ink-muted">The invited operator sets their own password and authenticator app. Nobody types it for them.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setInviting(false)} className="h-9 px-4 text-sm border border-line rounded-md">Cancel</button>
              <button onClick={sendInvite} disabled={!email || !fullName || invite.isPending} className="h-9 px-4 text-sm bg-primary text-white rounded-md disabled:opacity-50">Send invitation</button>
            </div>
          </div>
        </Modal>
      )}
      {sessionsFor && (
        <Modal isOpen onClose={() => setSessionsFor(null)} title="Operator sessions" size="md">
          {sessions.isLoading && <p className="text-sm text-ink-muted">Loading...</p>}
          {sessions.data && sessions.data.length === 0 && <p className="text-sm text-ink-muted">No sessions.</p>}
          <ul className="divide-y divide-line">
            {(sessions.data ?? []).map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{new Date(x.created_at).toLocaleString()} <span className="text-ink-muted">{x.ip ?? '-'}</span> <span className="text-ink-muted">{x.active ? 'active' : 'ended'}</span></span>
                {canWrite && x.active && <button disabled={revoke.isPending} onClick={() => revoke.mutate({ operatorId: sessionsFor, sid: x.id })} className="text-xs px-2 h-7 border border-line rounded-md hover:bg-surface-alt">Revoke</button>}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
