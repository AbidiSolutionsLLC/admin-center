// src/pages/integrations/IntegrationsPage.tsx
import { useState } from 'react';
import { Plug, Plus, Clock } from 'lucide-react';
import { useIntegrations } from '@/features/integrations/hooks/useIntegrations';
import { useConnectIntegration } from '@/features/integrations/hooks/useConnectIntegration';
import { useSyncLogs } from '@/features/integrations/hooks/useSyncLogs';
import { useUpdateFieldMapping } from '@/features/integrations/hooks/useUpdateFieldMapping';
import { IntegrationCard } from '@/features/integrations/components/IntegrationCard';
import { IntegrationForm, type IntegrationFormData } from '@/features/integrations/components/IntegrationForm';
import { SyncLogViewer } from '@/features/integrations/components/SyncLogViewer';
import { FieldMappingTable } from '@/features/integrations/components/FieldMappingTable';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import type { Integration, IntegrationType } from '@/types';

const MVP_CONNECTORS: { type: IntegrationType; label: string; description: string }[] = [
  { type: 'slack', label: 'Slack', description: 'Connect to your Slack workspace for notifications and team sync' },
  { type: 'jira', label: 'Jira', description: 'Sync projects, issues, and sprint data from Jira' },
  { type: 'google_workspace', label: 'Google Workspace', description: 'Integrate Google Sheets, Drive, and Calendar' },
];

/**
 * IntegrationsPage Component
 * Main page for managing third-party integrations.
 *
 * Features:
 * - 3 MVP connectors (Slack, Jira, Google Workspace)
 * - AES-256 encrypted credentials (never in API response)
 * - Editable field mapping table
 * - "Sync Now" triggers sync endpoint and shows result toast
 * - Sync log viewer after every sync
 * - Disconnect wipes credentials_enc field
 * - All mutations produce audit events
 * - All 4 states: loading, error, empty, data
 */
export default function IntegrationsPage() {
  // ── Server data ──────────────────────────────────────────────────────
  const { data: integrations, isLoading, isError, refetch } = useIntegrations();

  const connectMutation = useConnectIntegration();
  const updateFieldMapping = useUpdateFieldMapping();

  // ── Modal state ──────────────────────────────────────────────────────
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isSyncLogModalOpen, setIsSyncLogModalOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [selectedConnectorType, setSelectedConnectorType] = useState<IntegrationType | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'credentials' | 'mapping'>('credentials');

  // ── Sync logs for selected integration ───────────────────────────────
  const {
    data: syncLogData,
    isLoading: syncLogsLoading,
    isError: syncLogsError,
  } = useSyncLogs(selectedIntegration?._id ?? '');

  // ── Handlers ─────────────────────────────────────────────────────────
  const openConnectModal = (type: IntegrationType) => {
    setSelectedConnectorType(type);
    setIsConnectModalOpen(true);
  };

  const openConfigModal = (integration: Integration) => {
    setSelectedIntegration(integration);
    setActiveModalTab('credentials');
    setIsConfigModalOpen(true);
  };

  const openSyncLogModal = (integration: Integration) => {
    setSelectedIntegration(integration);
    setIsSyncLogModalOpen(true);
  };

  const handleCloseModals = () => {
    setIsConnectModalOpen(false);
    setIsConfigModalOpen(false);
    setIsSyncLogModalOpen(false);
    setSelectedIntegration(null);
    setSelectedConnectorType(null);
  };

  const handleConnectSubmit = async (data: IntegrationFormData) => {
    if (!selectedConnectorType) return;
    await connectMutation.mutateAsync({
      type: selectedConnectorType,
      credentials: data.credentials,
      sync_enabled: data.sync_enabled,
      sync_frequency: data.sync_frequency,
      field_mapping: data.field_mapping,
    });
    handleCloseModals();
  };

  // Trigger form submit from modal footer button
  const handleModalSubmit = () => {
    const submitBtn = document.getElementById('integration-form-submit') as HTMLButtonElement;
    submitBtn?.click();
  };

  // ── Loading state ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="h-7 w-40 bg-skeleton rounded animate-pulse" />
            <div className="h-4 w-64 bg-skeleton rounded animate-pulse mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-line shadow-card p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-skeleton rounded-lg animate-pulse" />
                <div className="flex-1">
                  <div className="h-5 w-32 bg-skeleton rounded animate-pulse mb-2" />
                  <div className="h-3 w-24 bg-skeleton rounded animate-pulse" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-surface-alt rounded-md">
                {[1, 2, 3].map((j) => (
                  <div key={j}>
                    <div className="h-2.5 w-20 bg-skeleton rounded animate-pulse mb-2" />
                    <div className="h-4 w-16 bg-skeleton rounded animate-pulse" />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="flex-1 h-9 bg-skeleton rounded animate-pulse" />
                <div className="h-9 w-20 bg-skeleton rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-ink">Integrations</h1>
            <p className="mt-0.5 text-sm text-ink-secondary">Connect your favorite tools</p>
          </div>
        </div>
        <ErrorState
          title="Failed to load integrations"
          description="Something went wrong fetching integration data. Please try again."
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Integrations</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            Connect and sync data from third-party services
          </p>
        </div>
      </div>

      {/* Connector Cards */}
      <div className="grid grid-cols-3 gap-4">
        {MVP_CONNECTORS.map((connector) => {
          const existingIntegration = integrations?.find((i) => i.type === connector.type);

          return (
            <div key={connector.type} className="relative">
              {existingIntegration ? (
                <IntegrationCard
                  integration={existingIntegration}
                  onEdit={openConfigModal}
                  onViewLogs={openSyncLogModal}
                />
              ) : (
                <button
                  onClick={() => openConnectModal(connector.type)}
                  className="bg-white rounded-lg border-2 border-dashed border-line shadow-card p-8 text-center hover:border-primary hover:bg-primary-light/30 transition-colors w-full"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary-light flex items-center justify-center mx-auto mb-3">
                    <Plug className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold text-ink mb-1">{connector.label}</h3>
                  <p className="text-xs text-ink-secondary">{connector.description}</p>
                  <div className="mt-4">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                      <Plus className="w-3.5 h-3.5" />
                      Connect
                    </span>
                  </div>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state if no integrations connected */}
      {!integrations?.length && (
        <div className="bg-white rounded-lg border border-line shadow-card p-8">
          <EmptyState
            title="No integrations connected"
            description="Select a connector above to get started with your first integration."
            icon={Plug}
          />
        </div>
      )}

      {/* Connect Modal */}
      <Modal
        isOpen={isConnectModalOpen}
        onClose={handleCloseModals}
        title={`Connect ${selectedConnectorType?.replace('_', ' ') ?? ''}`}
        description="Enter your credentials to connect the integration."
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCloseModals}>
              Cancel
            </Button>
            <Button
              className="bg-primary hover:bg-primary-hover text-white"
              disabled={connectMutation.isPending}
              onClick={handleModalSubmit}
            >
              {connectMutation.isPending ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        }
      >
        {selectedConnectorType && (
          <IntegrationForm
            integrationType={selectedConnectorType}
            onSubmit={handleConnectSubmit}
            isSubmitting={connectMutation.isPending}
          />
        )}
      </Modal>

      {/* Config Modal (with tabs: Credentials | Field Mapping) */}
      <Modal
        isOpen={isConfigModalOpen}
        onClose={handleCloseModals}
        title={`Configure ${selectedIntegration?.name ?? ''}`}
        description="Manage credentials, sync settings, and field mapping."
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCloseModals}>
              Close
            </Button>
          </div>
        }
      >
        {selectedIntegration && (
          <div className="space-y-4">
            {/* Tab Switcher */}
            <div className="flex gap-2 border-b border-line">
              <button
                onClick={() => setActiveModalTab('credentials')}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                  activeModalTab === 'credentials'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-ink-secondary hover:text-ink'
                )}
              >
                Credentials & Sync
              </button>
              <button
                onClick={() => setActiveModalTab('mapping')}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                  activeModalTab === 'mapping'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-ink-secondary hover:text-ink'
                )}
              >
                Field Mapping
              </button>
            </div>

            {/* Tab Content */}
            {activeModalTab === 'credentials' ? (
              <IntegrationForm
                integrationType={selectedIntegration.type}
                initialData={selectedIntegration}
                onSubmit={() => {}}
              />
            ) : (
              <FieldMappingTable
                integration={selectedIntegration}
                onSave={(mapping) => {
                  updateFieldMapping.mutate({
                    id: selectedIntegration._id,
                    field_mapping: mapping,
                  });
                }}
              />
            )}
          </div>
        )}
      </Modal>

      {/* Sync Log Modal */}
      <Modal
        isOpen={isSyncLogModalOpen}
        onClose={handleCloseModals}
        title={`Sync Logs — ${selectedIntegration?.name ?? ''}`}
        description="History of all sync operations for this integration."
        size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCloseModals}>
              Close
            </Button>
          </div>
        }
      >
        {selectedIntegration && (
          <SyncLogViewer
            logs={syncLogData?.logs ?? []}
            isLoading={syncLogsLoading}
            isError={syncLogsError}
          />
        )}
      </Modal>
    </div>
  );
}
