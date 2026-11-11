// server/src/identity/config.ts
// Identity module configuration (03 §2, §3; sprint1-contract "Local dev hosts").
// Read lazily so callers (e.g. the smoke script) can set env vars before the first call.

export type Realm = 'tenant' | 'services' | 'operator';

export const ADMIN_AUDIENCE = 'urn:karbexa:admin';
export const PRODUCTS_AUDIENCE = 'urn:karbexa:products';
export const PLATFORM_API_AUDIENCE = 'urn:karbexa:platform-api';
export const PRODUCTS_INTERNAL_AUDIENCE = 'urn:karbexa:products-internal';

export const OPERATOR_AUDIENCE = 'urn:karbexa:operator';
export const OPERATOR_SPA_CLIENT_ID = 'karbexa-operator-spa';
export const OPERATOR_SESSION_IDLE_S = 30 * 60; // 09 §7

export const ADMIN_SPA_CLIENT_ID = 'karbexa-admin-spa';
export const PRODUCTS_SPA_CLIENT_ID = 'karbexa-products-spa';
export const PRODUCTS_BACKEND_CLIENT_ID = 'karbexa-products-backend';
export const ADMIN_BACKEND_CLIENT_ID = 'karbexa-admin-backend';

/** 03 §4.1 — membership lifecycle states that may sign in. */
export const ACCESS_STATES = ['onboarding', 'active', 'probation', 'on_leave'] as const;

/** 03 §5.3 — session lifetimes. */
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
export const ACCESS_TOKEN_TTL_S = 600;

/** 03 §3 — services realm scopes per audience. */
export const PLATFORM_API_SCOPES = 'platform.org.read platform.members.read platform.access.read platform.sessions.read platform.events.read platform.role_catalog.write';
export const PRODUCTS_INTERNAL_SCOPES = 'products.internal.read';

export interface IdentityConfig {
  issuerOrigin: string;
  tenantIssuer: string;
  servicesIssuer: string;
  operatorIssuer: string;
  operatorSpaOrigin: string;
  adminSpaOrigin: string;
  productsSpaOrigin: string;
  secureCookies: boolean;
  isProduction: boolean;
  entra: { clientId?: string; clientSecret?: string };
}

const trimSlash = (v: string) => v.replace(/\/+$/, '');

let cached: IdentityConfig | undefined;

export function getIdentityConfig(): IdentityConfig {
  if (cached) return cached;
  const isProduction = process.env.NODE_ENV === 'production';
  const issuerOrigin = trimSlash(process.env.ID_ISSUER_ORIGIN || 'http://id.karbexa.localhost:5000');
  if (isProduction && !issuerOrigin.startsWith('https://')) {
    throw new Error('[identity] ID_ISSUER_ORIGIN must be https in production');
  }
  cached = {
    issuerOrigin,
    tenantIssuer: `${issuerOrigin}/realms/tenant`,
    servicesIssuer: `${issuerOrigin}/realms/services`,
    operatorIssuer: `${issuerOrigin}/realms/operator`,
    operatorSpaOrigin: trimSlash(process.env.OPERATOR_SPA_ORIGIN || 'http://admin.karbexa.localhost:5173'),
    adminSpaOrigin: trimSlash(process.env.ADMIN_SPA_ORIGIN || 'http://admin.karbexa.localhost:5173'),
    productsSpaOrigin: trimSlash(process.env.PRODUCTS_SPA_ORIGIN || 'http://app.karbexa.localhost:5174'),
    secureCookies: issuerOrigin.startsWith('https://'),
    isProduction,
    entra: {
      clientId: process.env.ENTRA_CLIENT_ID || undefined,
      clientSecret: process.env.ENTRA_CLIENT_SECRET || undefined,
    },
  };
  return cached;
}

/**
 * Product keys each services client may write to (role catalog etc). Default: the products backend may
 * touch every karbexa_product key except 'admin'. Override with env PLATFORM_CLIENT_PRODUCTS = {"clientId":["key",...]}.
 * Read at call time. Unknown clients get no products.
 */
export function getClientAllowedProducts(clientId: string): string[] {
  const raw = process.env.PLATFORM_CLIENT_PRODUCTS;
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(map, clientId)) {
        const v = map[clientId];
        return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
      }
    } catch { console.error('[identity] PLATFORM_CLIENT_PRODUCTS is not valid JSON; using defaults'); }
  }
  return clientId === PRODUCTS_BACKEND_CLIENT_ID ? ['people', 'projects', 'sign', 'desk'] : [];
}

/** 03 §10.2 — oidc-provider and jose are ESM-only; CommonJS loads them via require(esm). */
export function assertRequireModule(): void {
  if (!(process.features as { require_module?: boolean }).require_module) {
    throw new Error('[identity] Node must support require(esm) (process.features.require_module); use Node >= 22.12');
  }
}
