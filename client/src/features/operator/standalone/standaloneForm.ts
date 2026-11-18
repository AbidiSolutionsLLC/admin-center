// Registration form of a standalone portal (DRD §8.2): state, validation and the request body. Pure, so it can be tested
// without a browser. The server validates again (`PUT /operator/v1/products/:key`); this only spares a round trip.

export interface RoleRow { key: string; name: string; rank: string; is_default: boolean }

export interface StandaloneFormState {
  name: string;
  key: string;
  icon: string;
  category: 'core' | 'work' | 'it' | 'talent';
  status: 'active' | 'beta' | 'hidden' | 'retired';
  launch_url: string;
  client_type: 'confidential' | 'public';
  token_endpoint_auth: '' | 'client_secret_basic' | 'client_secret_post' | 'private_key_jwt';
  jwks_uri: string;
  /** One URI per line. */
  redirect_uris: string;
  post_logout_redirect_uris: string;
  backchannel_logout_uri: string;
  health_url: string;
  per_tenant_launch_url: boolean;
  roles: RoleRow[];
  /** Stored version + 1 on an edit; 1 for a new portal. */
  version: number;
}

export const EMPTY_FORM: StandaloneFormState = {
  name: '', key: '', icon: 'package', category: 'it', status: 'active', launch_url: '', client_type: 'confidential', token_endpoint_auth: '',
  jwks_uri: '', redirect_uris: '', post_logout_redirect_uris: '', backchannel_logout_uri: '', health_url: '', per_tenant_launch_url: false,
  roles: [{ key: '', name: '', rank: '10', is_default: true }], version: 1,
};

export const KEY_RE = /^[a-z][a-z0-9_]{1,30}$/;
export const ROLE_KEY_RE = /^[a-z][a-z0-9_]{1,40}$/;

export const lines = (text: string): string[] => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** https, no wildcard, credentials or fragment; http only on a loopback host (local portals). */
export function urlProblem(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return 'is not a valid absolute URL'; }
  if (raw.includes('*')) return 'must not contain a wildcard';
  if (u.username || u.password) return 'must not contain credentials';
  if (u.hash || raw.includes('#')) return 'must not contain a fragment';
  if (u.protocol === 'https:') return null;
  if (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return null;
  return 'must use https';
}

export type FormErrors = Partial<Record<keyof StandaloneFormState | 'roles', string>>;

/** Field errors by name; empty object = valid. Messages are shown under the field. */
export function validateForm(f: StandaloneFormState, { editing }: { editing: boolean }): FormErrors {
  const e: FormErrors = {};
  if (!f.name.trim()) e.name = 'Enter the portal name.';
  if (!editing && !KEY_RE.test(f.key)) e.key = 'Use 2 to 31 lowercase letters, digits or underscores, starting with a letter.';
  if (!editing && f.key === 'admin') e.key = "'admin' is reserved.";
  if (!f.icon.trim()) e.icon = 'Enter an icon name.';
  const launch = f.launch_url.trim();
  if (!launch) e.launch_url = 'Enter the launch URL.';
  else if (urlProblem(launch)) e.launch_url = `Launch URL ${urlProblem(launch)}.`;

  const redirects = lines(f.redirect_uris);
  const bad = (list: string[]) => list.map((u) => ({ u, p: urlProblem(u) })).find((x) => x.p);
  if (!redirects.length) e.redirect_uris = 'Enter at least one redirect URI.';
  else { const b = bad(redirects); if (b) e.redirect_uris = `${b.u} ${b.p}.`; }
  const logouts = lines(f.post_logout_redirect_uris);
  { const b = bad(logouts); if (b) e.post_logout_redirect_uris = `${b.u} ${b.p}.`; }
  if (f.backchannel_logout_uri.trim() && urlProblem(f.backchannel_logout_uri.trim())) e.backchannel_logout_uri = `Back-channel URI ${urlProblem(f.backchannel_logout_uri.trim())}.`;
  if (f.health_url.trim() && urlProblem(f.health_url.trim())) e.health_url = `Health URL ${urlProblem(f.health_url.trim())}.`;

  if (f.client_type === 'confidential' && f.token_endpoint_auth === 'private_key_jwt') {
    if (!f.jwks_uri.trim()) e.jwks_uri = 'private_key_jwt needs a JWKS URI.';
    else if (urlProblem(f.jwks_uri.trim())) e.jwks_uri = `JWKS URI ${urlProblem(f.jwks_uri.trim())}.`;
  }

  const keys = f.roles.map((r) => r.key.trim());
  if (!f.roles.length) e.roles = 'Add at least one role.';
  else if (f.roles.some((r) => !ROLE_KEY_RE.test(r.key.trim()))) e.roles = "Role keys use lowercase letters, digits and underscores (the portal's own role identifiers).";
  else if (new Set(keys).size !== keys.length) e.roles = 'Role keys must be unique.';
  else if (f.roles.some((r) => !r.name.trim())) e.roles = 'Every role needs a name.';
  else if (f.roles.some((r) => !Number.isInteger(Number(r.rank)) || Number(r.rank) < 1)) e.roles = 'Rank is a whole number from 1 up (higher = more access).';
  else if (f.roles.filter((r) => r.is_default).length !== 1) e.roles = 'Choose exactly one default role.';
  return e;
}

/** `PUT /operator/v1/products/:key` body (manifest v1 with standalone hosting). */
export function buildManifest(f: StandaloneFormState) {
  const confidential = f.client_type === 'confidential';
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  return {
    manifest_version: 1,
    key: f.key.trim(),
    name: f.name.trim(),
    description: '',
    icon: f.icon.trim(),
    category: f.category,
    status: f.status,
    version: f.version,
    hosting: {
      mode: 'standalone' as const,
      launch_url: f.launch_url.trim(),
      client: {
        type: f.client_type,
        redirect_uris: lines(f.redirect_uris),
        post_logout_redirect_uris: lines(f.post_logout_redirect_uris),
        ...(opt(f.backchannel_logout_uri) ? { backchannel_logout_uri: opt(f.backchannel_logout_uri) } : {}),
        ...(confidential && f.token_endpoint_auth ? { token_endpoint_auth: f.token_endpoint_auth } : {}),
        ...(confidential && f.token_endpoint_auth === 'private_key_jwt' && opt(f.jwks_uri) ? { jwks_uri: opt(f.jwks_uri) } : {}),
      },
      ...(opt(f.health_url) ? { health_url: opt(f.health_url) } : {}),
      per_tenant_launch_url: f.per_tenant_launch_url,
    },
    roles: f.roles.map((r) => ({ key: r.key.trim(), name: r.name.trim(), rank: Number(r.rank), is_default: r.is_default })),
  };
}

/** The registration the server returns (no secrets), shaped for the form. */
export interface StandalonePortal {
  product_key: string; name: string; icon: string; category: string; status: string; version: number; client_id: string; audience: string;
  hosting: {
    mode: 'standalone'; launch_url: string; health_url: string | null; per_tenant_launch_url: boolean;
    client: {
      type: 'confidential' | 'public'; token_endpoint_auth: string; redirect_uris: string[]; post_logout_redirect_uris: string[];
      backchannel_logout_uri: string | null; jwks_uri: string | null; has_secret: boolean; secret_set_at: string | null; previous_secret_expires_at: string | null;
    };
  };
  roles: { key: string; name: string; rank: number; is_default: boolean }[];
}

export function formFromPortal(p: StandalonePortal): StandaloneFormState {
  const c = p.hosting.client;
  return {
    name: p.name, key: p.product_key, icon: p.icon || 'package', category: (p.category || 'it') as StandaloneFormState['category'],
    status: (p.status || 'active') as StandaloneFormState['status'], launch_url: p.hosting.launch_url,
    client_type: c.type, token_endpoint_auth: c.type === 'confidential' && c.token_endpoint_auth !== 'none' ? (c.token_endpoint_auth as StandaloneFormState['token_endpoint_auth']) : '',
    jwks_uri: c.jwks_uri ?? '', redirect_uris: c.redirect_uris.join('\n'), post_logout_redirect_uris: c.post_logout_redirect_uris.join('\n'),
    backchannel_logout_uri: c.backchannel_logout_uri ?? '', health_url: p.hosting.health_url ?? '', per_tenant_launch_url: p.hosting.per_tenant_launch_url,
    roles: p.roles.map((r) => ({ key: r.key, name: r.name, rank: String(r.rank), is_default: r.is_default })), version: p.version + 1,
  };
}
