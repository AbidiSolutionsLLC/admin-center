// OIDC Authorization Code + PKCE (S256) against the embedded identity provider.
// Tokens are never persisted here; only the transient PKCE/state/returnTo values live in sessionStorage
// and are removed as soon as the callback is processed.

export const OIDC_ISSUER: string = (import.meta.env.VITE_OIDC_ISSUER as string | undefined)
  || 'http://id.karbexa.localhost:5000/realms/tenant';
export const OIDC_CLIENT_ID: string = (import.meta.env.VITE_OIDC_CLIENT_ID as string | undefined)
  || 'karbexa-admin-spa';
const OIDC_RESOURCE = 'urn:karbexa:admin';
const OIDC_SCOPE = 'openid profile email';
const redirectUri = () => `${window.location.origin}/auth/callback`;

const KEY_VERIFIER = 'oidc.pkce.verifier';
const KEY_STATE = 'oidc.state';
const KEY_NONCE = 'oidc.nonce';
const KEY_RETURN_TO = 'oidc.return_to';
const TRANSIENT_KEYS = [KEY_VERIFIER, KEY_STATE, KEY_NONCE, KEY_RETURN_TO];

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}

const base64Url = (bytes: Uint8Array): string => {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const randomString = (byteLength = 32): string =>
  base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));

const challengeFor = async (verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
};

export const clearTransient = () => {
  TRANSIENT_KEYS.forEach((k) => sessionStorage.removeItem(k));
};

export const consumeReturnTo = (): string | null => {
  const v = sessionStorage.getItem(KEY_RETURN_TO);
  sessionStorage.removeItem(KEY_RETURN_TO);
  return v;
};

export async function startLogin(returnTo?: string, opts: { prompt?: string } = {}): Promise<void> {
  const verifier = randomString(48);
  const state = randomString(16);
  const nonce = randomString(16);
  sessionStorage.setItem(KEY_VERIFIER, verifier);
  sessionStorage.setItem(KEY_STATE, state);
  sessionStorage.setItem(KEY_NONCE, nonce);
  if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    sessionStorage.setItem(KEY_RETURN_TO, returnTo);
  } else {
    sessionStorage.removeItem(KEY_RETURN_TO);
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OIDC_CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: OIDC_SCOPE,
    resource: OIDC_RESOURCE,
    state,
    nonce,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
  });
  if (opts.prompt) params.set('prompt', opts.prompt);
  window.location.assign(`${OIDC_ISSUER}/oauth/authorize?${params.toString()}`);
}

const postToken = async (body: URLSearchParams): Promise<TokenSet> => {
  const res = await fetch(`${OIDC_ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error_description || json.error || `Token request failed (${res.status})`);
  }
  return json as TokenSet;
};

export async function completeLogin(url: string): Promise<TokenSet> {
  const params = new URL(url).searchParams;
  const expectedState = sessionStorage.getItem(KEY_STATE);
  const verifier = sessionStorage.getItem(KEY_VERIFIER);
  // Verifier/state are single-use; drop them (keep return_to for the caller).
  sessionStorage.removeItem(KEY_VERIFIER);
  sessionStorage.removeItem(KEY_STATE);
  sessionStorage.removeItem(KEY_NONCE);

  const error = params.get('error');
  if (error) throw new Error(params.get('error_description') || error);
  const code = params.get('code');
  if (!code) throw new Error('Missing authorization code');
  if (!expectedState || params.get('state') !== expectedState) throw new Error('Invalid state');
  if (!verifier) throw new Error('Missing PKCE verifier');

  return postToken(new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: OIDC_CLIENT_ID,
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
    resource: OIDC_RESOURCE,
  }));
}

// Refresh tokens rotate and reuse revokes the whole session, so concurrent callers must share one request.
let inflightRefresh: Promise<TokenSet> | null = null;

export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  if (!inflightRefresh) {
    inflightRefresh = postToken(new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: OIDC_CLIENT_ID,
      refresh_token: refreshToken,
      resource: OIDC_RESOURCE,
    })).finally(() => { inflightRefresh = null; });
  }
  return inflightRefresh;
}

export function logoutRedirect(endSessionUrl: string): void {
  window.location.assign(endSessionUrl);
}
