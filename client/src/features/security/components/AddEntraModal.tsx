// src/features/security/components/AddEntraModal.tsx
import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useCreateIdentityProvider } from '../hooks/useIdentityProviders';
import { Info, RefreshCw } from 'lucide-react';

interface AddEntraModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddEntraModal: React.FC<AddEntraModalProps> = ({ isOpen, onClose }) => {
  const [displayName, setDisplayName] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [domainsInput, setDomainsInput] = useState('');
  const createIdp = useCreateIdentityProvider();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !tenantId.trim()) return;

    const domains = domainsInput
      .split(/[\n,]/)
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    createIdp.mutate(
      {
        display_name: displayName.trim(),
        tenant_id: tenantId.trim().toLowerCase(),
        domains,
      },
      {
        onSuccess: () => {
          onClose();
          setDisplayName('');
          setTenantId('');
          setDomainsInput('');
        },
      }
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Connect Microsoft Entra ID"
      description="Configure federated single sign-on with your organization's Microsoft Entra tenant."
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={createIdp.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
          >
            Cancel
          </button>
          <button
            form="add-entra-form"
            type="submit"
            disabled={createIdp.isPending || !displayName.trim() || !tenantId.trim()}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {createIdp.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Connection'
            )}
          </button>
        </>
      }
    >
      <form id="add-entra-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Info Banner */}
        <div className="flex items-start gap-3 p-3.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-xs">
          <Info className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-sky-950">Platform Application Architecture</p>
            <p>
              Karbexa connects through a verified multi-tenant platform application. You do not need to generate
              or manage a client secret in Azure. You will receive DNS TXT verification tokens to verify domain ownership.
            </p>
          </div>
        </div>

        {/* Display Name */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1">
            Connection Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Acme Corp Microsoft Entra"
            className="w-full px-3 py-2 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          />
        </div>

        {/* Directory / Tenant ID */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1">
            Entra Directory (Tenant) ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="e.g. 00000000-0000-0000-0000-000000000000"
            className="w-full px-3 py-2 text-sm font-mono rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          />
          <p className="text-xs text-ink-muted mt-1">
            Found in Microsoft Entra admin center &gt; Identity &gt; Overview &gt; Tenant ID.
          </p>
        </div>

        {/* Corporate Domains */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1">
            Email Domains <span className="text-ink-muted text-xs font-normal">(optional now, can add later)</span>
          </label>
          <textarea
            value={domainsInput}
            onChange={(e) => setDomainsInput(e.target.value)}
            placeholder="e.g. acme.com, acmecorp.com (comma or newline separated)"
            rows={3}
            className="w-full px-3 py-2 text-sm font-mono rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 resize-none"
          />
          <p className="text-xs text-ink-muted mt-1">
            Each domain will be assigned a DNS TXT verification token. At least one domain must be verified before activating.
          </p>
        </div>
      </form>
    </Modal>
  );
};
