// server/src/models/IdentityProviderConnection.model.ts
// Per-org upstream IdP (03 §1.3). Sprint 1: `entra` only. Domains are verified by DNS TXT (A3-1). An Entra
// connection can only be activated after a platform operator approved its tenant id (review M-2, decided 2026-11-12).
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
  /** Derived from `domains` on save: the verified domain names. Carries the platform-wide uniqueness index. */
  verified_domains?: string[];
  /** Operator approval of `config.tenant_id` (Entra). Activation requires it for the tenant id it names. */
  tenant_approval?: { tenant_id: string; approved_at: Date; operator_id: Types.ObjectId };
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
  verified_domains: { type: [String], default: undefined },
  tenant_approval: {
    type: new Schema({
      tenant_id: { type: String, required: true },
      approved_at: { type: Date, required: true },
      operator_id: { type: Schema.Types.ObjectId, required: true },
    }, { _id: false }),
    default: undefined,
  },
  jit_provisioning: { type: String, enum: ['off', 'create_member'], default: 'off' },
  enforce_sso: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// n9: an Entra tenant may back only one active connection platform-wide
IdentityProviderConnectionSchema.index(
  { 'config.tenant_id': 1 },
  { unique: true, partialFilterExpression: { type: 'entra', status: 'active' } },
);

// 03 §2: a verified domain is unique platform-wide. The index is on the derived `verified_domains` array, so only
// verified names take part: a partial filter on `domains.verified_at` would index every domain of a connection
// that has any verified domain (review M-1). `$type: 'string'` on an array matches when it has ≥ 1 element.
// Existing databases must drop the old `domains.domain_1` index (see the tracker).
IdentityProviderConnectionSchema.pre('validate', function () {
  const names = (this.domains || []).filter((d) => !!d.verified_at).map((d) => d.domain.toLowerCase());
  this.verified_domains = names.length ? names : undefined;
});
IdentityProviderConnectionSchema.index(
  { verified_domains: 1 },
  { unique: true, partialFilterExpression: { verified_domains: { $type: 'string' } } },
);

export const IdentityProviderConnection = model<IIdentityProviderConnection>(
  'IdentityProviderConnection',
  IdentityProviderConnectionSchema,
);
