// server/src/identity/providers.ts
// One oidc-provider 9.13 instance per realm (03 §2, §3, §5, §10). Ported from the verified E1 spike.
import fs from 'fs';
import crypto from 'crypto';
import {
  ADMIN_AUDIENCE, ADMIN_SPA_CLIENT_ID, PRODUCTS_AUDIENCE, PRODUCTS_SPA_CLIENT_ID, PRODUCTS_BACKEND_CLIENT_ID, ADMIN_BACKEND_CLIENT_ID,
  OPERATOR_AUDIENCE, OPERATOR_SPA_CLIENT_ID, OPERATOR_SESSION_IDLE_S,
  PLATFORM_API_AUDIENCE, PLATFORM_API_SCOPES, PRODUCTS_INTERNAL_AUDIENCE, PRODUCTS_INTERNAL_SCOPES,
  ACCESS_TOKEN_TTL_S, SESSION_ABSOLUTE_MS, Realm, getIdentityConfig,
} from './config';
import { loadRealmKeys, loadCookieKeys } from './keys';
import { makeAdapter, initAdapterIndexes, TENANT_MODELS, OPERATOR_MODELS, SERVICES_MODELS } from './mongoAdapter';
import { findAccount, loadAccessContext } from './accounts';
import { ensureSessionForToken, revokeSession, SessionDeniedError } from './sessions';
import { findOperatorAccount } from '../operator/accounts';
import { escapeHtml, newNonce, pageCsp, pageShell } from './html';

// ESM-only package loaded through require(esm) (03 §10.2); the library ships no TS types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const oidc = require('oidc-provider') as { Provider: any; errors: Record<string, any> };
export const oidcErrors = oidc.errors;

export type OidcProvider = any;

const ABSOLUTE_S = Math.floor(SESSION_ABSOLUTE_MS / 1000);

const CLIENT_RESOURCE: Record<string, string> = {
  [ADMIN_SPA_CLIENT_ID]: ADMIN_AUDIENCE,
  [PRODUCTS_SPA_CLIENT_ID]: PRODUCTS_AUDIENCE,
};

let tenantProvider: OidcProvider | undefined;
let servicesProvider: OidcProvider | undefined;
let operatorProvider: OidcProvider | undefined;

export function getOperatorProvider(): OidcProvider {
  if (!operatorProvider) throw new Error('[identity] operator provider not initialised');
  return operatorProvider;
}

export function getTenantProvider(): OidcProvider {
  if (!tenantProvider) throw new Error('[identity] tenant provider not initialised');
  return tenantProvider;
}
export function getServicesProvider(): OidcProvider {
  if (!servicesProvider) throw new Error('[identity] services provider not initialised');
  return servicesProvider;
}

const ROUTES = {
  authorization: '/oauth/authorize',
  token: '/oauth/token',
  jwks: '/oauth/jwks',
  revocation: '/oauth/revoke',
  end_session: '/oauth/end_session',
  userinfo: '/oauth/userinfo',
};

function commonConfig(realm: Realm, cookieKeys: string[]) {
  const { secureCookies } = getIdentityConfig();
  const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: secureCookies };
  return {
    cookies: {
      keys: cookieKeys,
      names: { session: `${realm}_sess`, interaction: `${realm}_int`, resume: `${realm}_resume` },
      long: { ...cookieOpts, signed: true },
      short: { ...cookieOpts, signed: true },
    },
    routes: ROUTES,
    conformIdTokenClaims: true,
    renderError: async (ctx: any, out: Record<string, string>) => {
      const nonce = newNonce();
      ctx.type = 'html';
      ctx.set('Content-Security-Policy', pageCsp(nonce));
      const detail = Object.entries(out).map(([k, v]) => `<p><strong>${escapeHtml(k)}</strong>: ${escapeHtml(String(v))}</p>`).join('');
      ctx.body = pageShell(nonce, 'Sign-in error', `<h1>Something went wrong</h1>${detail}`);
    },
  };
}

function applyProxy(provider: OidcProvider) {
  const trust = process.env.TRUST_PROXY ?? '1';
  provider.proxy = !(trust === '0' || trust === 'false');
  if (!isNaN(Number(trust)) && Number(trust) > 0) provider.maxIpsCount = Number(trust);
}

function logProviderErrors(name: string, provider: OidcProvider) {
  provider.on('server_error', (_ctx: unknown, err: Error) => console.error(`[identity:${name}] server_error`, err));
}

function amrFromContext(ctx: any): string[] {
  const ent = ctx?.oidc?.entities || {};
  const amr = ent.AuthorizationCode?.amr ?? ent.RefreshToken?.amr ?? ent.Session?.amr;
  return Array.isArray(amr) ? amr : [];
}

async function buildTenant(cookieKeys: string[]): Promise<OidcProvider> {
  const cfg = getIdentityConfig();
  const { privateJwks } = await loadRealmKeys('tenant');
  const Adapter = makeAdapter('tenant');
  await initAdapterIndexes('tenant', TENANT_MODELS);

  const spaClient = (clientId: string, origin: string) => ({
    client_id: clientId,
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    redirect_uris: [`${origin}/auth/callback`],
    post_logout_redirect_uris: [`${origin}/login`, `${origin}/login?signed_out=1`],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'openid profile email',
  });

  const provider = new oidc.Provider(cfg.tenantIssuer, {
    ...commonConfig('tenant', cookieKeys),
    adapter: Adapter,
    jwks: privateJwks,
    clients: [
      spaClient(ADMIN_SPA_CLIENT_ID, cfg.adminSpaOrigin),
      spaClient(PRODUCTS_SPA_CLIENT_ID, cfg.productsSpaOrigin),
    ],
    responseTypes: ['code'],
    pkce: { required: () => true },
    scopes: ['openid', 'profile', 'email'],
    claims: { openid: ['sub'], email: ['email', 'email_verified'], profile: ['name'] },
    clientBasedCORS: (_ctx: unknown, origin: string, client: any) =>
      client.clientAuthMethod === 'none' && client.redirectUris.some((u: string) => new URL(u).origin === origin),
    ttl: {
      AccessToken: ACCESS_TOKEN_TTL_S,
      AuthorizationCode: 60,
      IdToken: 600,
      Interaction: 3600,
      Grant: ABSOLUTE_S,
      RefreshToken: ABSOLUTE_S,
      Session: ABSOLUTE_S,
    },
    features: {
      revocation: { enabled: true },
      userinfo: { enabled: true },
      devInteractions: { enabled: false },
      rpInitiatedLogout: {
        enabled: true,
        // One-redirect SPA logout: auto-submit the confirm form (nonce'd script, logout=yes).
        logoutSource: async (ctx: any, form: string) => {
          const nonce = newNonce();
          ctx.type = 'html';
          ctx.set('Content-Security-Policy', pageCsp(nonce));
          const withLogout = form.replace('</form>', '<input type="hidden" name="logout" value="yes"/><noscript><button type="submit">Sign out</button></noscript></form>');
          ctx.body = pageShell(nonce, 'Signing out', `<h1>Signing you out…</h1>${withLogout}<script nonce="${nonce}">document.getElementById('op.logoutForm').submit();</script>`);
        },
        postLogoutSuccessSource: async (ctx: any) => {
          const nonce = newNonce();
          ctx.type = 'html';
          ctx.set('Content-Security-Policy', pageCsp(nonce));
          ctx.body = pageShell(nonce, 'Signed out', `<h1>You are signed out</h1><p><a href="${escapeHtml(cfg.adminSpaOrigin)}/login">Sign in again</a></p>`);
        },
      },
      resourceIndicators: {
        enabled: true,
        defaultResource: (_ctx: unknown, client: any) => CLIENT_RESOURCE[client?.clientId] ?? ADMIN_AUDIENCE,
        useGrantedResource: () => true,
        getResourceServerInfo: (_ctx: unknown, resource: string, client: any) => {
          // Each SPA client may obtain exactly one audience (contract "resource / aud").
          if (!client || CLIENT_RESOURCE[client.clientId] !== resource) throw new oidc.errors.InvalidTarget();
          return { scope: 'api', audience: resource, accessTokenFormat: 'jwt', accessTokenTTL: ACCESS_TOKEN_TTL_S, jwt: { sign: { alg: 'RS256' } } };
        },
      },
    },
    issueRefreshToken: async (_ctx: unknown, client: any) => client.grantTypeAllowed('refresh_token'),
    rotateRefreshToken: true,
    interactions: { url: (_ctx: unknown, interaction: any) => `/realms/tenant/interaction/${interaction.uid}` },
    findAccount,
    // First-party clients: no consent screen — build the grant ourselves (03 §10.8).
    loadExistingGrant: async (ctx: any) => {
      const clientId = ctx.oidc.client.clientId;
      const grantId = ctx.oidc.result?.consent?.grantId || ctx.oidc.session.grantIdFor(clientId);
      if (grantId) {
        const existing = await ctx.oidc.provider.Grant.find(grantId);
        if (existing && existing.accountId === ctx.oidc.session.accountId) return existing;
      }
      const grant = new ctx.oidc.provider.Grant({ clientId, accountId: ctx.oidc.session.accountId });
      grant.addOIDCScope('openid profile email');
      grant.addResourceScope(CLIENT_RESOURCE[clientId], 'api');
      await grant.save();
      return grant;
    },
    extraTokenClaims: async (ctx: any, token: any) => {
      if (token.kind !== 'AccessToken') return undefined;
      const sid: string | undefined = token.sessionUid;
      if (!sid) throw new oidc.errors.InvalidGrant('token is not bound to a session');
      const access = await loadAccessContext(token.accountId);
      if (!access) {
        await revokeSession(sid, 'access_revoked');
        throw new oidc.errors.InvalidGrant('membership has no access');
      }
      const { user, identity, roles } = access;
      const amr = amrFromContext(ctx);
      try {
        await ensureSessionForToken({
          sid,
          memberId: user._id,
          identityId: identity._id,
          companyId: user.company_id,
          amr,
          ip: ctx?.ip,
          userAgent: ctx?.get?.('user-agent') || undefined,
        });
      } catch (err) {
        if (err instanceof SessionDeniedError) {
          await revokeSession(sid, err.reason === 'expired' ? 'expired' : 'denied');
          throw new oidc.errors.InvalidGrant(`session ${err.reason}`);
        }
        throw err;
      }
      return {
        idn: identity._id.toString(),
        org: user.company_id.toString(),
        sid,
        org_roles: roles,
        apps: [] as string[], // UX hint only (03 §5.1); effective-access projection is a later sprint
        authz_ver: user.authz_ver ?? 1,
        amr,
        token_use: 'access',
        email: identity.email,
      };
    },
  });

  applyProxy(provider);
  logProviderErrors('tenant', provider);
  provider.on('end_session.success', (ctx: any) => {
    const sid = ctx?.oidc?.session?.uid;
    if (sid) revokeSession(sid, 'end_session').catch((e) => console.error('[identity] end_session revoke failed', e));
  });
  return provider;
}

/** Public JWKS of a services-realm client: env var holds inline JSON (JWKS or single JWK) or a path to such a file. */
function readServicesClientJwks(envVar: string): { keys: unknown[] } | undefined {
  const raw = process.env[envVar]?.trim();
  if (!raw) return undefined;
  const text = raw.startsWith('{') ? raw : fs.readFileSync(raw, 'utf8');
  const parsed = JSON.parse(text);
  return Array.isArray(parsed.keys) ? parsed : { keys: [parsed] };
}

const SERVICE_RESOURCES: Record<string, string> = {
  [PLATFORM_API_AUDIENCE]: PLATFORM_API_SCOPES,
  [PRODUCTS_INTERNAL_AUDIENCE]: PRODUCTS_INTERNAL_SCOPES,
};
const SERVICE_CLIENT_RESOURCE: Record<string, string> = {
  [PRODUCTS_BACKEND_CLIENT_ID]: PLATFORM_API_AUDIENCE,
  [ADMIN_BACKEND_CLIENT_ID]: PRODUCTS_INTERNAL_AUDIENCE, // 03 §2: karbexa-admin-backend -> products-internal only
};

async function buildServices(cookieKeys: string[]): Promise<OidcProvider> {
  const cfg = getIdentityConfig();
  const { privateJwks } = await loadRealmKeys('services');
  await initAdapterIndexes('services', SERVICES_MODELS);
  const clients: unknown[] = [];
  const serviceClient = (clientId: string, jwks: { keys: unknown[] }, scope: string) => ({
    client_id: clientId,
    token_endpoint_auth_method: 'private_key_jwt',
    token_endpoint_auth_signing_alg: 'RS256',
    jwks,
    grant_types: ['client_credentials'],
    response_types: [],
    redirect_uris: [],
    scope,
  });
  const backendJwks = readServicesClientJwks('SERVICES_PRODUCTS_BACKEND_JWKS');
  if (backendJwks) clients.push(serviceClient(PRODUCTS_BACKEND_CLIENT_ID, backendJwks, PLATFORM_API_SCOPES));
  const adminBackendJwks = readServicesClientJwks('SERVICES_ADMIN_BACKEND_JWKS');
  if (adminBackendJwks) clients.push(serviceClient(ADMIN_BACKEND_CLIENT_ID, adminBackendJwks, PRODUCTS_INTERNAL_SCOPES));

  const provider = new oidc.Provider(cfg.servicesIssuer, {
    ...commonConfig('services', cookieKeys),
    adapter: makeAdapter('services'),
    jwks: privateJwks,
    clients,
    responseTypes: [],
    scopes: [...new Set(Object.values(SERVICE_RESOURCES).join(' ').split(' '))],
    features: {
      clientCredentials: { enabled: true },
      revocation: { enabled: true },
      userinfo: { enabled: false },
      devInteractions: { enabled: false },
      resourceIndicators: {
        enabled: true,
        defaultResource: (_ctx: unknown, client: any) => SERVICE_CLIENT_RESOURCE[client?.clientId] ?? PLATFORM_API_AUDIENCE,
        getResourceServerInfo: (_ctx: unknown, resource: string, client: any) => {
          if (!client || SERVICE_CLIENT_RESOURCE[client.clientId] !== resource || !SERVICE_RESOURCES[resource]) {
            throw new oidc.errors.InvalidTarget();
          }
          return { scope: SERVICE_RESOURCES[resource], audience: resource, accessTokenFormat: 'jwt', accessTokenTTL: ACCESS_TOKEN_TTL_S, jwt: { sign: { alg: 'RS256' } } };
        },
      },
    },
    ttl: { ClientCredentials: ACCESS_TOKEN_TTL_S },
    extraTokenClaims: async (_ctx: unknown, token: any) => (token.kind === 'ClientCredentials' ? { token_use: 'service' } : undefined),
  });
  applyProxy(provider);
  logProviderErrors('services', provider);
  return provider;
}

/** 09 §2 — separate realm for Karbexa staff: own issuer, key, audience, accounts (OperatorAccount). */
async function buildOperator(cookieKeys: string[]): Promise<OidcProvider> {
  const cfg = getIdentityConfig();
  const { privateJwks } = await loadRealmKeys('operator');
  await initAdapterIndexes('operator', OPERATOR_MODELS);
  const origin = cfg.operatorSpaOrigin;
  const provider = new oidc.Provider(cfg.operatorIssuer, {
    ...commonConfig('operator', cookieKeys),
    adapter: makeAdapter('operator'),
    jwks: privateJwks,
    clients: [{
      client_id: OPERATOR_SPA_CLIENT_ID,
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      redirect_uris: [`${origin}/operator/callback`],
      post_logout_redirect_uris: [`${origin}/operator`],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'openid profile email',
    }],
    responseTypes: ['code'],
    pkce: { required: () => true },
    scopes: ['openid', 'profile', 'email'],
    claims: { openid: ['sub'], email: ['email', 'email_verified'], profile: ['name'] },
    clientBasedCORS: (_ctx: unknown, o: string, client: any) =>
      client.clientAuthMethod === 'none' && client.redirectUris.some((u: string) => new URL(u).origin === o),
    // 09 §7: session idle 30 min.
    ttl: {
      AccessToken: ACCESS_TOKEN_TTL_S,
      AuthorizationCode: 60,
      IdToken: 600,
      Interaction: 3600,
      Grant: OPERATOR_SESSION_IDLE_S,
      RefreshToken: OPERATOR_SESSION_IDLE_S,
      Session: OPERATOR_SESSION_IDLE_S,
    },
    features: {
      revocation: { enabled: true },
      userinfo: { enabled: true },
      devInteractions: { enabled: false },
      rpInitiatedLogout: {
        enabled: true,
        logoutSource: async (ctx: any, form: string) => {
          const nonce = newNonce();
          ctx.type = 'html';
          ctx.set('Content-Security-Policy', pageCsp(nonce));
          const withLogout = form.replace('</form>', '<input type="hidden" name="logout" value="yes"/><noscript><button type="submit">Sign out</button></noscript></form>');
          ctx.body = pageShell(nonce, 'Signing out', `<h1>Signing you out…</h1>${withLogout}<script nonce="${nonce}">document.getElementById('op.logoutForm').submit();</script>`);
        },
        postLogoutSuccessSource: async (ctx: any) => {
          const nonce = newNonce();
          ctx.type = 'html';
          ctx.set('Content-Security-Policy', pageCsp(nonce));
          ctx.body = pageShell(nonce, 'Signed out', `<h1>You are signed out</h1><p><a href="${escapeHtml(origin)}/operator">Sign in again</a></p>`);
        },
      },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => OPERATOR_AUDIENCE,
        useGrantedResource: () => true,
        getResourceServerInfo: (_ctx: unknown, resource: string, client: any) => {
          if (!client || client.clientId !== OPERATOR_SPA_CLIENT_ID || resource !== OPERATOR_AUDIENCE) throw new oidc.errors.InvalidTarget();
          return { scope: 'api', audience: resource, accessTokenFormat: 'jwt', accessTokenTTL: ACCESS_TOKEN_TTL_S, jwt: { sign: { alg: 'RS256' } } };
        },
      },
    },
    issueRefreshToken: async (_ctx: unknown, client: any) => client.grantTypeAllowed('refresh_token'),
    rotateRefreshToken: true,
    interactions: { url: (_ctx: unknown, interaction: any) => `/realms/operator/interaction/${interaction.uid}` },
    findAccount: async (_ctx: unknown, id: string) => {
      const acct = await findOperatorAccount(id);
      if (!acct) return undefined;
      return {
        accountId: id,
        claims: async () => ({ sub: id, email: acct.email, email_verified: true, name: acct.full_name }),
      };
    },
    loadExistingGrant: async (ctx: any) => {
      const clientId = ctx.oidc.client.clientId;
      const grantId = ctx.oidc.result?.consent?.grantId || ctx.oidc.session.grantIdFor(clientId);
      if (grantId) {
        const existing = await ctx.oidc.provider.Grant.find(grantId);
        if (existing && existing.accountId === ctx.oidc.session.accountId) return existing;
      }
      const grant = new ctx.oidc.provider.Grant({ clientId, accountId: ctx.oidc.session.accountId });
      grant.addOIDCScope('openid profile email');
      grant.addResourceScope(OPERATOR_AUDIENCE, 'api');
      await grant.save();
      return grant;
    },
    extraTokenClaims: async (ctx: any, token: any) => {
      if (token.kind !== 'AccessToken') return undefined;
      const sid: string | undefined = token.sessionUid;
      if (!sid) throw new oidc.errors.InvalidGrant('token is not bound to a session');
      const acct = await findOperatorAccount(token.accountId);
      if (!acct) throw new oidc.errors.InvalidGrant('operator has no access');
      return { email: acct.email, roles: acct.roles, sid, token_use: 'access', amr: amrFromContext(ctx) };
    },
  });
  applyProxy(provider);
  logProviderErrors('operator', provider);
  return provider;
}

/** Build all realms (keys, adapter indexes, providers). Requires an open Mongoose connection. */
export async function initProviders(): Promise<{ tenant: OidcProvider; services: OidcProvider; operator: OidcProvider }> {
  if (tenantProvider && servicesProvider && operatorProvider) return { tenant: tenantProvider, services: servicesProvider, operator: operatorProvider };
  const cookieKeys = loadCookieKeys();
  // Distinct cookie signing keys per realm (03 §10.10), derived from the shared secret list.
  const realmKeys = (realm: Realm) => cookieKeys.map((k) => crypto.createHmac('sha256', k).update(`oidc-cookies:${realm}`).digest('base64url'));
  tenantProvider = await buildTenant(realmKeys('tenant'));
  servicesProvider = await buildServices(realmKeys('services'));
  operatorProvider = await buildOperator(realmKeys('operator'));
  return { tenant: tenantProvider, services: servicesProvider, operator: operatorProvider };
}
