// server/src/models/OperatorSession.model.ts
// One row per operator sign-in (Plan 0.4). `_id` = the `sid` access-token claim (oidc-provider session uid).
// Operators have no identity/member/company, so they cannot use the tenant `Session` model.
import { Schema, model, Document } from 'mongoose';

export interface IOperatorSession extends Omit<Document, '_id'> {
  _id: string;
  operator_id: Schema.Types.ObjectId;
  created_at: Date;
  last_seen_at: Date;
  idle_expires_at: Date;
  revoked_at?: Date;
  revoked_reason?: string;
  ip?: string;
  user_agent?: string;
}

const OperatorSessionSchema = new Schema<IOperatorSession>({
  _id: { type: String, required: true },
  operator_id: { type: Schema.Types.ObjectId, ref: 'OperatorAccount', required: true },
  created_at: { type: Date, default: Date.now },
  last_seen_at: { type: Date, default: Date.now },
  idle_expires_at: { type: Date, required: true },
  revoked_at: Date,
  revoked_reason: String,
  ip: String,
  user_agent: String,
}, { timestamps: false });

OperatorSessionSchema.index({ operator_id: 1, revoked_at: 1 });
// Keep rows 30 days after the idle expiry for audit, then purge.
OperatorSessionSchema.index({ idle_expires_at: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export const OperatorSession = model<IOperatorSession>('OperatorSession', OperatorSessionSchema);
