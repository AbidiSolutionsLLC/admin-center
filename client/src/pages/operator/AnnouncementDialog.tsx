import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useEndAnnouncement, useOperatorAnnouncement, useSetAnnouncement } from '@/features/operator/operatorApi';

const inputCls = 'w-full h-9 px-3 text-sm bg-surface border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600';
const HOURS = [['1', '1 hour'], ['4', '4 hours'], ['24', '1 day'], ['168', '1 week']] as const;

/** Publish, replace or end the platform announcement (Plan 4.12; message at most 280 characters). */
export function AnnouncementDialog({ onClose }: { onClose: () => void }) {
  const current = useOperatorAnnouncement().data;
  const set = useSetAnnouncement();
  const end = useEndAnnouncement();
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('info');
  const [hours, setHours] = useState('24');

  const publish = async () => {
    await set.mutateAsync({ message, severity, ends_at: new Date(Date.now() + Number(hours) * 3600_000).toISOString() });
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title="Announcement" size="sm">
      <div className="space-y-3">
        {current && (
          <p className="rounded-md border border-line bg-surface-alt p-2 text-sm">
            Showing now ({current.severity}): {current.message}
          </p>
        )}
        <textarea className="w-full rounded-md border border-line bg-surface p-2 text-sm" rows={3} maxLength={280} aria-label="Message" placeholder="Message shown to every organization (280 characters)" value={message} onChange={(e) => setMessage(e.target.value)} />
        <div className="flex gap-2">
          <select className={inputCls} aria-label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option>
          </select>
          <select className={inputCls} aria-label="Show for" value={hours} onChange={(e) => setHours(e.target.value)}>
            {HOURS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="flex justify-between gap-2 pt-2">
          <button onClick={() => end.mutate(undefined, { onSuccess: onClose })} disabled={!current || end.isPending} className="h-9 px-4 text-sm border border-line rounded-md disabled:opacity-50">End now</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-line rounded-md">Cancel</button>
            <button onClick={publish} disabled={!message.trim() || set.isPending} className="h-9 px-4 text-sm bg-primary text-white rounded-md disabled:opacity-50">Publish</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
