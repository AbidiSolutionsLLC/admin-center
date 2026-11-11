import { Schema, model } from 'mongoose';

/** Cross-instance lease (L9): one document per named job; only the holder until `until` may run it. */
export interface IPlatformLease {
  _id: string;
  holder: string;
  until: Date;
}

const PlatformLeaseSchema = new Schema<IPlatformLease>({
  _id: { type: String, required: true },
  holder: { type: String, required: true },
  until: { type: Date, required: true },
}, { timestamps: false });

export const PlatformLease = model<IPlatformLease>('PlatformLease', PlatformLeaseSchema);
