// server/src/models/InviteToken.model.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IInviteToken extends Document {
  user_id: mongoose.Types.ObjectId;
  token_hash: string;          // SHA-256 hash of the raw token
  expires_at: Date;
  used_at?: Date;              // set when token is consumed
  is_used: boolean;
}

const InviteTokenSchema = new Schema<IInviteToken>({
  user_id:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  token_hash: { type: String, required: true, unique: true },
  expires_at: { type: Date,   required: true },
  used_at:    { type: Date,   default: null },
  is_used:    { type: Boolean, default: false },
}, { timestamps: true });

// Auto-expire documents 72 hours after creation
InviteTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const InviteToken = mongoose.model<IInviteToken>('InviteToken', InviteTokenSchema);
