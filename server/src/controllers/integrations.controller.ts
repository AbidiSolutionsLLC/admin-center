// server/src/controllers/integrations.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { Integration } from '../models/Integration.model';
import { IntegrationSyncLog } from '../models/IntegrationSyncLog.model';
import { encryptObject, decryptObject } from '../lib/cryptoService';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const ConnectIntegrationSchema = z.object({
  type: z.enum(['slack', 'jira', 'google_workspace', 'github', 'custom']),
  credentials: z.record(z.string(), z.unknown()),
  field_mapping: z.record(z.string(), z.string()).optional().default({}),
  sync_enabled: z.boolean().default(false),
  sync_frequency: z.enum(['manual', 'hourly', 'daily', 'weekly']).default('manual'),
}).refine((data) => Object.keys(data.credentials).length > 0, {
  message: 'At least one credential is required',
  path: ['credentials'],
});

const UpdateIntegrationSchema = z.object({
  credentials: z.record(z.string(), z.unknown()).optional(),
  field_mapping: z.record(z.string(), z.string()).optional(),
  sync_enabled: z.boolean().optional(),
  sync_frequency: z.enum(['manual', 'hourly', 'daily', 'weekly']).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Simulates a sync operation for an integration.
 * In production, this would call the external API and process data.
 * For MVP, it simulates success/failure with mock data.
 */
async function simulateSync(
  integrationId: string,
  companyId: string,
  integrationType: string,
  triggeredBy: 'manual' | 'schedule' | 'webhook'
): Promise<{
  status: 'success' | 'failed';
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  errorMessage?: string;
}> {
  // Simulate sync duration
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // MVP: Simulate success (90% chance) or failure (10% chance)
  const willFail = Math.random() < 0.1;

  if (willFail) {
    return {
      status: 'failed',
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errorMessage: `Connection to ${integrationType} timed out. Please check your credentials and try again.`,
    };
  }

  const recordsProcessed = Math.floor(Math.random() * 500) + 100;
  const recordsCreated = Math.floor(Math.random() * 50);
  const recordsUpdated = Math.floor(Math.random() * 100);

  return {
    status: 'success',
    recordsProcessed,
    recordsCreated,
    recordsUpdated,
    recordsFailed: 0,
  };
}

/**
 * Triggers admin notification for sync failure.
 * In production, this would call the notification system (H-031).
 * For now, it logs a placeholder audit event.
 */
async function notifySyncFailure(
  req: Request,
  integrationName: string,
  errorMessage: string
): Promise<void> {
  // TODO: Integrate with Notification system from H-031
  // For now, log an audit event that can be picked up by notification engine
  await auditLogger.log({
    req,
    action: 'integration.sync_failed_notification',
    module: 'integrations',
    object_type: 'Integration',
    object_id: 'notification',
    object_label: `Sync failure notification for ${integrationName}`,
    before_state: null,
    after_state: { integration: integrationName, error: errorMessage },
  });
}

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /integrations
 * Returns all integrations for the requesting company.
 * Credentials are NEVER returned in the response.
 */
export const getIntegrations = asyncHandler(async (req: Request, res: Response) => {
  const integrations = await Integration.find({
    company_id: req.user.company_id,
  }).sort({ created_at: 1 }).lean();

  // Strip encrypted credentials from response
  const safeIntegrations = integrations.map(({ credentials_enc, ...rest }) => rest);

  res.status(200).json({ success: true, data: safeIntegrations });
});

/**
 * GET /integrations/:id
 * Returns a single integration by ID, scoped to the company.
 * Credentials are NEVER returned.
 */
export const getIntegrationById = asyncHandler(async (req: Request, res: Response) => {
  const integration = await Integration.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!integration) {
    throw new AppError('Integration not found', 404, 'NOT_FOUND');
  }

  // Strip encrypted credentials
  const { credentials_enc, ...safeIntegration } = integration.toObject();

  res.status(200).json({ success: true, data: safeIntegration });
});

/**
 * POST /integrations/connect
 * Connects a new integration with encrypted credential storage.
 */
export const connectIntegration = asyncHandler(async (req: Request, res: Response) => {
  const input = ConnectIntegrationSchema.parse(req.body);

  // Encrypt credentials before storing
  const credentialsEnc = encryptObject(input.credentials);

  const integration = await Integration.create({
    company_id: req.user.company_id,
    name: `${input.type.charAt(0).toUpperCase() + input.type.slice(1).replace('_', ' ')}`,
    type: input.type,
    status: 'connected',
    credentials_enc: credentialsEnc,
    field_mapping: input.field_mapping,
    sync_enabled: input.sync_enabled,
    sync_frequency: input.sync_frequency,
    connected_at: new Date(),
  });

  await auditLogger.log({
    req,
    action: 'integration.connected',
    module: 'integrations',
    object_type: 'Integration',
    object_id: integration._id.toString(),
    object_label: integration.name,
    before_state: null,
    after_state: {
      type: integration.type,
      status: integration.status,
      sync_enabled: integration.sync_enabled,
      sync_frequency: integration.sync_frequency,
    },
  });

  // Return without credentials
  const { credentials_enc, ...safeIntegration } = integration.toObject();

  res.status(201).json({ success: true, data: safeIntegration });
});

/**
 * PUT /integrations/:id
 * Updates integration settings. Credentials can be updated (re-encrypted).
 */
export const updateIntegration = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateIntegrationSchema.parse(req.body);

  const integration = await Integration.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!integration) {
    throw new AppError('Integration not found', 404, 'NOT_FOUND');
  }

  const beforeState = {
    sync_enabled: integration.sync_enabled,
    sync_frequency: integration.sync_frequency,
    field_mapping: integration.field_mapping,
  };

  // Update field mapping if provided
  if (input.field_mapping !== undefined) {
    integration.field_mapping = input.field_mapping;
  }

  // Update sync settings if provided
  if (input.sync_enabled !== undefined) {
    integration.sync_enabled = input.sync_enabled;
  }

  if (input.sync_frequency !== undefined) {
    integration.sync_frequency = input.sync_frequency;
  }

  // Re-encrypt credentials if provided
  if (input.credentials !== undefined) {
    integration.credentials_enc = encryptObject(input.credentials);
  }

  await integration.save();

  await auditLogger.log({
    req,
    action: 'integration.updated',
    module: 'integrations',
    object_type: 'Integration',
    object_id: integration._id.toString(),
    object_label: integration.name,
    before_state: beforeState,
    after_state: {
      sync_enabled: integration.sync_enabled,
      sync_frequency: integration.sync_frequency,
      field_mapping: integration.field_mapping,
    },
  });

  // Return without credentials
  const { credentials_enc, ...safeIntegration } = integration.toObject();

  res.status(200).json({ success: true, data: safeIntegration });
});

/**
 * POST /integrations/:id/sync
 * Triggers an immediate sync for an integration.
 * Creates a sync log entry and updates integration status.
 */
export const syncIntegration = asyncHandler(async (req: Request, res: Response) => {
  const integration = await Integration.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!integration) {
    throw new AppError('Integration not found', 404, 'NOT_FOUND');
  }

  if (integration.status !== 'connected') {
    throw new AppError('Integration is not connected', 400, 'NOT_CONNECTED');
  }

  const startedAt = new Date();

  // Update status to syncing
  integration.last_sync_status = 'syncing';
  integration.last_sync_message = 'Sync in progress...';
  await integration.save();

  // Simulate sync
  const result = await simulateSync(
    integration._id.toString(),
    req.user.company_id,
    integration.type,
    'manual'
  );

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  // Create sync log
  const syncLog = await IntegrationSyncLog.create({
    company_id: req.user.company_id,
    integration_id: integration._id,
    integration_type: integration.type,
    triggered_by: 'manual',
    status: result.status,
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: durationMs,
    records_processed: result.recordsProcessed,
    records_created: result.recordsCreated,
    records_updated: result.recordsUpdated,
    records_failed: result.recordsFailed,
    error_message: result.errorMessage,
  });

  // Update integration with sync result
  integration.last_sync_at = completedAt;
  integration.last_sync_status = result.status;
  integration.last_sync_message = result.errorMessage;
  integration.status = result.status === 'failed' ? 'error' : 'connected';

  await integration.save();

  // If sync failed, trigger admin notification
  if (result.status === 'failed') {
    await notifySyncFailure(req, integration.name, result.errorMessage ?? 'Unknown error');
  }

  await auditLogger.log({
    req,
    action: 'integration.synced',
    module: 'integrations',
    object_type: 'Integration',
    object_id: integration._id.toString(),
    object_label: integration.name,
    before_state: { last_sync_status: 'syncing' },
    after_state: {
      last_sync_status: result.status,
      records_processed: result.recordsProcessed,
      duration_ms: durationMs,
    },
  });

  res.status(200).json({
    success: true,
    data: {
      sync_log: syncLog.toObject(),
      integration: {
        last_sync_at: integration.last_sync_at,
        last_sync_status: integration.last_sync_status,
        last_sync_message: integration.last_sync_message,
      },
    },
  });
});

/**
 * POST /integrations/:id/disconnect
 * Disconnects an integration and wipes encrypted credentials.
 */
export const disconnectIntegration = asyncHandler(async (req: Request, res: Response) => {
  const integration = await Integration.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!integration) {
    throw new AppError('Integration not found', 404, 'NOT_FOUND');
  }

  const beforeState = {
    status: integration.status,
    has_credentials: integration.credentials_enc !== '',
  };

  // Wipe credentials and update status
  integration.credentials_enc = '';
  integration.status = 'disconnected';
  integration.disconnected_at = new Date();
  integration.last_sync_status = 'idle';
  integration.last_sync_message = '';

  await integration.save();

  await auditLogger.log({
    req,
    action: 'integration.disconnected',
    module: 'integrations',
    object_type: 'Integration',
    object_id: integration._id.toString(),
    object_label: integration.name,
    before_state: beforeState,
    after_state: {
      status: integration.status,
      has_credentials: false,
      disconnected_at: integration.disconnected_at,
    },
  });

  res.status(200).json({ success: true, data: {} });
});

/**
 * GET /integrations/:id/sync-logs
 * Returns sync logs for a specific integration.
 */
export const getSyncLogs = asyncHandler(async (req: Request, res: Response) => {
  const { limit = 50, page = 1 } = req.query;

  const integration = await Integration.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!integration) {
    throw new AppError('Integration not found', 404, 'NOT_FOUND');
  }

  const logs = await IntegrationSyncLog.find({
    company_id: req.user.company_id,
    integration_id: integration._id,
  })
    .sort({ created_at: -1 })
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit))
    .lean();

  const total = await IntegrationSyncLog.countDocuments({
    company_id: req.user.company_id,
    integration_id: integration._id,
  });

  res.status(200).json({
    success: true,
    data: {
      logs,
      pagination: {
        limit: Number(limit),
        page: Number(page),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    },
  });
});

/**
 * PUT /integrations/:id/field-mapping
 * Updates field mapping for an integration.
 */
export const updateFieldMapping = asyncHandler(async (req: Request, res: Response) => {
  const { mapping } = z.object({
    mapping: z.record(z.string(), z.string()),
  }).parse(req.body);

  const integration = await Integration.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!integration) {
    throw new AppError('Integration not found', 404, 'NOT_FOUND');
  }

  const beforeState = { field_mapping: integration.field_mapping };

  integration.field_mapping = mapping;
  await integration.save();

  await auditLogger.log({
    req,
    action: 'integration.field_mapping_updated',
    module: 'integrations',
    object_type: 'Integration',
    object_id: integration._id.toString(),
    object_label: integration.name,
    before_state: beforeState,
    after_state: { field_mapping: mapping },
  });

  // Return without credentials
  const { credentials_enc, ...safeIntegration } = integration.toObject();

  res.status(200).json({ success: true, data: safeIntegration });
});
