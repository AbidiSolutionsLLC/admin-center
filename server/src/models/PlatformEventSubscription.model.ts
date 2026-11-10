import { Schema, model, Document } from 'mongoose';

/** One per consuming backend (06 §3). secret_ref names an env var; the secret itself is never stored. */
export interface IPlatformEventSubscription extends Document {
  name: string;
  url: string;
  secret_ref: string;
  status: 'active' | 'paused';
}

const PlatformEventSubscriptionSchema = new Schema<IPlatformEventSubscription>({
  name: { type: String, required: true, unique: true },
  url: { type: String, required: true },
  secret_ref: { type: String, required: true },
  status: { type: String, enum: ['active', 'paused'], default: 'active' },
}, { timestamps: true });

export const PlatformEventSubscription = model<IPlatformEventSubscription>('PlatformEventSubscription', PlatformEventSubscriptionSchema);
