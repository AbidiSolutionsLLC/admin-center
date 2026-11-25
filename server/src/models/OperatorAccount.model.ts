// server/src/models/OperatorAccount.model.ts — 09 §2
import { Schema, model, Document, Types } from 'mongoose';

export interface IOperatorAccount extends Document {
  email: string;
  full_name: string;
  password_hash: string;
  mfa: { enabled: boolean; secret_enc?: string; verified_at?: Date; last_step?: number };
  roles: string[]; // launch: ['platform_admin']
  status: 'active' | 'suspended' | 'invited';
  last_login_at?: Date;
  failed_attempts: number;
  locked_until?: Date;
  /** Set when the account was created through `POST /operators/invite` (Plan 4.11). */
  invited_by?: Types.ObjectId;
}

const OperatorAccountSchema = new Schema<IOperatorAccount>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  full_name: { type: String, required: true },
  password_hash: { type: String, required: true },
  mfa: {
    enabled: { type: Boolean, default: false },
    secret_enc: String,
    verified_at: Date,
    last_step: Number, // last accepted TOTP time step: a code is accepted once (replay guard)
  },
  roles: { type: [String], default: ['platform_admin'] },
  status: { type: String, enum: ['active', 'suspended', 'invited'], default: 'active' },
  last_login_at: Date,
  failed_attempts: { type: Number, default: 0 },
  locked_until: Date,
  invited_by: { type: Schema.Types.ObjectId, ref: 'OperatorAccount' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const OperatorAccount = model<IOperatorAccount>('OperatorAccount', OperatorAccountSchema);
