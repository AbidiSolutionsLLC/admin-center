// server/src/identity/keys.ts
// Per-realm RS256 signing keys (03 §2, §5.5, §10.10) and oidc-provider cookie keys.
// Production: IDENTITY_TENANT_KEY / IDENTITY_SERVICES_KEY (PKCS#8 PEM, a private JWK, or a JWKS
// {"keys":[current, previous]}) and OIDC_COOKIE_KEYS. Development: generated once into server/.local/.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as jose from 'jose';
import { Realm, getIdentityConfig } from './config';

// src/identity -> server/.local (also correct for dist/identity)
export const LOCAL_DIR = path.resolve(__dirname, '..', '..', '.local');

const KEY_ENV: Record<Realm, string> = { tenant: 'IDENTITY_TENANT_KEY', services: 'IDENTITY_SERVICES_KEY' };
const PRIVATE_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi'] as const;

interface RealmKeys { privateJwks: { keys: jose.JWK[] }; publicJwks: { keys: jose.JWK[] } }
const store = new Map<Realm, RealmKeys>();

async function normaliseKey(realm: Realm, jwk: jose.JWK): Promise<jose.JWK> {
  if (jwk.kty !== 'RSA' || !jwk.d) throw new Error(`[identity] ${realm} signing key must be a private RSA key`);
  let kid = jwk.kid || (await jose.calculateJwkThumbprint(jwk)).slice(0, 16);
  if (!kid.startsWith(`${realm}-`)) kid = `${realm}-${kid}`;
  return { ...jwk, kid, alg: 'RS256', use: 'sig' };
}

async function parseKeyMaterial(realm: Realm, raw: string): Promise<jose.JWK[]> {
  const text = raw.trim();
  if (text.startsWith('{')) {
    const parsed = JSON.parse(text) as jose.JWK | { keys: jose.JWK[] };
    const list = 'keys' in parsed && Array.isArray(parsed.keys) ? parsed.keys : [parsed as jose.JWK];
    return Promise.all(list.map((k) => normaliseKey(realm, k)));
  }
  const pem = text.includes('\\n') ? text.replace(/\\n/g, '\n') : text;
  const key = await jose.importPKCS8(pem, 'RS256', { extractable: true });
  return [await normaliseKey(realm, await jose.exportJWK(key))];
}

async function devKeys(realm: Realm): Promise<jose.JWK[]> {
  const file = path.join(LOCAL_DIR, 'keys', `${realm}.json`);
  if (fs.existsSync(file)) {
    return parseKeyMaterial(realm, fs.readFileSync(file, 'utf8'));
  }
  const { privateKey } = await jose.generateKeyPair('RS256', { extractable: true, modulusLength: 2048 });
  const jwk = await jose.exportJWK(privateKey);
  const month = new Date().toISOString().slice(0, 7);
  const key = await normaliseKey(realm, { ...jwk, kid: `${realm}-${month}-${crypto.randomBytes(3).toString('hex')}` });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ keys: [key] }, null, 2), { mode: 0o600 });
  console.log(`[identity] generated dev signing key for realm "${realm}" at ${file}`);
  return [key];
}

export async function loadRealmKeys(realm: Realm): Promise<RealmKeys> {
  const existing = store.get(realm);
  if (existing) return existing;
  const raw = process.env[KEY_ENV[realm]];
  let keys: jose.JWK[];
  if (raw) {
    keys = await parseKeyMaterial(realm, raw);
  } else if (getIdentityConfig().isProduction) {
    throw new Error(`[identity] ${KEY_ENV[realm]} is required in production`);
  } else {
    keys = await devKeys(realm);
  }
  const publicKeys = keys.map((k) => {
    const pub: Record<string, unknown> = { ...k };
    for (const f of PRIVATE_FIELDS) delete pub[f];
    return pub as jose.JWK;
  });
  const result = { privateJwks: { keys }, publicJwks: { keys: publicKeys } };
  store.set(realm, result);
  return result;
}

export function getPublicJwks(realm: Realm): { keys: jose.JWK[] } {
  const keys = store.get(realm);
  if (!keys) throw new Error(`[identity] keys for realm "${realm}" not loaded`);
  return keys.publicJwks;
}

/** OIDC_COOKIE_KEYS (comma list, newest first); dev fallback persisted in server/.local/cookie-keys.json. */
export function loadCookieKeys(): string[] {
  const fromEnv = (process.env.OIDC_COOKIE_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean);
  if (fromEnv.length) return fromEnv;
  if (getIdentityConfig().isProduction) throw new Error('[identity] OIDC_COOKIE_KEYS is required in production');
  const file = path.join(LOCAL_DIR, 'cookie-keys.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as string[];
  const keys = [crypto.randomBytes(32).toString('base64url')];
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
  return keys;
}
