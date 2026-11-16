// server/src/models/OrganizationEntitlement.model.ts — 04 §6
import { Schema, model, Document, Types } from 'mongoose';
import { ProductKey } from './ProductRole.model';

export interface IOrganizationEntitlement extends Document {
  company_id: Types.ObjectId;
  product_key: ProductKey;
  /** `restricted` = removed by a plan change: access off, data kept (DRD 3.1). Any value other than `active` means no access. */
  status: 'active' | 'suspended' | 'restricted';
  /** Enforced when product assignments are created (Plan 4.7) */
  seats_limit?: number;
  source: 'plan' | 'operator' | 'seed';
  plan_key?: string;
  /** Plan version when the plan was applied (Plan 4.5) */
  plan_version?: number;
  /** Required on an override (`source: 'operator'`): why it was set (Plan 4.6) */
  reason?: string;
  /** Overrides only: when it falls back to plan state (hourly job `lib/overrideJobs.ts`) */
  expires_at?: Date;
  updated_by_operator_id?: Types.ObjectId;
}

const OrganizationEntitlementSchema = new Schema<IOrganizationEntitlement>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  product_key: { type: String, required: true },
  status: { type: String, enum: ['active', 'suspended', 'restricted'], default: 'active' },
  seats_limit: Number,
  source: { type: String, enum: ['plan', 'operator', 'seed'], default: 'operator' },
  plan_key: String,
  plan_version: Number,
  reason: { type: String, maxlength: 500 },
  expires_at: Date,
  updated_by_operator_id: { type: Schema.Types.ObjectId, ref: 'OperatorAccount' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

OrganizationEntitlementSchema.index({ company_id: 1, product_key: 1 }, { unique: true });
OrganizationEntitlementSchema.index({ expires_at: 1 }, { sparse: true });

export const OrganizationEntitlement = model<IOrganizationEntitlement>('OrganizationEntitlement', OrganizationEntitlementSchema);
