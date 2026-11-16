// server/src/models/RateLimitWindow.model.ts
// One counter per rate-limit key and window (Plan 0.5). `_id` = `<limiter prefix>:<key>`.
// Written only by middleware/mongoRateLimitStore.ts. The TTL index removes rows after the window closes.
import { Schema, model } from 'mongoose';

export interface IRateLimitWindow {
  _id: string;
  hits: number;
  expires_at: Date;
}

const RateLimitWindowSchema = new Schema<IRateLimitWindow>({
  _id: { type: String, required: true },
  hits: { type: Number, required: true },
  expires_at: { type: Date, required: true },
}, { timestamps: false });

RateLimitWindowSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const RateLimitWindow = model<IRateLimitWindow>('RateLimitWindow', RateLimitWindowSchema);
