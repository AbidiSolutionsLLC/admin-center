// src/features/integrations/components/IntegrationCard.tsx
import React from 'react';
import {
  MessageSquare,
  Target,
  Building2,
  Code,
  Plug,
  RefreshCw,
  PowerOff,
  AlertCircle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { useSyncNow } from '../hooks/useSyncNow';
import { useDisconnectIntegration } from '../hooks/useDisconnectIntegration';
import type { Integration } from '@/types';
import { cn } from '@/utils/cn';

interface IntegrationCardProps {
  integration: Integration;
  onEdit: (integration: Integration) => void;
  onViewLogs: (integration: Integration) => void;
}

const INTEGRATION_ICONS: Record<string, typeof MessageSquare> = {
  slack: MessageSquare,
  jira: Target,
  google_workspace: Building2,
  github: Code,
  custom: Plug,
};

const STATUS_CONFIG = {
  connected: {
    label: 'Connected',
    class: 'bg-successLight text-success border-successBorder',
    icon: CheckCircle,
  },
  disconnected: {
    label: 'Disconnected',
    class: 'bg-surface-alt text-ink-muted border-line',
    icon: PowerOff,
  },
  error: {
    label: 'Error',
    class: 'bg-errorLight text-error border-errorBorder',
    icon: AlertCircle,
  },
};

const SYNC_STATUS_CONFIG = {
  idle: { label: 'Never synced', class: 'text-ink-muted' },
  syncing: { label: 'Syncing...', class: 'text-accent' },
  success: { label: 'Synced', class: 'text-success' },
  failed: { label: 'Failed', class: 'text-error' },
  partial: { label: 'Partial', class: 'text-warning' },
};

/**
 * IntegrationCard Component
 * Displays a single integration with status, sync controls, and actions.
 * Used on: IntegrationsPage.
 */
export const IntegrationCard: React.FC<IntegrationCardProps> = ({
  integration,
  onEdit,
  onViewLogs,
}) => {
  const syncNow = useSyncNow();
  const disconnect = useDisconnectIntegration();

  const statusConfig = STATUS_CONFIG[integration.status];
  const StatusIcon = statusConfig.icon;
  const Icon = INTEGRATION_ICONS[integration.type] ?? Plug;

  const handleSync = async () => {
    await syncNow.mutateAsync(integration._id);
  };

  const handleDisconnect = async () => {
    if (window.confirm(`Are you sure you want to disconnect ${integration.name}? This will wipe all stored credentials.`)) {
      await disconnect.mutateAsync(integration._id);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-line shadow-card p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-light flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-ink">{integration.name}</h3>
            <p className="text-xs text-ink-secondary mt-0.5">
              Type: {integration.type.replace('_', ' ')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2.5 py-0.5', statusConfig.class)}>
            <StatusIcon className="w-3 h-3" />
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* Sync Info */}
      <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-surface-alt rounded-md">
        <div>
          <p className="text-[11px] text-ink-muted uppercase tracking-wide">Last Sync</p>
          <p className={cn('text-sm font-medium mt-0.5', SYNC_STATUS_CONFIG[integration.last_sync_status].class)}>
            {SYNC_STATUS_CONFIG[integration.last_sync_status].label}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-ink-muted uppercase tracking-wide">Frequency</p>
          <p className="text-sm font-medium text-ink mt-0.5 capitalize">{integration.sync_frequency}</p>
        </div>
        <div>
          <p className="text-[11px] text-ink-muted uppercase tracking-wide">Sync Enabled</p>
          <p className="text-sm font-medium mt-0.5">
            {integration.sync_enabled ? (
              <span className="text-success">Yes</span>
            ) : (
              <span className="text-ink-muted">No</span>
            )}
          </p>
        </div>
      </div>

      {/* Last Sync Message */}
      {integration.last_sync_message && (
        <div className="mb-4 p-2 bg-warningLight border border-warningBorder rounded text-xs text-warning">
          {integration.last_sync_message}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSync}
          disabled={syncNow.isPending || integration.status !== 'connected'}
          className={cn(
            'flex-1 h-9 px-3 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5',
            'bg-primary hover:bg-primary-hover text-white',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          <RefreshCw className={cn('w-4 h-4', syncNow.isPending && 'animate-spin')} />
          {syncNow.isPending ? 'Syncing...' : 'Sync Now'}
        </button>
        <button
          onClick={() => onEdit(integration)}
          className="h-9 px-3 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
        >
          Configure
        </button>
        <button
          onClick={() => onViewLogs(integration)}
          className="h-9 px-3 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
        >
          <Clock className="w-4 h-4" />
        </button>
        {integration.status === 'connected' && (
          <button
            onClick={handleDisconnect}
            disabled={disconnect.isPending}
            className={cn(
              'h-9 px-3 text-sm font-medium rounded-md transition-colors',
              'bg-error hover:bg-red-700 text-white',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            <PowerOff className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
