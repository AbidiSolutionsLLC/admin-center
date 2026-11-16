// server/src/models/OrganizationEntitlement.model.ts — 04 §6
import { Schema, model, Document, Types } from 'mongoose';
import { ProductKey } from './ProductRole.model';

export interface IOrganizationEntitlement extends Document {
  company_id: Types.ObjectId;
  product_key: ProductKey;
  status: 'active' | 'suspended';
  /** recorded and shown; not enforced at launch */
  seats_limit?: number;
  source: 'plan' | 'operator' | 'seed';
  plan_key?: string;
  updated_by_operator_id?: Types.ObjectId;
}

const OrganizationEntitlementSchema = new Schema<IOrganizationEntitlement>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  product_key: { type: String, required: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  seats_limit: Number,
  source: { type: String, enum: ['plan', 'operator', 'seed'], default: 'operator' },
  plan_key: String,
  updated_by_operator_id: { type: Schema.Types.ObjectId, ref: 'OperatorAccount' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

OrganizationEntitlementSchema.index({ company_id: 1, product_key: 1 }, { unique: true });

export const OrganizationEntitlement = model<IOrganizationEntitlement>('OrganizationEntitlement', OrganizationEntitlementSchema);
