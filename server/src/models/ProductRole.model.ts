// server/src/models/ProductRole.model.ts — 04 §5
import { Schema, model, Document, Types } from 'mongoose';

export type ProductKey = 'admin' | 'people' | 'projects' | 'sign' | 'desk';
export const PRODUCT_KEYS: ProductKey[] = ['admin', 'people', 'projects', 'sign', 'desk'];

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
  product_key: { type: String, enum: PRODUCT_KEYS, required: true },
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
