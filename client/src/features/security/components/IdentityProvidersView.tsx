// src/features/security/components/IdentityProvidersView.tsx
import React, { useState } from 'react';
import {
  Cloud,
  Plus,
  ExternalLink,
  Info,
  AlertTriangle,
  RefreshCw,
  Power,
} from 'lucide-react';
import {
  useIdentityProviders,
  useUpdateIdentityProvider,
} from '../hooks/useIdentityProviders';
import { AddEntraModal } from './AddEntraModal';
import { DomainVerificationCard } from './DomainVerificationCard';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { toast } from 'sonner';
import type { IdentityProviderConnection, IdpStatus, JitProvisioning } from '@/types';

export const IdentityProvidersView: React.FC = () => {
  const { data: connections, isLoading, isError, refetch } = useIdentityProviders();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [testModalConnection, setTestModalConnection] = useState<IdentityProviderConnection | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-surface-alt rounded animate-pulse w-48" />
        <div className="h-48 bg-surface-alt rounded-lg animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
        <h3 className="text-base font-semibold text-red-900">Failed to load Identity Providers</h3>
        <p className="text-sm text-red-700">Unable to retrieve identity provider connections.</p>
        <button
          onClick={() => refetch()}
          className="h-8 px-4 text-xs font-medium rounded-md bg-white border border-red-200 text-red-800 hover:bg-red-50 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Identity Providers (SSO)</h2>
          <p className="mt-0.5 text-xs text-ink-secondary">
            Configure enterprise single sign-on (SSO) with Microsoft Entra ID. Manage domain TXT verification, JIT provisioning, and SSO enforcement.
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Connect Entra ID
        </button>
      </div>

      {/* Connection List / Empty State */}
      {!connections || connections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center bg-white space-y-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Cloud className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-sm font-semibold text-ink">No Identity Providers Configured</h3>
            <p className="text-xs text-ink-secondary">
              Connect your organization's Microsoft Entra ID directory to enable single sign-on for your employees.
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="h-9 px-4 text-xs font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Connect Microsoft Entra ID
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {connections.map((connection) => (
            <ConnectionCard
              key={connection._id}
              connection={connection}
              onTestConnection={() => setTestModalConnection(connection)}
            />
          ))}
        </div>
      )}

      {/* Add Entra Modal */}
      <AddEntraModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />

      {/* Test Connection / Admin Consent Modal */}
      {testModalConnection && (
        <TestConnectionModal
          connection={testModalConnection}
          onClose={() => setTestModalConnection(null)}
        />
      )}
    </div>
  );
};

// ── Connection Card Component ───────────────────────────────────────────────

interface ConnectionCardProps {
  connection: IdentityProviderConnection;
  onTestConnection: () => void;
}

const ConnectionCard: React.FC<ConnectionCardProps> = ({ connection, onTestConnection }) => {
  const updateIdp = useUpdateIdentityProvider(connection._id);
  const [newDomain, setNewDomain] = useState('');
  const [isAddingDomain, setIsAddingDomain] = useState(false);

  const verifiedDomainsCount = connection.domains.filter((d) => d.verified_at).length;
  const hasVerifiedDomain = verifiedDomainsCount > 0;

  const handleStatusToggle = () => {
    if (connection.status === 'active') {
      updateIdp.mutate({ status: 'disabled' });
    } else {
      if (!hasVerifiedDomain) {
        toast.error('Cannot activate identity provider: at least one domain must be verified via DNS TXT.');
        return;
      }
      updateIdp.mutate({ status: 'active' });
    }
  };

  const handleJitToggle = (checked: boolean) => {
    const nextVal: JitProvisioning = checked ? 'create_member' : 'off';
    updateIdp.mutate({ jit_provisioning: nextVal });
  };

  const handleEnforceSsoToggle = (checked: boolean) => {
    updateIdp.mutate({ enforce_sso: checked });
  };

  const handleAddDomain = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDomain = newDomain.trim().toLowerCase();
    if (!cleanDomain) return;

    if (connection.domains.some((d) => d.domain.toLowerCase() === cleanDomain)) {
      toast.error(`Domain "${cleanDomain}" already exists in this connection`);
      return;
    }

    const domainList = [...connection.domains.map((d) => d.domain), cleanDomain];
    updateIdp.mutate(
      { domains: domainList },
      {
        onSuccess: () => {
          setNewDomain('');
          setIsAddingDomain(false);
          toast.success(`Domain "${cleanDomain}" added. Verification token generated.`);
        },
      }
    );
  };

  const statusVariantMap: Record<IdpStatus, 'success' | 'warning' | 'neutral'> = {
    active: 'success',
    draft: 'warning',
    disabled: 'neutral',
  };

  return (
    <div className="bg-white rounded-xl border border-line shadow-card overflow-hidden">
      {/* Connection Header */}
      <div className="p-5 border-b border-line bg-surface-alt/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center flex-shrink-0 text-sky-600">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-semibold text-ink">{connection.display_name}</h3>
              <StatusBadge variant={statusVariantMap[connection.status]}>
                {connection.status === 'active'
                  ? 'Active'
                  : connection.status === 'draft'
                  ? 'Draft'
                  : 'Disabled'}
              </StatusBadge>
              <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded bg-surface border border-line text-ink-secondary">
                Microsoft Entra ID
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-ink-muted font-mono">
              <span>Tenant ID: {connection.config?.tenant_id || 'Not specified'}</span>
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTestConnection}
            className="h-8 px-3 text-xs font-medium rounded-md border border-line bg-white hover:bg-surface-alt text-ink transition-colors flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5 text-ink-secondary" />
            Test Connection
          </button>

          <button
            type="button"
            onClick={handleStatusToggle}
            disabled={updateIdp.isPending}
            className={`h-8 px-3 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              connection.status === 'active'
                ? 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {updateIdp.isPending ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Power className="w-3.5 h-3.5" />
            )}
            {connection.status === 'active' ? 'Deactivate' : 'Activate Connection'}
          </button>
        </div>
      </div>

      {/* Body: Configuration Options & Domains */}
      <div className="p-5 space-y-6">
        {/* Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* JIT Provisioning */}
          <div className="p-4 rounded-lg border border-line bg-white flex items-start justify-between gap-4">
            <div className="space-y-1">
              <span className="text-sm font-medium text-ink block">
                Just-In-Time (JIT) Provisioning
              </span>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Automatically create employee profiles when an unknown user with a verified corporate domain successfully authenticates.
              </p>
            </div>
            <Switch
              checked={connection.jit_provisioning === 'create_member'}
              onCheckedChange={handleJitToggle}
              disabled={updateIdp.isPending}
            />
          </div>

          {/* Enforce SSO */}
          <div className="p-4 rounded-lg border border-line bg-white flex items-start justify-between gap-4">
            <div className="space-y-1">
              <span className="text-sm font-medium text-ink block">
                Enforce SSO for Verified Domains
              </span>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Require all members of this organization matching verified email domains to sign in exclusively through Microsoft Entra ID.
              </p>
            </div>
            <Switch
              checked={connection.enforce_sso}
              onCheckedChange={handleEnforceSsoToggle}
              disabled={updateIdp.isPending}
            />
          </div>
        </div>

        {/* Tenant Consent Note */}
        <div className="flex items-start gap-3 p-3.5 rounded-lg bg-surface-alt border border-line text-xs text-ink-secondary">
          <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <p>
            <strong>Admin Consent Requirement:</strong> A Microsoft Entra administrator from your directory must grant tenant-wide consent to Karbexa's multi-tenant application on first sign-in.
          </p>
        </div>

        {/* Domains Section */}
        <div className="space-y-3">
          <DomainVerificationCard
            connectionId={connection._id}
            domains={connection.domains}
          />

          {/* Add Domain toggle */}
          {isAddingDomain ? (
            <form onSubmit={handleAddDomain} className="flex items-center gap-2 pt-2">
              <input
                type="text"
                placeholder="e.g. subsidiary.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                className="h-8 px-3 text-xs font-mono rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary flex-1 max-w-xs"
              />
              <button
                type="submit"
                disabled={!newDomain.trim() || updateIdp.isPending}
                className="h-8 px-3 text-xs font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50"
              >
                Add Domain
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingDomain(false);
                  setNewDomain('');
                }}
                className="h-8 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingDomain(true)}
              className="text-xs font-medium text-primary hover:text-primary-hover flex items-center gap-1 pt-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add another domain
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Test Connection Modal ───────────────────────────────────────────────────

interface TestConnectionModalProps {
  connection: IdentityProviderConnection;
  onClose: () => void;
}

const TestConnectionModal: React.FC<TestConnectionModalProps> = ({ connection, onClose }) => {
  const tenantId = connection.config?.tenant_id || '';

  const handleStartTest = () => {
    // If tenant_id exists, construct Microsoft Entra login URL in a new tab
    if (tenantId) {
      const loginUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/v2.0`;
      window.open(loginUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Test Microsoft Entra Connection"
      description={`Testing single sign-on for "${connection.display_name}"`}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
          >
            Close
          </button>
          {tenantId && (
            <button
              type="button"
              onClick={handleStartTest}
              className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open Entra Login in New Tab
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-xs text-ink-secondary">
        <div className="p-3.5 rounded-lg bg-surface-alt border border-line space-y-2">
          <p className="font-semibold text-ink text-sm">Connection Details</p>
          <div className="grid grid-cols-2 gap-2 font-mono">
            <div>
              <span className="text-ink-muted block text-[10px] font-sans">Type</span>
              <span className="text-ink">Microsoft Entra ID (OIDC)</span>
            </div>
            <div>
              <span className="text-ink-muted block text-[10px] font-sans">Tenant ID</span>
              <span className="text-ink truncate block">{tenantId || 'Not configured'}</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-ink text-sm">Verification & Consent Instructions</p>
          <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
            <li>
              Ensure at least one corporate domain has published its DNS TXT record and is <strong>Verified</strong>.
            </li>
            <li>
              When your Microsoft Entra administrator logs in for the first time, Microsoft will prompt for <strong>Permissions requested: Accept for your organization</strong>.
            </li>
            <li>
              Once consent is granted, members with matching verified email domains will authenticate seamlessly via Entra ID.
            </li>
          </ol>
        </div>
      </div>
    </Modal>
  );
};
