// server/src/models/IdentityProviderConnection.model.ts
// Per-org upstream IdP (03 §1.3). Sprint 1: `entra` only. DNS TXT domain verification is
// deferred — `domains[].verified_at` is never set yet, so domains have no routing/JIT effect.
import { Schema, model, Document, Types } from 'mongoose';

export type IdpType = 'entra' | 'oidc' | 'saml';
export type IdpStatus = 'draft' | 'active' | 'disabled';
export type JitProvisioning = 'off' | 'create_member';

export interface IIdpDomain {
  domain: string;
  verification_token: string;
  verified_at?: Date;
}

export interface IIdentityProviderConnection extends Document {
  company_id: Types.ObjectId;
  type: IdpType;
  display_name: string;
  status: IdpStatus;
  config: {
    tenant_id?: string; // entra — platform multi-tenant app; client id/secret live in env/Key Vault
    issuer?: string; // oidc (later)
    client_id?: string;
    client_secret_ref?: string;
    scopes?: string[];
    idp_entity_id?: string; // saml (later)
    sso_url?: string;
    x509_certs?: string[];
  };
  domains: IIdpDomain[];
  jit_provisioning: JitProvisioning;
  enforce_sso: boolean;
  created_at: Date;
  updated_at: Date;
}

const IdentityProviderConnectionSchema = new Schema<IIdentityProviderConnection>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  type: { type: String, enum: ['entra', 'oidc', 'saml'], required: true },
  display_name: { type: String, required: true },
  status: { type: String, enum: ['draft', 'active', 'disabled'], default: 'draft' },
  config: {
    tenant_id: { type: String, lowercase: true, trim: true },
    issuer: String,
    client_id: String,
    client_secret_ref: String,
    scopes: [{ type: String }],
    idp_entity_id: String,
    sso_url: String,
    x509_certs: [{ type: String }],
  },
  domains: [{
    _id: false,
    domain: { type: String, required: true, lowercase: true, trim: true },
    verification_token: { type: String, required: true },
    verified_at: Date,
  }],
  jit_provisioning: { type: String, enum: ['off', 'create_member'], default: 'off' },
  enforce_sso: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// n9: an Entra tenant may back only one active connection platform-wide
IdentityProviderConnectionSchema.index(
  { 'config.tenant_id': 1 },
  { unique: true, partialFilterExpression: { type: 'entra', status: 'active' } },
);

// 03 §2: a verified domain is unique platform-wide
IdentityProviderConnectionSchema.index(
  { 'domains.domain': 1 },
  { unique: true, partialFilterExpression: { 'domains.verified_at': { $exists: true } } },
);

export const IdentityProviderConnection = model<IIdentityProviderConnection>(
  'IdentityProviderConnection',
  IdentityProviderConnectionSchema,
);
