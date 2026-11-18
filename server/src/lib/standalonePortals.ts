// server/src/lib/standalonePortals.ts — standalone portals (DRD §8, PRD §4.4 SP-1…SP-9).
// A standalone portal is a delivered application (Assets, Zyntrus) registered by an operator as a product with
// `hosting_mode: 'standalone'`. It is a normal registry product (App + ProductRole rows), so Apps & Access, seats and
// effective access treat it like a suite product; what differs is sign-in: it gets its own OIDC client in the tenant
// realm (`karbexa-<key>`, audience `urn:karbexa:<key>`), an access gate and back-channel sign-out.
import crypto from 'crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { App, IApp, IStandaloneClient } from '../models/App.model';
import { ProductRole } from '../models/ProductRole.model';
import { OrganizationEntitlement } from '../models/OrganizationEntitlement.model';
import { User } from '../models/User.model';
import { SecurityEvent } from '../models/SecurityEvent.model';
import { computeEffectiveAccess } from './effectiveAccess';
import { decrypt } from './cryptoService';
import { RESERVED_PRODUCT_KEY } from './productRegistry';

export const PRODUCT_KEY_RE = /^[a-z][a-z0-9_]{1,30}$/;
const ROLE_KEY_RE = /^[a-z][a-z0-9_]{1,40}$/;
export const CLIENT_ID_PREFIX = 'karbexa-';
/** Scopes a standalone client may request (DRD §8.3). */
export const STANDALONE_SCOPE = 'openid profile email offline_access';
/** A rotated secret stays valid this long (DRD §8.2). */
export const PREVIOUS_SECRET_GRACE_MS = 24 * 60 * 60 * 1000;
const SECRETS_SELECT = '+hosting.client.secret_enc +hosting.client.previous_secret_enc';

export const clientIdFor = (key: string) => `${CLIENT_ID_PREFIX}${key}`;
export const audienceFor = (key: string) => `urn:karbexa:${key}`;

/** Product key of a standalone client id (`karbexa-<key>`), or null for anything else. Never 'admin'. */
export function keyFromClientId(clientId: unknown): string | null {
  if (typeof clientId !== 'string' || !clientId.startsWith(CLIENT_ID_PREFIX)) return null;
  const key = clientId.slice(CLIENT_ID_PREFIX.length);
  return PRODUCT_KEY_RE.test(key) && key !== RESERVED_PRODUCT_KEY ? key : null;
}

const isProd = () => process.env.NODE_ENV === 'production';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Why a portal URL is refused, or null when it is acceptable: absolute https, no wildcard, credentials or fragment.
 * Outside production a loopback http URL is accepted (local portals and the smoke test's fake relying party).
 */
export function portalUrlProblem(raw: string, prod = isProd()): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return 'is not a valid absolute URL'; }
  if (raw.includes('*')) return 'must not contain a wildcard';
  if (u.username || u.password) return 'must not contain credentials';
  if (u.hash || raw.includes('#')) return 'must not contain a fragment';
  if (u.protocol === 'https:') return null;
  if (u.protocol === 'http:' && !prod && LOOPBACK.has(u.hostname)) return null;
  return 'must use https';
}

const portalUrl = z.string().trim().max(500).superRefine((v, ctx) => {
  const problem = portalUrlProblem(v);
  if (problem) ctx.addIssue({ code: 'custom', message: problem });
});

const roleSchema = z.object({
  key: z.string().regex(ROLE_KEY_RE),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  rank: z.number().int().min(1),
  is_default: z.boolean().optional(),
  assignable: z.boolean().optional(),
});

/**
 * `PUT /operator/v1/products/:key` body: the product manifest (DRD §2.2) with standalone hosting (§8.2).
 * Role rules are the publish endpoint's (platform/manifest.ts): unique keys, exactly one default, default_assignments
 * name an existing role. Role keys are the portal's own role identifiers (no translation layer, DRD §8.5).
 */
export const standaloneManifestSchema = z.object({
  manifest_version: z.literal(1),
  key: z.string().regex(PRODUCT_KEY_RE),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(160).default(''),
  icon: z.string().trim().min(1).max(64),
  category: z.enum(['core', 'work', 'it', 'talent']),
  status: z.enum(['active', 'beta', 'hidden', 'retired']),
  version: z.number().int().min(1),
  hosting: z.object({
    mode: z.literal('standalone'),
    launch_url: portalUrl,
    client: z.object({
      type: z.enum(['confidential', 'public']),
      redirect_uris: z.array(portalUrl).min(1).max(20),
      post_logout_redirect_uris: z.array(portalUrl).max(20).default([]),
      backchannel_logout_uri: portalUrl.optional(),
      token_endpoint_auth: z.enum(['client_secret_basic', 'client_secret_post', 'private_key_jwt']).optional(),
      jwks_uri: portalUrl.optional(),
    }),
    health_url: portalUrl.optional(),
    per_tenant_launch_url: z.boolean().default(false),
  }),
  roles: z.array(roleSchema).min(1).max(100),
  default_assignments: z.array(z.object({ target: z.literal('all_members'), role: z.string() })).max(20).optional(),
  capabilities: z.object({ seats: z.boolean(), external_users: z.boolean().optional(), offboarding: z.boolean().optional() }).optional(),
}).superRefine((b, ctx) => {
  if (b.key === RESERVED_PRODUCT_KEY) ctx.addIssue({ code: 'custom', path: ['key'], message: "key 'admin' is reserved" });
  const keys = b.roles.map((r) => r.key);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', path: ['roles'], message: 'duplicate role key' });
  if (b.roles.filter((r) => r.is_default).length !== 1) ctx.addIssue({ code: 'custom', path: ['roles'], message: 'exactly one role must have is_default=true' });
  for (const a of b.default_assignments ?? []) {
    if (!keys.includes(a.role)) ctx.addIssue({ code: 'custom', path: ['default_assignments'], message: `role '${a.role}' is not a role of this product` });
  }
  const c = b.hosting.client;
  if (c.type === 'public' && c.token_endpoint_auth) {
    ctx.addIssue({ code: 'custom', path: ['hosting', 'client', 'token_endpoint_auth'], message: 'a public client has no token endpoint authentication' });
  }
  if (c.token_endpoint_auth === 'private_key_jwt' && !c.jwks_uri) {
    ctx.addIssue({ code: 'custom', path: ['hosting', 'client', 'jwks_uri'], message: 'private_key_jwt needs jwks_uri' });
  }
  if (c.jwks_uri && c.token_endpoint_auth !== 'private_key_jwt') {
    ctx.addIssue({ code: 'custom', path: ['hosting', 'client', 'jwks_uri'], message: 'jwks_uri is only used with private_key_jwt' });
  }
});
export type StandaloneManifest = z.infer<typeof standaloneManifestSchema>;

/** One readable line from zod issues: `hosting.client.redirect_uris.0: must use https; …`. */
export function issuesText(err: z.ZodError): string {
  return err.issues.map((i) => (i.path.length ? `${i.path.map(String).join('.')}: ${i.message}` : i.message)).join('; ');
}

type ClientShape = Pick<IStandaloneClient, 'type' | 'token_endpoint_auth'>;

/** Token endpoint authentication the provider enforces: public → none; confidential → the stored method, default basic. */
export function authMethodOf(c: ClientShape | undefined): 'none' | 'client_secret_basic' | 'client_secret_post' | 'private_key_jwt' {
  if (!c || c.type !== 'confidential') return 'none';
  return c.token_endpoint_auth ?? 'client_secret_basic';
}

/** True when the client authenticates with a shared secret that Admin generates (DRD §8.2). */
export const usesClientSecret = (c: ClientShape | undefined) => {
  const m = authMethodOf(c);
  return m === 'client_secret_basic' || m === 'client_secret_post';
};

/** 32 random bytes, base64url. Shown once; stored only encrypted. */
export const generateClientSecret = () => crypto.randomBytes(32).toString('base64url');

const uniq = (list: string[]) => Array.from(new Set(list));

/** The client part of a validated manifest as stored on the App (URI lists de-duplicated, no secrets). */
export function storedClient(c: StandaloneManifest['hosting']['client']): Omit<IStandaloneClient, 'secret_enc' | 'secret_set_at' | 'previous_secret_enc' | 'previous_secret_expires_at'> {
  return {
    type: c.type,
    redirect_uris: uniq(c.redirect_uris),
    post_logout_redirect_uris: uniq(c.post_logout_redirect_uris),
    ...(c.backchannel_logout_uri ? { backchannel_logout_uri: c.backchannel_logout_uri } : {}),
    ...(c.type === 'confidential' ? { token_endpoint_auth: c.token_endpoint_auth ?? 'client_secret_basic' } : {}),
    ...(c.jwks_uri ? { jwks_uri: c.jwks_uri } : {}),
  };
}

/** Filter for the one system App of a product key. */
export const systemProduct = (key: string) => ({ product_key: key, app_type: 'karbexa_product' as const, company_id: { $exists: false } });

/** Registration as the Command Center shows it. Never contains a secret. */
export function standaloneView(app: any, roles: any[]) {
  const c = (app.hosting?.client ?? {}) as Partial<IStandaloneClient>;
  const prevValid = c.previous_secret_expires_at && new Date(c.previous_secret_expires_at).getTime() > Date.now();
  return {
    product_key: app.product_key,
    key: app.product_key,
    manifest_version: app.manifest_version ?? 1,
    name: app.name,
    description: app.description ?? '',
    icon: app.icon ?? '',
    category: app.product_category ?? '',
    status: app.product_status ?? 'active',
    version: app.role_catalog_version ?? 1,
    client_id: clientIdFor(app.product_key),
    audience: audienceFor(app.product_key),
    hosting: {
      mode: 'standalone' as const,
      launch_url: app.hosting?.launch_url ?? app.launch_url ?? '',
      client: {
        type: c.type ?? 'public',
        token_endpoint_auth: authMethodOf(c as ClientShape),
        redirect_uris: c.redirect_uris ?? [],
        post_logout_redirect_uris: c.post_logout_redirect_uris ?? [],
        backchannel_logout_uri: c.backchannel_logout_uri ?? null,
        jwks_uri: c.jwks_uri ?? null,
        has_secret: !!c.secret_set_at,
        secret_set_at: c.secret_set_at ?? null,
        previous_secret_expires_at: prevValid ? c.previous_secret_expires_at : null,
      },
      health_url: app.hosting?.health_url ?? null,
      per_tenant_launch_url: !!app.hosting?.per_tenant_launch_url,
    },
    roles: [...roles].sort((a, b) => b.rank - a.rank).map((r) => ({
      key: r.key, name: r.name, description: r.description, rank: r.rank, is_default: !!r.is_default, assignable: r.assignable !== false,
    })),
    default_assignments: app.default_assignments ?? [],
    registered_at: app.registered_at ?? app.created_at ?? null,
    updated_at: app.updated_at ?? null,
  };
}

// ── Registry reads (short in-process cache; a write on this process invalidates it) ──────────

const TTL_MS = 10_000;
let appCache: { at: number; apps: IApp[] } | undefined;

/** Drop cached registrations (after a registration, rotation or tenant URL change on this process). */
export function invalidateStandalonePortals(): void { appCache = undefined; }

/**
 * Every standalone registration (lean, without secrets), cached 10 seconds. Other Admin instances pick up a change
 * within that time, so a registry change takes effect without a restart or deploy (DRD §8.3).
 */
export async function listStandaloneApps(): Promise<IApp[]> {
  if (appCache && Date.now() - appCache.at < TTL_MS) return appCache.apps;
  const apps = await App.find({
    app_type: 'karbexa_product', company_id: { $exists: false }, hosting_mode: 'standalone', product_key: { $exists: true, $ne: RESERVED_PRODUCT_KEY },
  }).sort({ product_key: 1 }).lean() as unknown as IApp[];
  appCache = { at: Date.now(), apps };
  return apps;
}

/** The standalone registration of `key` (cached, no secrets), or undefined. */
export async function getStandaloneApp(key: string): Promise<IApp | undefined> {
  return (await listStandaloneApps()).find((a) => a.product_key === key);
}

// ── OIDC client (DRD §8.3) ────────────────────────────────────────────────────────────────────
// Choice recorded in PROGRESS-WS-C.md: the tenant realm's oidc-provider reads standalone clients through its adapter
// (`Client` model, see identity/providers.ts). Every lookup reads the App row, so a registration, rotation or retirement
// is effective on the next request on every instance, with no restart and no cache to invalidate.

/** Extra client metadata kept on the provider's Client (identity/providers.ts `extraClientMetadata.properties`). */
export const EXTRA_CLIENT_METADATA = ['karbexa_product_key', 'karbexa_previous_secret', 'karbexa_previous_secret_expires_at'] as const;

/** Resource (audience) a client may obtain: the standalone audience, or undefined when `clientId` is not standalone. */
export const resourceForStandaloneClient = (clientId: unknown): string | undefined => {
  const key = keyFromClientId(clientId);
  return key ? audienceFor(key) : undefined;
};

/** `https://tenant.example.com` for each per-tenant launch URL, de-duplicated. */
export function originsOf(urls: string[]): string[] {
  const out = new Set<string>();
  for (const u of urls) { try { out.add(new URL(u).origin); } catch { /* stored values are validated; ignore a bad one */ } }
  return [...out];
}

/** The registered URIs plus, for each tenant origin, the same path on that origin (DRD §8.2 `per_tenant_launch_url`). */
export function withTenantOrigins(uris: string[], origins: string[]): string[] {
  const out = new Set(uris);
  for (const origin of origins) {
    for (const raw of uris) {
      try { const u = new URL(raw); out.add(`${origin}${u.pathname}${u.search}`); } catch { /* ignore */ }
    }
  }
  return [...out];
}

/**
 * oidc-provider client metadata for a registered standalone portal. Secrets are decrypted here, never logged.
 * `tenantOrigins` are the origins of the tenants' own launch URLs (only used when the portal is per-tenant).
 */
export function buildClientMetadata(app: any, tenantOrigins: string[] = []): Record<string, unknown> {
  const key: string = app.product_key;
  const c: Partial<IStandaloneClient> = app.hosting?.client ?? {};
  const method = authMethodOf(c as ClientShape);
  const perTenant = !!app.hosting?.per_tenant_launch_url;
  const origins = perTenant ? tenantOrigins : [];
  const md: Record<string, unknown> = {
    client_id: clientIdFor(key),
    application_type: 'web',
    token_endpoint_auth_method: method,
    redirect_uris: withTenantOrigins(c.redirect_uris ?? [], origins),
    post_logout_redirect_uris: withTenantOrigins(c.post_logout_redirect_uris ?? [], origins),
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: STANDALONE_SCOPE,
    client_name: app.name,
    karbexa_product_key: key,
  };
  if (method === 'private_key_jwt' && c.jwks_uri) md.jwks_uri = c.jwks_uri;
  if (method === 'client_secret_basic' || method === 'client_secret_post') {
    if (c.secret_enc) md.client_secret = decrypt(c.secret_enc);
    if (c.previous_secret_enc && c.previous_secret_expires_at && new Date(c.previous_secret_expires_at).getTime() > Date.now()) {
      md.karbexa_previous_secret = decrypt(c.previous_secret_enc);
      md.karbexa_previous_secret_expires_at = Math.floor(new Date(c.previous_secret_expires_at).getTime() / 1000);
    }
  }
  return md;
}

/** Adapter `Client.find`: metadata of `clientId` from the registry, or undefined (not a standalone client, not registered). */
export async function findStandaloneClientMetadata(clientId: string): Promise<Record<string, unknown> | undefined> {
  const key = keyFromClientId(clientId);
  if (!key) return undefined;
  const app: any = await App.findOne({ ...systemProduct(key), hosting_mode: 'standalone' }).select(SECRETS_SELECT).lean();
  if (!app?.hosting?.client) return undefined;
  const origins = app.hosting.per_tenant_launch_url
    ? originsOf(await OrganizationEntitlement.distinct('config.launch_url', { product_key: key, 'config.launch_url': { $type: 'string' } }) as string[])
    : [];
  return buildClientMetadata(app, origins);
}

/** Constant-time string comparison (the provider's own check hashes too; this one serves the rotated-out secret). */
export const secretsEqual = (a: string, b: string) =>
  crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());

// ── Access gate (DRD §8.4) ────────────────────────────────────────────────────────────────────

export type GateDenial = 'unavailable' | 'no_access';
export type GateOutcome =
  | { allowed: true; role: string; role_name: string }
  | { allowed: false; page: GateDenial; reason: string };

export interface GateFacts {
  /** The App row exists and is a registered standalone portal. */
  registered: boolean;
  productStatus?: string;
  /** Status of the organisation's entitlement; null/undefined = none. */
  entitlement?: string | null;
  /** Effective role of the member for this product (lib/effectiveAccess), if any. */
  role?: { key: string; name: string };
  /** Effective-access denial reason when there is no role (NO_ASSIGNMENT, MEMBER_NOT_ACTIVE, ...). */
  denial?: string;
  /** false when the authorization request's redirect URI is not one this organisation may use (per-tenant portals). */
  redirectAllowed?: boolean;
}

/**
 * The decision table of DRD §8.4, as a pure function. Order matters: what the organisation has (entitlement) comes before
 * what the member has (assignment), so a suspended entitlement reads "not available for your organisation" for everyone.
 */
export function decideGate(f: GateFacts): GateOutcome {
  if (!f.registered) return { allowed: false, page: 'unavailable', reason: 'NOT_REGISTERED' };
  if (f.productStatus === 'retired') return { allowed: false, page: 'unavailable', reason: 'PRODUCT_RETIRED' };
  if (!f.entitlement) return { allowed: false, page: 'unavailable', reason: 'NOT_ENTITLED' };
  if (f.entitlement !== 'active') return { allowed: false, page: 'unavailable', reason: `ENTITLEMENT_${f.entitlement.toUpperCase()}` };
  if (f.denial === 'ORG_SUSPENDED') return { allowed: false, page: 'unavailable', reason: 'ORG_SUSPENDED' };
  if (f.redirectAllowed === false) return { allowed: false, page: 'unavailable', reason: 'REDIRECT_NOT_ALLOWED' };
  if (f.role) return { allowed: true, role: f.role.key, role_name: f.role.name };
  return { allowed: false, page: 'no_access', reason: f.denial ?? 'NO_ASSIGNMENT' };
}

export interface GateResult {
  outcome: GateOutcome;
  app?: { product_key: string; name: string };
  company_id?: Types.ObjectId;
}

/** Facts for `(member, product)` from the database, then `decideGate`. Always reads fresh (no cache): it is the control. */
export async function evaluateGate(key: string, memberId: string, redirectUri?: string): Promise<GateResult> {
  const app: any = await App.findOne({ ...systemProduct(key), hosting_mode: 'standalone' }).lean();
  const user: any = Types.ObjectId.isValid(memberId) ? await User.findById(memberId).select('company_id').lean() : null;
  if (!app || !user) return { outcome: decideGate({ registered: !!app && !!user }), app: app ? { product_key: key, name: app.name } : undefined };
  const companyId = user.company_id as Types.ObjectId;
  const [ent, access] = await Promise.all([
    OrganizationEntitlement.findOne({ company_id: companyId, product_key: key }).select('status config').lean() as Promise<any>,
    computeEffectiveAccess(companyId, memberId),
  ]);
  const role = access.products[key];
  let redirectAllowed: boolean | undefined;
  if (redirectUri && app.hosting?.per_tenant_launch_url) {
    const allowed = new Set([...originsOf(app.hosting.client?.redirect_uris ?? []), ...originsOf(ent?.config?.launch_url ? [ent.config.launch_url] : [])]);
    let origin = '';
    try { origin = new URL(redirectUri).origin; } catch { /* not a URL: not allowed */ }
    redirectAllowed = allowed.has(origin);
  }
  return {
    app: { product_key: key, name: app.name },
    company_id: companyId,
    outcome: decideGate({
      registered: true, productStatus: app.product_status, entitlement: ent?.status ?? null,
      role: role ? { key: role.role, name: role.role_name } : undefined, denial: access.denials[key], redirectAllowed,
    }),
  };
}

/**
 * `product_access_denied` Security event (in SecurityEvent's type and enum since W2-2). Still written to the collection
 * directly, so the model's post-save hook does not run for it; it reads back like any other event.
 */
export async function logProductAccessDenied(p: { company_id?: Types.ObjectId | string; member_id?: string; key: string; reason: string; page: GateDenial; ip?: string; user_agent?: string; stage: 'authorize' | 'token' | 'userinfo' }): Promise<void> {
  try {
    await SecurityEvent.collection.insertOne({
      ...(p.company_id ? { company_id: new Types.ObjectId(String(p.company_id)) } : {}),
      ...(p.member_id && Types.ObjectId.isValid(p.member_id) ? { user_id: new Types.ObjectId(p.member_id) } : {}),
      event_type: 'product_access_denied', is_suspicious: false,
      ip_address: p.ip, user_agent: p.user_agent,
      metadata: { product_key: p.key, reason: p.reason, page: p.page, stage: p.stage },
      created_at: new Date(),
    } as never);
  } catch (err) {
    console.error('[standalone] could not record product_access_denied', err);
  }
}

// ── Claims (DRD §8.5) ─────────────────────────────────────────────────────────────────────────

export interface StandaloneClaimInput {
  memberId: string;
  authzVer?: number;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl?: string;
  memberType?: string;
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: string;
  sid?: string;
}

/**
 * Claims a standalone portal receives, on the ID token, the access token for `urn:karbexa:<key>` and userinfo. Exactly the
 * set of DRD §8.5: no Admin roles, no identity id, no other product's role. `picture` only when it is an absolute URL.
 */
export function buildStandaloneClaims(i: StandaloneClaimInput): Record<string, unknown> {
  const picture = i.avatarUrl && /^https?:\/\//i.test(i.avatarUrl) ? i.avatarUrl : undefined;
  return {
    sub: i.memberId,
    org: i.orgId,
    org_slug: i.orgSlug,
    org_name: i.orgName,
    email: i.email,
    email_verified: i.emailVerified,
    name: i.name,
    ...(picture ? { picture } : {}),
    product_role: i.role,
    member_type: i.memberType === 'external' ? 'external' : 'workforce',
    ...(i.sid ? { sid: i.sid } : {}),
    authz_ver: i.authzVer ?? 1,
  };
}

// ── Launcher (DRD §8.7) ───────────────────────────────────────────────────────────────────────

/** Tile target of a standalone portal: the organisation's own URL first (per-tenant portals only), else the portal's. */
export function launchUrlFor(app: { launch_url?: string; hosting?: { launch_url?: string; per_tenant_launch_url?: boolean } }, tenantUrl?: string | null): string {
  if (app.hosting?.per_tenant_launch_url && tenantUrl) return tenantUrl;
  return app.hosting?.launch_url ?? app.launch_url ?? '';
}

/**
 * Launch URLs of the standalone portals among `productKeys` for one organisation (key -> absolute URL, tenant override
 * first). Suite products are absent from the result. The listings that build launcher tiles call this
 * (`/me/apps`, the Platform API launcher catalog); it is scoped by `company_id`.
 */
export async function launchUrlsFor(companyId: Types.ObjectId | string, productKeys: string[]): Promise<Record<string, string>> {
  if (!productKeys.length) return {};
  const [apps, ents] = await Promise.all([
    App.find({ ...{ app_type: 'karbexa_product', company_id: { $exists: false } }, hosting_mode: 'standalone', product_key: { $in: productKeys } })
      .select('product_key launch_url hosting.launch_url hosting.per_tenant_launch_url').lean() as Promise<any[]>,
    OrganizationEntitlement.find({ company_id: companyId, product_key: { $in: productKeys } }).select('product_key config.launch_url').lean() as Promise<any[]>,
  ]);
  const tenant = new Map(ents.map((e) => [e.product_key as string, e.config?.launch_url as string | undefined]));
  return Object.fromEntries(apps.map((a) => [a.product_key as string, launchUrlFor(a, tenant.get(a.product_key))]));
}

export interface LauncherItem { product_key: string; name: string; launch_url: string; roles: Array<{ key: string; name: string }> }

/** One launcher entry (Platform API `GET /orgs/:orgId/launchers`): no secrets, no client settings; roles by rank, highest first. */
export function launcherItem(app: { product_key: string; name: string }, roles: Array<{ key: string; name: string; rank: number }>, url: string): LauncherItem {
  return {
    product_key: app.product_key,
    name: app.name,
    launch_url: url,
    roles: [...roles].sort((a, b) => b.rank - a.rank).map((r) => ({ key: r.key, name: r.name })),
  };
}

/**
 * Standalone portals one organisation holds an ACTIVE entitlement to (W2-LAUNCH): retired products and portals without
 * a usable launch URL are left out. `launch_url` is the tenant override first (`launchUrlsFor`). Scoped by `company_id`.
 */
export async function listLaunchers(companyId: Types.ObjectId | string): Promise<LauncherItem[]> {
  const ents: any[] = await OrganizationEntitlement.find({ company_id: companyId, status: 'active' }).select('product_key').lean();
  const keys = ents.map((e) => e.product_key as string);
  if (!keys.length) return [];
  const apps: any[] = await App.find({ app_type: 'karbexa_product', company_id: { $exists: false }, product_key: { $in: keys }, hosting_mode: 'standalone', product_status: { $ne: 'retired' } })
    .select('product_key name').sort({ product_key: 1 }).lean();
  if (!apps.length) return [];
  const appKeys = apps.map((a) => a.product_key as string);
  const [urls, roles] = await Promise.all([
    launchUrlsFor(companyId, appKeys),
    ProductRole.find({ product_key: { $in: appKeys } }).select('product_key key name rank').lean() as Promise<any[]>,
  ]);
  return apps
    .filter((a) => !!urls[a.product_key])
    .map((a) => launcherItem(a, roles.filter((r) => r.product_key === a.product_key), urls[a.product_key]));
}
