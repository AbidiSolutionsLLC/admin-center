import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { CopyField } from '@/components/ui/CopyField';

interface Props {
  clientId: string;
  secret: string;
  /** Set after a rotation: when the replaced secret stops working. */
  previousValidUntil?: string | null;
  onClose: () => void;
}

/** Shows a client secret exactly once (DRD §8.2). The server never returns it again. */
export function SecretOnceDialog({ clientId, secret, previousValidUntil, onClose }: Props) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Client secret"
      description="Copy it now. It is shown once and stored encrypted; it cannot be shown again."
      size="sm"
      footer={<Button onClick={onClose} data-testid="secret-stored">I have stored it</Button>}
    >
      <div className="space-y-3" data-testid="secret-once">
        <CopyField label="Client ID" value={clientId} />
        <CopyField label="Client secret" value={secret} />
        {previousValidUntil && (
          <p className="text-body text-ink-muted">
            The previous secret keeps working until {new Date(previousValidUntil).toLocaleString()}, so the portal can be redeployed without downtime.
          </p>
        )}
      </div>
    </Modal>
  );
}
