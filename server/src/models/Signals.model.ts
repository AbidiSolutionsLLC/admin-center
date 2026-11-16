// server/src/models/Signals.model.ts — Command Center signals (DRD 4.1, 4.4; Plan 4.10). Written by lib/signals.ts, read by operator/overview.ts.
import { Schema, model, Document, Types } from 'mongoose';

export interface ITenantDailyStat extends Document {
  company_id: Types.ObjectId;
  /** UTC midnight of the day the numbers describe. */
  day: Date;
  members_total: number;
  members_active: number;
  /** External members arrive with Phase 5; 0 until then. */
  external_total: number;
  sign_ins: number;
  seats: Map<string, number>;
  /** Org admins (Super Admin role holders in an access state) without MFA; feeds the `admins_without_mfa` signal. */
  admins_without_mfa: number;
}

const TenantDailyStatSchema = new Schema<ITenantDailyStat>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  day: { type: Date, required: true },
  members_total: { type: Number, default: 0 },
  members_active: { type: Number, default: 0 },
  external_total: { type: Number, default: 0 },
  sign_ins: { type: Number, default: 0 },
  seats: { type: Map, of: Number, default: {} },
  admins_without_mfa: { type: Number, default: 0 },
});
TenantDailyStatSchema.index({ company_id: 1, day: 1 }, { unique: true });
TenantDailyStatSchema.index({ day: 1 }, { expireAfterSeconds: 400 * 24 * 3600 });

export const TenantDailyStat = model<ITenantDailyStat>('TenantDailyStat', TenantDailyStatSchema);

export const ATTENTION_SEVERITIES = ['critical', 'warning', 'info'] as const;
export type AttentionSeverity = (typeof ATTENTION_SEVERITIES)[number];

export interface IAttentionItem extends Document {
  kind: string;
  severity: AttentionSeverity;
  company_id?: Types.ObjectId;
  summary: string;
  link: string;
  first_seen_at: Date;
  last_seen_at: Date;
  resolved_at?: Date;
  /** true until `resolved_at` is set; the unique index covers open items only (a partial index cannot test for a missing field). */
  open: boolean;
  /** false while a rule's condition has not yet lasted long enough (sync_lag: 10 minutes); such items are not shown. */
  confirmed: boolean;
}

const AttentionItemSchema = new Schema<IAttentionItem>({
  kind: { type: String, required: true },
  severity: { type: String, enum: ATTENTION_SEVERITIES, required: true },
  company_id: { type: Schema.Types.ObjectId, ref: 'Company' },
  summary: { type: String, required: true, maxlength: 300 },
  link: { type: String, required: true },
  first_seen_at: { type: Date, required: true },
  last_seen_at: { type: Date, required: true },
  resolved_at: Date,
  open: { type: Boolean, default: true },
  confirmed: { type: Boolean, default: true },
});
AttentionItemSchema.index({ kind: 1, company_id: 1 }, { unique: true, partialFilterExpression: { open: true } });
AttentionItemSchema.index({ resolved_at: 1, severity: 1, first_seen_at: 1 });
AttentionItemSchema.index({ company_id: 1, open: 1 });

export const AttentionItem = model<IAttentionItem>('AttentionItem', AttentionItemSchema);
