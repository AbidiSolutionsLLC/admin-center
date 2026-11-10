// server/src/models/Session.model.ts
// One SSO session per browser login (03 §1.4). `_id` = the `sid` access-token claim
// (= oidc-provider session uid). `revoked_at` is the revocation source of truth (03 §7).
import { Schema, model, Document, Types } from 'mongoose';

export type SessionRealm = 'tenant' | 'operator';

export interface ISession extends Omit<Document, '_id'> {
  _id: string;
  identity_id: Types.ObjectId;
  member_id: Types.ObjectId;
  company_id: Types.ObjectId;
  realm: SessionRealm;
  created_at: Date;
  last_seen_at: Date;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  revoked_at?: Date;
  revoked_reason?: string;
  amr: string[];
  ip?: string;
  user_agent?: string;
}

const SessionSchema = new Schema<ISession>({
  _id: { type: String, required: true },
  identity_id: { type: Schema.Types.ObjectId, ref: 'Identity', required: true, index: true },
  member_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  realm: { type: String, enum: ['tenant', 'operator'], required: true },
  created_at: { type: Date, default: Date.now },
  last_seen_at: { type: Date, default: Date.now },
  idle_expires_at: { type: Date, required: true },
  absolute_expires_at: { type: Date, required: true },
  revoked_at: Date,
  revoked_reason: String,
  amr: [{ type: String }],
  ip: String,
  user_agent: String,
}, { timestamps: false });

SessionSchema.index({ company_id: 1, revoked_at: 1 });
// Keep revoked/expired rows 30 days for audit + products' revocation pull, then purge.
SessionSchema.index({ absolute_expires_at: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export const Session = model<ISession>('Session', SessionSchema);
