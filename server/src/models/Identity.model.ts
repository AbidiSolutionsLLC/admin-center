// server/src/models/Identity.model.ts
// Global person record (03 §1.1). `_id` is the `idn` claim; memberships are `User` documents.
import { Schema, model, Document, Types } from 'mongoose';

export type IdentityStatus = 'active' | 'locked' | 'disabled';

export interface IFederatedLink {
  connection_id: Types.ObjectId;
  issuer: string;
  subject: string; // Entra: `oid` (never pairwise `sub`)
  linked_at: Date;
}

export interface IIdentityMfa {
  totp_secret_enc?: string; // encrypted with lib/cryptoService
  totp_enabled: boolean;
  recovery_codes_hash: string[]; // deferred (Sprint 2+): 10-pack recovery codes
  email_otp_enabled: boolean;
}

export interface IIdentity extends Document {
  _id: Types.ObjectId;
  email: string;
  email_verified_at?: Date;
  full_name: string;
  password_hash?: string; // bcrypt cost 12; absent for federation-only identities
  previous_password_hashes: string[];
  password_changed_at?: Date;
  mfa: IIdentityMfa;
  federated_links: IFederatedLink[];
  status: IdentityStatus;
  failed_login_attempts: number;
  locked_until?: Date;
  last_login_at?: Date;
  created_at: Date;
  updated_at: Date;
}

const FederatedLinkSchema = new Schema<IFederatedLink>({
  connection_id: { type: Schema.Types.ObjectId, ref: 'IdentityProviderConnection', required: true },
  issuer: { type: String, required: true },
  subject: { type: String, required: true },
  linked_at: { type: Date, default: Date.now },
}, { _id: false });

const IdentitySchema = new Schema<IIdentity>({
  email: { type: String, required: true, lowercase: true, trim: true },
  email_verified_at: Date,
  full_name: { type: String, required: true },
  password_hash: String,
  previous_password_hashes: [{ type: String }],
  password_changed_at: Date,
  mfa: {
    totp_secret_enc: String,
    totp_enabled: { type: Boolean, default: false },
    recovery_codes_hash: [{ type: String }],
    email_otp_enabled: { type: Boolean, default: false },
  },
  federated_links: { type: [FederatedLinkSchema], default: [] },
  status: { type: String, enum: ['active', 'locked', 'disabled'], default: 'active' },
  failed_login_attempts: { type: Number, default: 0 },
  locked_until: Date,
  last_login_at: Date,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// D11: email is globally unique across the platform
IdentitySchema.index({ email: 1 }, { unique: true });
// Federation link key = (issuer, subject)
IdentitySchema.index(
  { 'federated_links.issuer': 1, 'federated_links.subject': 1 },
  { unique: true, partialFilterExpression: { 'federated_links.subject': { $exists: true } } },
);

export const Identity = model<IIdentity>('Identity', IdentitySchema);
