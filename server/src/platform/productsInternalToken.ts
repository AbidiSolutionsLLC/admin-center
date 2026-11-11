// server/src/platform/productsInternalToken.ts — services-realm client_credentials token for karbexa-admin-backend
// (03 §2): audience urn:karbexa:products-internal, scope products.internal.read. Used by E7 (open-items) and Z (health).
import crypto from 'crypto';
import fs from 'fs';
import * as jose from 'jose';
import {
  getIdentityConfig, ADMIN_BACKEND_CLIENT_ID, PRODUCTS_INTERNAL_AUDIENCE, PRODUCTS_INTERNAL_SCOPES,
} from '../identity/config';

const REFRESH_MARGIN_MS = 60_000;

export interface ProductsInternalTokenOptions {
  /** Injection point for tests. */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

let cached: { token: string; expiresAtMs: number } | undefined;
let inflight: Promise<string> | undefined;

export function resetProductsInternalToken(): void {
  cached = undefined;
  inflight = undefined;
}

/** ADMIN_BACKEND_CLIENT_KEY is an inline PEM (PKCS#8) or a path to one. */
function readClientKeyPem(): string {
  const raw = process.env.ADMIN_BACKEND_CLIENT_KEY?.trim();
  if (!raw) throw new Error('ADMIN_BACKEND_CLIENT_KEY is not set');
  return raw.includes('-----BEGIN') ? raw : fs.readFileSync(raw, 'utf8');
}

/** The key id is the RFC 7638 thumbprint of the public key, so the registered JWKS and the assertion agree without extra config. */
export async function adminBackendKeyId(publicJwk: jose.JWK): Promise<string> {
  return jose.calculateJwkThumbprint(publicJwk, 'sha256');
}

async function signClientAssertion(now: number): Promise<string> {
  const privateKey = crypto.createPrivateKey(readClientKeyPem());
  const publicJwk = crypto.createPublicKey(privateKey).export({ format: 'jwk' }) as jose.JWK;
  const kid = await adminBackendKeyId(publicJwk);
  const issuer = getIdentityConfig().servicesIssuer;
  const iat = Math.floor(now / 1000);
  return new jose.SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(ADMIN_BACKEND_CLIENT_ID).setSubject(ADMIN_BACKEND_CLIENT_ID).setAudience(issuer)
    .setJti(crypto.randomUUID()).setIssuedAt(iat).setExpirationTime(iat + 120)
    .sign(privateKey);
}

async function requestToken(opts: ProductsInternalTokenOptions): Promise<{ token: string; expiresAtMs: number }> {
  const now = (opts.now ?? Date.now)();
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${getIdentityConfig().servicesIssuer}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: ADMIN_BACKEND_CLIENT_ID,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: await signClientAssertion(now),
      scope: PRODUCTS_INTERNAL_SCOPES,
      resource: PRODUCTS_INTERNAL_AUDIENCE,
    }).toString(),
  });
  const body = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) {
    // Never include the assertion or any token in the message.
    throw new Error(`products-internal token request failed: ${res.status} ${body.error ?? 'no access_token'}`);
  }
  const ttlMs = (typeof body.expires_in === 'number' ? body.expires_in : 0) * 1000;
  return { token: body.access_token, expiresAtMs: now + ttlMs };
}

/** Cached until exp-60s; concurrent callers share one request. */
export async function getProductsInternalToken(opts: ProductsInternalTokenOptions = {}): Promise<string> {
  const now = (opts.now ?? Date.now)();
  if (cached && cached.expiresAtMs - REFRESH_MARGIN_MS > now) return cached.token;
  if (!inflight) {
    inflight = requestToken(opts)
      .then((t) => { cached = t; return t.token; })
      .finally(() => { inflight = undefined; });
  }
  return inflight;
}
