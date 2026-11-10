import { Schema, model, Types } from 'mongoose';

/** Per-org monotonic sequence for PlatformEvent (06 §1). */
export interface IOrgEventCounter {
  _id: Types.ObjectId; // org_id
  seq: number;
}

const OrgEventCounterSchema = new Schema<IOrgEventCounter>({
  _id: { type: Schema.Types.ObjectId, required: true },
  seq: { type: Number, required: true, default: 0 },
}, { versionKey: false });

export const OrgEventCounter = model<IOrgEventCounter>('OrgEventCounter', OrgEventCounterSchema);
