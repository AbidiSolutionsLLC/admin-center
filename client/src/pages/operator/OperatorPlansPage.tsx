import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { usePlans, useSavePlan, type Plan } from '@/features/operator/operatorApi';

const inputCls = 'w-full h-9 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600';

function PlanDialog({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const save = useSavePlan();
  const [key, setKey] = useState(plan?.key ?? '');
  const [name, setName] = useState(plan?.name ?? '');
  const [products, setProducts] = useState((plan?.products ?? []).join(', '));
  const submit = async () => {
    const list = products.split(',').map((p) => p.trim()).filter(Boolean);
    await save.mutateAsync({ id: plan?.key, body: plan ? { name, products: list } : { key, name, products: list } });
    onClose();
  };
  return (
    <Modal isOpen onClose={onClose} title={plan ? `Edit plan: ${plan.name}` : 'Create plan'} size="sm">
      <div className="space-y-3">
        {!plan && <input className={inputCls} placeholder="Key (e.g. starter)" value={key} onChange={(e) => setKey(e.target.value)} />}
        <input className={inputCls} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputCls} placeholder="Product keys, comma separated" value={products} onChange={(e) => setProducts(e.target.value)} />
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-line rounded-md">Cancel</button>
          <button onClick={submit} disabled={!name || (!plan && !key) || save.isPending} className="h-9 px-4 text-sm bg-primary text-white rounded-md disabled:opacity-50">Save</button>
        </div>
      </div>
    </Modal>
  );
}

export default function OperatorPlansPage() {
  const { data: plans, isLoading } = usePlans();
  const [editing, setEditing] = useState<Plan | null | undefined>(undefined); // undefined = closed, null = create
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Plans</h1>
        <button onClick={() => setEditing(null)} className="h-9 px-4 bg-primary text-white text-sm rounded-md">Create plan</button>
      </div>
      <div className="bg-surface border border-line rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-ink-muted text-xs uppercase">
            <tr><th className="text-left p-3">Key</th><th className="text-left p-3">Name</th><th className="text-left p-3">Products</th><th className="p-3" /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {isLoading && <tr><td colSpan={4} className="p-6 text-center text-ink-muted">Loading...</td></tr>}
            {(plans ?? []).map((p) => (
              <tr key={p.key}>
                <td className="p-3 font-mono text-xs">{p.key}</td>
                <td className="p-3">{p.name}</td>
                <td className="p-3 text-xs">{p.products.join(', ') || '-'}</td>
                <td className="p-3 text-right"><button onClick={() => setEditing(p)} className="text-xs px-2 h-7 border border-line rounded-md hover:bg-surface-alt">Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing !== undefined && <PlanDialog plan={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
