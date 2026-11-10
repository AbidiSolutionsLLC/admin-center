import { Schema, model, Document, Types } from 'mongoose';

/** Delivery cursor per subscription x org (06 §3). */
export interface ISubscriptionCursor extends Document {
  subscription_id: Types.ObjectId;
  org_id: Types.ObjectId;
  last_nudged_seq: number;
  last_acknowledged_seq: number;
  last_error?: string;
  last_nudged_at?: Date;
  attempts: number;
  next_attempt_at?: Date;
}

const SubscriptionCursorSchema = new Schema<ISubscriptionCursor>({
  subscription_id: { type: Schema.Types.ObjectId, required: true, ref: 'PlatformEventSubscription' },
  org_id: { type: Schema.Types.ObjectId, required: true },
  last_nudged_seq: { type: Number, default: 0 },
  last_acknowledged_seq: { type: Number, default: 0 },
  last_error: String,
  last_nudged_at: Date,
  attempts: { type: Number, default: 0 },
  next_attempt_at: Date,
}, { timestamps: true });

SubscriptionCursorSchema.index({ subscription_id: 1, org_id: 1 }, { unique: true });

export const SubscriptionCursor = model<ISubscriptionCursor>('SubscriptionCursor', SubscriptionCursorSchema);
