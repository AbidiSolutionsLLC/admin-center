import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { idOf, useOperators, useSaveOperator } from '@/features/operator/operatorApi';

const inputCls = 'w-full h-9 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600';

export default function OperatorOperatorsPage() {
  const { data: operators, isLoading } = useOperators();
  const save = useSaveOperator();
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState(''); // POST /operators requires an initial password (12-200 chars)

  const create = async () => {
    await save.mutateAsync({ body: { email, full_name: fullName, password } });
    setCreating(false); setEmail(''); setFullName(''); setPassword('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Operators</h1>
        <button onClick={() => setCreating(true)} className="h-9 px-4 bg-primary text-white text-sm rounded-md">Add operator</button>
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
                  <button
                    disabled={save.isPending}
                    onClick={() => save.mutate({ id: idOf(o), body: { status: o.status === 'suspended' ? 'active' : 'suspended' } })}
                    className="text-xs px-2 h-7 border border-line rounded-md hover:bg-surface-alt"
                  >{o.status === 'suspended' ? 'Reactivate' : 'Suspend'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating && (
        <Modal isOpen onClose={() => setCreating(false)} title="Add operator" size="sm">
          <div className="space-y-3">
            <input className={inputCls} placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <input className={inputCls} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className={inputCls} type="password" autoComplete="new-password" placeholder="Initial password (min 12 characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-xs text-ink-muted">The operator enrols an authenticator app at first sign-in.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCreating(false)} className="h-9 px-4 text-sm border border-line rounded-md">Cancel</button>
              <button onClick={create} disabled={!email || !fullName || password.length < 12 || save.isPending} className="h-9 px-4 text-sm bg-primary text-white rounded-md disabled:opacity-50">Create</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
