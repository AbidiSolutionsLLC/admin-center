// server/src/models/IntegrationSyncLog.model.ts
import { Schema, model, Document, Types } from 'mongoose';

/**
 * IntegrationSyncLog Model
 * Records every sync operation (manual or scheduled).
 * Used for audit trail, debugging, and displaying sync history.
 */

export type SyncLogStatus = 'success' | 'failed' | 'partial';

export interface IIntegrationSyncLog extends Document {
  company_id: Types.ObjectId;
  integration_id: Types.ObjectId;
  integration_type: string;
  triggered_by: 'manual' | 'schedule' | 'webhook';
  status: SyncLogStatus;
  started_at: Date;
  completed_at?: Date;
  duration_ms?: number;
  records_processed?: number;
  records_created?: number;
  records_updated?: number;
  records_failed?: number;
  error_message?: string;
  error_details?: Record<string, unknown>;
  created_at: Date;
}

const IntegrationSyncLogSchema = new Schema<IIntegrationSyncLog>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  integration_id: { type: Schema.Types.ObjectId, ref: 'Integration', required: true, index: true },
  integration_type: { type: String, required: true },
  triggered_by: {
    type: String,
    enum: ['manual', 'schedule', 'webhook'],
    default: 'manual',
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'partial'],
    required: true,
  },
  started_at: { type: Date, required: true },
  completed_at: Date,
  duration_ms: Number,
  records_processed: Number,
  records_created: Number,
  records_updated: Number,
  records_failed: Number,
  error_message: String,
  error_details: Schema.Types.Mixed,
}, { timestamps: { createdAt: 'created_at' } });

// ── Indexes ──────────────────────────────────────────────────────────────────
IntegrationSyncLogSchema.index({ company_id: 1, integration_id: 1, created_at: -1 });
IntegrationSyncLogSchema.index({ company_id: 1, status: 1, created_at: -1 });

export const IntegrationSyncLog = model<IIntegrationSyncLog>('IntegrationSyncLog', IntegrationSyncLogSchema);
