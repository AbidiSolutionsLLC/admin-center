// server/src/models/ProductRole.model.ts — 04 §5
import { Schema, model, Document, Types } from 'mongoose';

/** Product keys are data (App where app_type = 'karbexa_product'), validated by lib/productRegistry. 'admin' is reserved. */
export type ProductKey = string;

export interface IProductRole extends Document {
  app_id: Types.ObjectId;
  product_key: ProductKey;
  key: string;
  name: string;
  description?: string;
  rank: number;
  is_default: boolean;
  assignable: boolean;
  catalog_version: number;
}

const ProductRoleSchema = new Schema<IProductRole>({
  app_id: { type: Schema.Types.ObjectId, ref: 'App', required: true, index: true },
  product_key: { type: String, required: true },
  key: { type: String, required: true },
  name: { type: String, required: true },
  description: String,
  rank: { type: Number, required: true },
  is_default: { type: Boolean, default: false },
  assignable: { type: Boolean, default: true },
  catalog_version: { type: Number, default: 1 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

ProductRoleSchema.index({ product_key: 1, key: 1 }, { unique: true });

export const ProductRole = model<IProductRole>('ProductRole', ProductRoleSchema);
