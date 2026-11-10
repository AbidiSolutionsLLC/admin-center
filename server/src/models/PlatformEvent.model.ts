import { Schema, model, Document, Types } from 'mongoose';
import crypto from 'crypto';
import { AppError } from '../utils/AppError';

export interface IPlatformEvent extends Document {
  id: string;
  type: string;
  version: number;
  occurred_at: Date;
  org_id: Types.ObjectId;
  seq: number;
  subject: { type: string; id: string };
  actor: { type: 'member' | 'operator' | 'system'; id?: string };
  correlation_id?: string;
  data: Record<string, unknown>;
}

const PlatformEventSchema = new Schema<IPlatformEvent>({
  id: { type: String, required: true, unique: true, default: () => `evt_${crypto.randomUUID()}` },
  type: { type: String, required: true, index: true },
  version: { type: Number, default: 1 },
  occurred_at: { type: Date, default: Date.now },
  org_id: { type: Schema.Types.ObjectId, required: true },
  seq: { type: Number, required: true },
  subject: {
    type: new Schema({ type: { type: String, required: true }, id: { type: String, required: true } }, { _id: false }),
    required: true,
  },
  actor: {
    type: new Schema({ type: { type: String, enum: ['member', 'operator', 'system'], required: true }, id: String }, { _id: false }),
    required: true,
  },
  correlation_id: { type: String, index: true },
  data: { type: Schema.Types.Mixed, default: {} },
}, { versionKey: false });

PlatformEventSchema.index({ org_id: 1, seq: 1 }, { unique: true });
PlatformEventSchema.index({ occurred_at: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

PlatformEventSchema.pre('save', function () {
  if (!this.isNew) throw new AppError('Platform events are append-only.', 400, 'CANNOT_MODIFY_PLATFORM_EVENT');
});

const blockMutation = function () {
  throw new AppError('Platform events are append-only.', 400, 'CANNOT_MODIFY_PLATFORM_EVENT');
};
PlatformEventSchema.pre('updateOne', blockMutation);
PlatformEventSchema.pre('updateMany', blockMutation);
PlatformEventSchema.pre('findOneAndUpdate', blockMutation);
PlatformEventSchema.pre('deleteOne', blockMutation);
PlatformEventSchema.pre('deleteMany', blockMutation);
PlatformEventSchema.pre('findOneAndDelete', blockMutation);

export const PlatformEvent = model<IPlatformEvent>('PlatformEvent', PlatformEventSchema);
