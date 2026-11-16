// server/src/models/SeatUsage.model.ts — seats in use per tenant and product (DRD 3.2 rule 6, 4.1). Written by lib/seats.ts.
import { Schema, model, Document, Types } from 'mongoose';

export interface ISeatUsage extends Document {
  company_id: Types.ObjectId;
  product_key: string;
  /** Distinct members with effective access to the product when `computed_at` ran. */
  used: number;
  computed_at: Date;
}

const SeatUsageSchema = new Schema<ISeatUsage>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  product_key: { type: String, required: true },
  used: { type: Number, required: true, min: 0 },
  computed_at: { type: Date, required: true },
});

SeatUsageSchema.index({ company_id: 1, product_key: 1 }, { unique: true });

export const SeatUsage = model<ISeatUsage>('SeatUsage', SeatUsageSchema);
