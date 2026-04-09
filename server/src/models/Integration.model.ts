// server/src/models/Integration.model.ts
import { Schema, model, Document, Types } from 'mongoose';

/**
 * Integration Model
 * Represents a third-party service connection (e.g., Slack, Jira, Google Workspace).
 * Credentials are stored AES-256 encrypted — raw credentials never in API response.
 * Supports field mapping and sync scheduling.
 */

export type IntegrationType = 'slack' | 'jira' | 'google_workspace' | 'github' | 'custom';
export type IntegrationStatus = 'connected' | 'disconnected' | 'error';
export type IntegrationSyncStatus = 'idle' | 'syncing' | 'success' | 'failed';

export interface IIntegration extends Document {
  company_id: Types.ObjectId;
  name: string;
  type: IntegrationType;
  status: 'connected' | 'disconnected' | 'error';
  credentials_enc: string; // AES-256 encrypted JSON
  field_mapping: Record<string, string>; // { external_field: internal_field }
  sync_enabled: boolean;
  sync_frequency: 'manual' | 'hourly' | 'daily' | 'weekly';
  last_sync_at?: Date;
  last_sync_status: IntegrationSyncStatus;
  last_sync_message?: string;
  connected_at?: Date;
  disconnected_at?: Date;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const IntegrationSchema = new Schema<IIntegration>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ['slack', 'jira', 'google_workspace', 'github', 'custom'],
    required: true,
  },
  status: {
    type: String,
    enum: ['connected', 'disconnected', 'error'],
    default: 'disconnected',
  },
  credentials_enc: { type: String, default: '' }, // Encrypted credentials JSON
  field_mapping: { type: Schema.Types.Mixed, default: {} },
  sync_enabled: { type: Boolean, default: false },
  sync_frequency: {
    type: String,
    enum: ['manual', 'hourly', 'daily', 'weekly'],
    default: 'manual',
  },
  last_sync_at: Date,
  last_sync_status: {
    type: String,
    enum: ['idle', 'syncing', 'success', 'failed'],
    default: 'idle',
  },
  last_sync_message: String,
  connected_at: Date,
  disconnected_at: Date,
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// ── Indexes ──────────────────────────────────────────────────────────────────
IntegrationSchema.index({ company_id: 1, type: 1 }, { unique: true });
IntegrationSchema.index({ company_id: 1, status: 1 });

export const Integration = model<IIntegration>('Integration', IntegrationSchema);
