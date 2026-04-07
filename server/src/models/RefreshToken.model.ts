// server/src/models/RefreshToken.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IRefreshToken extends Document {
  user_id: Types.ObjectId;
  token_hash: string;
  expires_at: Date;
  ip_address?: string;
  user_agent?: string;
  is_revoked: boolean;
}

const RefreshTokenSchema = new Schema<IRefreshToken>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token_hash: { type: String, required: true },
  expires_at: { type: Date, required: true },
  ip_address: String,
  user_agent: String,
  is_revoked: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Automatically delete expired tokens
RefreshTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<IRefreshToken>('RefreshToken', RefreshTokenSchema);
