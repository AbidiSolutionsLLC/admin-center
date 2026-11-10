// Operator realm OIDC (Authorization Code + PKCE) and session helpers.
// Fully separate from the tenant session: own store, own storage keys, own API client.
import { create } from 'zustand';

const ISSUER_ORIGIN: string = (import.meta.env.VITE_ID_ISSUER_ORIGIN as string | undefined)
  || 'http://id.karbexa.localhost:5000';
export const OPERATOR_AUTHORITY = `${ISSUER_ORIGIN}/realms/operator`;
export const OPERATOR_CLIENT_ID = 'karbexa-operator-spa';
const OPERATOR_RESOURCE = 'urn:karbexa:operator';
const redirectUri = () => `${window.location.origin}/operator/callback`;

// ---- store (memory only) ----
interface OperatorAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  expiresAt: number | null;
  setTokens: (p: { accessToken: string; refreshToken?: string | null; idToken?: string | null; expiresAt: number }) => void;
  clear: () => void;
}

export const useOperatorAuthStore = create<OperatorAuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  idToken: null,
  expiresAt: null,
  setTokens: (p) => set((s) => ({
    accessToken: p.accessToken,
    refreshToken: p.refreshToken ?? s.refreshToken,
    idToken: p.idToken ?? s.idToken,
    expiresAt: p.expiresAt,
  })),
  clear: () => set({ accessToken: null, refreshToken: null, idToken: null, expiresAt: null }),
}));

// ---- PKCE ----
const K_VERIFIER = 'op.oidc.verifier';
const K_STATE = 'op.oidc.state';
const K_RETURN = 'op.oidc.return_to';

interface TokenSet { access_token: string; refresh_token?: string; id_token?: string; expires_in: number }

const b64url = (bytes: Uint8Array): string => {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const rand = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export async function startOperatorLogin(returnTo?: string): Promise<void> {
  const verifier = rand(48);
  const state = rand(16);
  sessionStorage.setItem(K_VERIFIER, verifier);
  sessionStorage.setItem(K_STATE, state);
  if (returnTo && returnTo.startsWith('/operator') && !returnTo.startsWith('//')) sessionStorage.setItem(K_RETURN, returnTo);
  else sessionStorage.removeItem(K_RETURN);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OPERATOR_CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: 'openid profile email',
    resource: OPERATOR_RESOURCE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  window.location.assign(`${OPERATOR_AUTHORITY}/oauth/authorize?${params.toString()}`);
}

const postToken = async (body: URLSearchParams): Promise<TokenSet> => {
  const res = await fetch(`${OPERATOR_AUTHORITY}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || `Token request failed (${res.status})`);
  return json as TokenSet;
};

const store = (t: TokenSet) => useOperatorAuthStore.getState().setTokens({
  accessToken: t.access_token,
  refreshToken: t.refresh_token,
  idToken: t.id_token,
  expiresAt: Date.now() + t.expires_in * 1000,
});

export async function completeOperatorLogin(url: string): Promise<string | null> {
  const params = new URL(url).searchParams;
  const expectedState = sessionStorage.getItem(K_STATE);
  const verifier = sessionStorage.getItem(K_VERIFIER);
  const returnTo = sessionStorage.getItem(K_RETURN);
  [K_STATE, K_VERIFIER, K_RETURN].forEach((k) => sessionStorage.removeItem(k));
  const error = params.get('error');
  if (error) throw new Error(params.get('error_description') || error);
  const code = params.get('code');
  if (!code) throw new Error('Missing authorization code');
  if (!expectedState || params.get('state') !== expectedState) throw new Error('Invalid state');
  if (!verifier) throw new Error('Missing PKCE verifier');
  store(await postToken(new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: OPERATOR_CLIENT_ID,
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
    resource: OPERATOR_RESOURCE,
  })));
  return returnTo;
}

let inflight: Promise<string> | null = null;
export function refreshOperatorSession(): Promise<string> {
  const rt = useOperatorAuthStore.getState().refreshToken;
  if (!rt) return Promise.reject(new Error('No refresh token'));
  if (!inflight) {
    inflight = postToken(new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: OPERATOR_CLIENT_ID,
      refresh_token: rt,
      resource: OPERATOR_RESOURCE,
    })).then((t) => { store(t); return t.access_token; }).finally(() => { inflight = null; });
  }
  return inflight;
}

export function operatorLogout(): void {
  const idToken = useOperatorAuthStore.getState().idToken;
  useOperatorAuthStore.getState().clear();
  const params = new URLSearchParams({
    client_id: OPERATOR_CLIENT_ID,
    post_logout_redirect_uri: `${window.location.origin}/operator`,
  });
  if (idToken) params.set('id_token_hint', idToken);
  window.location.assign(`${OPERATOR_AUTHORITY}/oauth/end_session?${params.toString()}`);
}
