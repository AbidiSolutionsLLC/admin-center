// server/src/models/App.model.ts
import { Schema, model, Document, Types } from 'mongoose';

/** DRD §8.2: the OIDC client of a standalone portal (registered in the Command Center, served by identity/providers.ts). */
export interface IStandaloneClient {
  type: 'confidential' | 'public';
  redirect_uris: string[];
  post_logout_redirect_uris: string[];
  backchannel_logout_uri?: string;
  token_endpoint_auth?: 'client_secret_basic' | 'client_secret_post' | 'private_key_jwt';
  jwks_uri?: string;
  /** Client secret encrypted with lib/cryptoService. Never selected by default (`+hosting.client.secret_enc`). */
  secret_enc?: string;
  secret_set_at?: Date;
  /** The secret replaced by the last rotation; accepted until `previous_secret_expires_at` (24 h). */
  previous_secret_enc?: string;
  previous_secret_expires_at?: Date;
}

/** DRD §8.2 standalone `hosting` fields. Suite products have no `hosting` object. */
export interface IAppHosting {
  launch_url?: string;
  client?: IStandaloneClient;
  health_url?: string;
  per_tenant_launch_url?: boolean;
}

export interface IApp extends Document {
  name: string;
  slug: string;
  description?: string;
  icon_url?: string;
  category: string;
  provider?: string;
  status: 'active' | 'inactive' | 'maintenance';
  is_system_app: boolean;
  company_id?: Types.ObjectId;
  owner_id?: Types.ObjectId;
  is_active: boolean;
  /** Slugs of apps that must be assigned first */
  dependencies?: string[];
  /** Slugs of apps that cannot be assigned together with this app */
  mutually_exclusive?: string[];
  /** 04 §4 product registry */
  app_type?: 'karbexa_product' | 'third_party';
  product_key?: string;
  launch_url?: string;
  role_catalog_version?: number;
  default_role_key?: string;
  /** Product manifest (plan 1.2); version of the last published/seeded manifest. */
  manifest_version?: number;
  product_status?: 'active' | 'beta' | 'hidden' | 'retired';
  icon?: string;
  /** Entry page in the products web app; launch_url is derived from it. */
  launch_path?: string;
  product_category?: string;
  /** Roles granted to the org's "All Members" group when the product is entitled. */
  default_assignments?: { target: 'all_members'; role: string }[];
  /** DRD §2.3/§8.2: `standalone` = a delivered portal registered by an operator; absent = a suite product. */
  hosting_mode?: 'suite' | 'standalone';
  hosting?: IAppHosting;
  registered_at?: Date;
  created_at: Date;
  updated_at: Date;
}

const AppSchema = new Schema<IApp>({
  name: { type: String, required: true },
  slug: { type: String, required: true },
  description: String,
  icon_url: String,
  category: { type: String, required: true },
  provider: String,
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active',
  },
  is_system_app: { type: Boolean, default: false },
  company_id: { type: Schema.Types.ObjectId, ref: 'Company' },
  owner_id: { type: Schema.Types.ObjectId, ref: 'User' },
  is_active: { type: Boolean, default: true },
  dependencies: [{ type: String }],
  mutually_exclusive: [{ type: String }],
  app_type: { type: String, enum: ['karbexa_product', 'third_party'], default: 'third_party' },
  product_key: { type: String },
  launch_url: String,
  role_catalog_version: { type: Number, default: 1 },
  default_role_key: String,
  manifest_version: Number,
  product_status: { type: String, enum: ['active', 'beta', 'hidden', 'retired'], default: 'active' },
  icon: String,
  launch_path: String,
  product_category: String,
  default_assignments: [{ _id: false, target: { type: String, enum: ['all_members'], required: true }, role: { type: String, required: true } }],
  hosting_mode: { type: String, enum: ['suite', 'standalone'] },
  hosting: {
    launch_url: String,
    client: {
      type: { type: String, enum: ['confidential', 'public'] },
      redirect_uris: { type: [String], default: undefined },
      post_logout_redirect_uris: { type: [String], default: undefined },
      backchannel_logout_uri: String,
      token_endpoint_auth: { type: String, enum: ['client_secret_basic', 'client_secret_post', 'private_key_jwt'] },
      jwks_uri: String,
      secret_enc: { type: String, select: false },
      secret_set_at: Date,
      previous_secret_enc: { type: String, select: false },
      previous_secret_expires_at: Date,
    },
    health_url: String,
    per_tenant_launch_url: Boolean,
  },
  registered_at: Date,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Unique index for system apps (slug only) and company apps (company_id + slug)
AppSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { company_id: { $exists: false } } });
AppSchema.index({ company_id: 1, slug: 1 }, { unique: true, partialFilterExpression: { company_id: { $exists: true } } });
AppSchema.index({ company_id: 1, is_active: 1 });
AppSchema.index({ category: 1, is_active: 1 });

export const App = model<IApp>('App', AppSchema);
