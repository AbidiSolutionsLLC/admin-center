// server/src/models/Plan.model.ts — 04 §6 (operator-owned)
import { Schema, model, Document } from 'mongoose';
import { ProductKey } from './ProductRole.model';

export interface IPlan extends Document {
  key: string;
  name: string;
  products: ProductKey[];
  status: 'active' | 'archived';
  description?: string;
  /** Default seat limit per product, copied to the entitlement when the plan is applied and it has no limit yet. */
  seat_defaults?: Map<string, number | null>;
  /** A tenant created on this plan gets `trial_ends_at` this many days ahead. */
  trial_days?: number | null;
  /** Raised on every edit; stored on entitlements (`plan_version`) to show "plan changed since applied". */
  version: number;
}

const PlanSchema = new Schema<IPlan>({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  products: [{ type: String }],
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  description: { type: String, maxlength: 500 },
  seat_defaults: { type: Map, of: Number, default: undefined },
  trial_days: { type: Number, min: 1, max: 365, default: null },
  version: { type: Number, default: 1 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const Plan = model<IPlan>('Plan', PlanSchema);
