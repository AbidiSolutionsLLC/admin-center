// server/src/models/Plan.model.ts — 04 §6 (operator-owned)
import { Schema, model, Document } from 'mongoose';
import { PRODUCT_KEYS, ProductKey } from './ProductRole.model';

export interface IPlan extends Document {
  key: string;
  name: string;
  products: ProductKey[];
  status: 'active' | 'archived';
}

const PlanSchema = new Schema<IPlan>({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  products: [{ type: String, enum: PRODUCT_KEYS }],
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const Plan = model<IPlan>('Plan', PlanSchema);
