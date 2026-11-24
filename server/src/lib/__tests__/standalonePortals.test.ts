// server/src/lib/__tests__/standalonePortals.test.ts — pure unit tests for standalone portal registration (DRD §8.2).
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  portalUrlProblem, standaloneManifestSchema, keyFromClientId, clientIdFor, audienceFor, authMethodOf, usesClientSecret,
  generateClientSecret, storedClient, standaloneView, buildClientMetadata, withTenantOrigins, originsOf, formOriginsOf, resourceForStandaloneClient, secretsEqual, decideGate, buildStandaloneClaims, launcherItem,
} from '../standalonePortals';

const base = () => ({
  manifest_version: 1, key: 'assets', name: 'Assets', description: 'Asset management', icon: 'package', category: 'it', status: 'active', version: 1,
  hosting: {
    mode: 'standalone',
    launch_url: 'https://assets.example.com/',
    client: { type: 'confidential', redirect_uris: ['https://assets.example.com/callback'], post_logout_redirect_uris: ['https://assets.example.com/'] },
    per_tenant_launch_url: false,
  },
  roles: [
    { key: 'asset_admin', name: 'Asset admin', rank: 40 },
    { key: 'asset_viewer', name: 'Asset viewer', rank: 10, is_default: true },
  ],
});

test('portalUrlProblem: https only, no wildcard, credentials or fragment; loopback http outside production', () => {
  assert.equal(portalUrlProblem('https://a.example.com/cb', true), null);
  assert.ok(portalUrlProblem('http://a.example.com/cb', true));
  assert.ok(portalUrlProblem('http://localhost:3000/cb', true));
  assert.equal(portalUrlProblem('http://localhost:3000/cb', false), null);
  assert.ok(portalUrlProblem('http://a.example.com/cb', false));
  assert.ok(portalUrlProblem('https://*.example.com/cb', true));
  assert.ok(portalUrlProblem('https://u:p@a.example.com/', true));
  assert.ok(portalUrlProblem('https://a.example.com/#x', true));
  assert.ok(portalUrlProblem('not a url', true));
});

test('standaloneManifestSchema accepts a valid registration and applies defaults', () => {
  const r = standaloneManifestSchema.safeParse(base());
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.hosting.per_tenant_launch_url, false);
});

test('standaloneManifestSchema rejects: suite mode, reserved key, no default role, public client with auth, private_key_jwt without jwks', () => {
  const bad = (mut: (b: any) => void) => { const b: any = base(); mut(b); return standaloneManifestSchema.safeParse(b).success; };
  assert.equal(bad((b) => { b.hosting.mode = 'suite'; }), false);
  assert.equal(bad((b) => { b.key = 'admin'; }), false);
  assert.equal(bad((b) => { b.roles[1].is_default = false; }), false);
  assert.equal(bad((b) => { b.roles.push({ key: 'asset_admin', name: 'dup', rank: 5 }); }), false);
  assert.equal(bad((b) => { b.hosting.client.type = 'public'; b.hosting.client.token_endpoint_auth = 'client_secret_basic'; }), false);
  assert.equal(bad((b) => { b.hosting.client.token_endpoint_auth = 'private_key_jwt'; }), false);
  assert.equal(bad((b) => { b.hosting.client.redirect_uris = []; }), false);
  assert.equal(bad((b) => { b.hosting.client.redirect_uris = ['https://*.example.com/cb']; }), false);
  assert.equal(bad((b) => { b.default_assignments = [{ target: 'all_members', role: 'nope' }]; }), false);
});

test('client id, audience and key parsing', () => {
  assert.equal(clientIdFor('assets'), 'karbexa-assets');
  assert.equal(audienceFor('assets'), 'urn:karbexa:assets');
  assert.equal(keyFromClientId('karbexa-assets'), 'assets');
  assert.equal(keyFromClientId('karbexa-admin'), null);
  assert.equal(keyFromClientId('admin-center'), null);
  assert.equal(keyFromClientId(42), null);
});

test('token endpoint authentication: public none, confidential default basic; secrets only for shared-secret methods', () => {
  assert.equal(authMethodOf({ type: 'public' }), 'none');
  assert.equal(authMethodOf({ type: 'confidential' }), 'client_secret_basic');
  assert.equal(authMethodOf({ type: 'confidential', token_endpoint_auth: 'private_key_jwt' }), 'private_key_jwt');
  assert.equal(usesClientSecret({ type: 'confidential' }), true);
  assert.equal(usesClientSecret({ type: 'confidential', token_endpoint_auth: 'private_key_jwt' }), false);
  assert.equal(usesClientSecret({ type: 'public' }), false);
});

test('generateClientSecret: 32 random bytes, base64url, never repeats', () => {
  const a = generateClientSecret();
  assert.equal(Buffer.from(a, 'base64url').length, 32);
  assert.notEqual(a, generateClientSecret());
});

test('storedClient de-duplicates URIs; standaloneView never exposes a secret', () => {
  const m = standaloneManifestSchema.parse({ ...base(), hosting: { ...base().hosting, client: { type: 'confidential', redirect_uris: ['https://a.example.com/cb', 'https://a.example.com/cb'] } } });
  assert.deepEqual(storedClient(m.hosting.client).redirect_uris, ['https://a.example.com/cb']);
  const view = standaloneView({
    product_key: 'assets', name: 'Assets', hosting: { launch_url: 'https://a.example.com/', client: { type: 'confidential', secret_enc: 'ENC', secret_set_at: new Date(), previous_secret_enc: 'OLD' } },
  }, []);
  const json = JSON.stringify(view);
  assert.ok(!json.includes('ENC') && !json.includes('OLD'));
  assert.equal(view.hosting.client.has_secret, true);
});

// ── C-2: registry-driven OIDC client ──
import { encrypt } from '../cryptoService';

const appRow = (over: Record<string, unknown> = {}, client: Record<string, unknown> = {}) => ({
  product_key: 'assets', name: 'Assets',
  hosting: {
    launch_url: 'https://assets.example.com/', per_tenant_launch_url: false,
    client: { type: 'confidential', token_endpoint_auth: 'client_secret_basic', redirect_uris: ['https://assets.example.com/callback'], post_logout_redirect_uris: ['https://assets.example.com/'], secret_enc: encrypt('s3cret'), ...client },
  },
  ...over,
});

test('buildClientMetadata: client id, audience-bound scopes, secret decrypted, code + refresh only', () => {
  const md: any = buildClientMetadata(appRow());
  assert.equal(md.client_id, 'karbexa-assets');
  assert.equal(md.token_endpoint_auth_method, 'client_secret_basic');
  assert.equal(md.client_secret, 's3cret');
  assert.deepEqual(md.grant_types, ['authorization_code', 'refresh_token']);
  assert.deepEqual(md.response_types, ['code']);
  assert.equal(md.scope, 'openid profile email offline_access');
  assert.deepEqual(md.redirect_uris, ['https://assets.example.com/callback']);
  assert.equal(md.karbexa_previous_secret, undefined);
});

test('buildClientMetadata: public client has no secret; rotated secret is carried until it expires', () => {
  const pub: any = buildClientMetadata(appRow({}, { type: 'public', token_endpoint_auth: undefined, secret_enc: undefined }));
  assert.equal(pub.token_endpoint_auth_method, 'none');
  assert.equal(pub.client_secret, undefined);
  const live: any = buildClientMetadata(appRow({}, { previous_secret_enc: encrypt('old'), previous_secret_expires_at: new Date(Date.now() + 3_600_000) }));
  assert.equal(live.karbexa_previous_secret, 'old');
  assert.ok(live.karbexa_previous_secret_expires_at > Date.now() / 1000);
  const dead: any = buildClientMetadata(appRow({}, { previous_secret_enc: encrypt('old'), previous_secret_expires_at: new Date(Date.now() - 1000) }));
  assert.equal(dead.karbexa_previous_secret, undefined);
});

test('per-tenant portals accept the registered paths on each tenant origin, and only then', () => {
  const uris = ['https://assets.example.com/callback'];
  assert.deepEqual(withTenantOrigins(uris, ['https://acme.assets.example.com']).sort(), ['https://acme.assets.example.com/callback', 'https://assets.example.com/callback']);
  assert.deepEqual(originsOf(['https://acme.example.com/app/', 'https://acme.example.com/x', 'bad']), ['https://acme.example.com']);
  const fixed: any = buildClientMetadata(appRow(), ['https://acme.assets.example.com']);
  assert.deepEqual(fixed.redirect_uris, uris);
  const perTenant: any = buildClientMetadata(appRow({ hosting: { ...appRow().hosting, per_tenant_launch_url: true } }), ['https://acme.assets.example.com']);
  assert.ok(perTenant.redirect_uris.includes('https://acme.assets.example.com/callback'));
});

test('resourceForStandaloneClient and secretsEqual', () => {
  assert.equal(resourceForStandaloneClient('karbexa-assets'), 'urn:karbexa:assets');
  assert.equal(resourceForStandaloneClient('karbexa-admin-spa'), undefined);
  assert.equal(secretsEqual('a', 'a'), true);
  assert.equal(secretsEqual('a', 'b'), false);
});

// ── C-3: access gate decision (DRD §8.4) ──
const role = { key: 'asset_admin', name: 'Asset admin' };
const facts = (over: Record<string, unknown> = {}) => ({ registered: true, productStatus: 'active', entitlement: 'active', role, ...over });

test('decideGate: entitled and assigned -> allowed with the role', () => {
  assert.deepEqual(decideGate(facts()), { allowed: true, role: 'asset_admin', role_name: 'Asset admin' });
  assert.equal(decideGate(facts({ productStatus: 'beta' })).allowed, true);
});

test('decideGate: tenant not entitled, entitlement not active, or product retired -> "not available for your organisation"', () => {
  const page = (o: any) => (o.allowed ? 'allowed' : o.page);
  assert.equal(page(decideGate(facts({ entitlement: null }))), 'unavailable');
  assert.equal(page(decideGate(facts({ entitlement: 'suspended' }))), 'unavailable');
  assert.equal(page(decideGate(facts({ entitlement: 'restricted' }))), 'unavailable');
  assert.equal(page(decideGate(facts({ productStatus: 'retired' }))), 'unavailable');
  assert.equal(page(decideGate(facts({ registered: false }))), 'unavailable');
  assert.equal(page(decideGate(facts({ role: undefined, denial: 'ORG_SUSPENDED' }))), 'unavailable');
});

test('decideGate: no role or member outside the access states -> "You do not have access"', () => {
  const o: any = decideGate(facts({ role: undefined, denial: 'NO_ASSIGNMENT' }));
  assert.equal(o.allowed, false); assert.equal(o.page, 'no_access'); assert.equal(o.reason, 'NO_ASSIGNMENT');
  assert.equal((decideGate(facts({ role: undefined, denial: 'MEMBER_NOT_ACTIVE' })) as any).page, 'no_access');
  assert.equal((decideGate(facts({ role: undefined })) as any).reason, 'NO_ASSIGNMENT');
});

test('decideGate: the organisation check outranks the member check; a foreign tenant redirect is refused', () => {
  assert.equal((decideGate(facts({ entitlement: 'suspended', role: undefined, denial: 'NO_ASSIGNMENT' })) as any).page, 'unavailable');
  const o: any = decideGate(facts({ redirectAllowed: false }));
  assert.equal(o.allowed, false); assert.equal(o.reason, 'REDIRECT_NOT_ALLOWED');
  assert.equal(decideGate(facts({ redirectAllowed: true })).allowed, true);
});

// ── C-4: claims (DRD §8.5) ──
test('buildStandaloneClaims: exactly the DRD claim set, one product role, no Admin roles or identity id', () => {
  const c = buildStandaloneClaims({
    memberId: 'm1', authzVer: 7, email: 'a@acme.test', emailVerified: true, name: 'Ada', avatarUrl: 'https://cdn.example.com/a.png',
    orgId: 'o1', orgSlug: 'acme', orgName: 'Acme', role: 'asset_admin', sid: 's1',
  });
  assert.deepEqual(Object.keys(c).sort(), ['authz_ver', 'email', 'email_verified', 'member_type', 'name', 'org', 'org_name', 'org_slug', 'picture', 'product_role', 'sid', 'sub'].sort());
  assert.equal(c.product_role, 'asset_admin'); assert.equal(c.member_type, 'workforce'); assert.equal(c.authz_ver, 7);
});

test('buildStandaloneClaims: picture only when absolute; member_type external is kept; authz_ver defaults to 1', () => {
  const c = buildStandaloneClaims({ memberId: 'm1', email: 'a@b.c', emailVerified: false, name: 'A', avatarUrl: '/uploads/a.png', memberType: 'external', orgId: 'o', orgSlug: 's', orgName: 'N', role: 'r' });
  assert.equal('picture' in c, false); assert.equal('sid' in c, false);
  assert.equal(c.member_type, 'external'); assert.equal(c.authz_ver, 1); assert.equal(c.email_verified, false);
});

test('launcherItem: key, name, launch_url and roles by rank (highest first), nothing else', () => {
  const item = launcherItem({ product_key: 'assets', name: 'Assets', hosting: { client: { secret_enc: 'x' } } } as never,
    [{ key: 'viewer', name: 'Viewer', rank: 10, description: 'd' } as never, { key: 'admin', name: 'Admin', rank: 40 }], 'https://assets.example.com/');
  assert.deepEqual(item, { product_key: 'assets', name: 'Assets', launch_url: 'https://assets.example.com/', roles: [{ key: 'admin', name: 'Admin' }, { key: 'viewer', name: 'Viewer' }] });
});

test('standaloneView hosting block (used by GET /platform/v1/apps) never carries a secret', () => {
  const view = standaloneView({ product_key: 'assets', name: 'Assets', hosting: { launch_url: 'https://a.example.com/', client: { type: 'confidential', secret_enc: 'ENC', secret_set_at: new Date(), previous_secret_enc: 'OLD' } } }, []);
  assert.equal(view.hosting.mode, 'standalone');
  assert.equal(view.hosting.client.has_secret, true);
  assert.ok(!/ENC|OLD|secret_enc/.test(JSON.stringify(view.hosting)));
});

test('formOriginsOf: redirect, post-logout and launch origins of every portal plus tenant launch URLs, once each', () => {
  const apps: any[] = [
    { hosting: { launch_url: 'http://localhost:3000/api/auth/karbexa/login', client: { redirect_uris: ['http://localhost:3000/api/auth/karbexa/callback'], post_logout_redirect_uris: ['http://localhost:5175/login'] } } },
    { hosting: { launch_url: 'https://assets.example.com/', client: { redirect_uris: ['https://assets.example.com/cb'], post_logout_redirect_uris: [] } } },
    { hosting: undefined },
  ];
  assert.deepEqual(formOriginsOf(apps, ['https://acme.assets.example.com/']).sort(),
    ['http://localhost:3000', 'http://localhost:5175', 'https://acme.assets.example.com', 'https://assets.example.com']);
  assert.deepEqual(formOriginsOf([]), []);
});

test('pageCsp: form-action names the registered portals so the browser follows the redirect after the sign-in and sign-out forms', async () => {
  const { pageCsp, setStandaloneFormOrigins } = await import('../../identity/html');
  setStandaloneFormOrigins([]);
  assert.ok(!pageCsp('n').includes('localhost:3000'));
  setStandaloneFormOrigins(['http://localhost:3000', 'https://assets.example.com']);
  const formAction = pageCsp('n').split(';').map((d) => d.trim()).find((d) => d.startsWith('form-action'))!;
  assert.match(formAction, /^form-action 'self'/);
  assert.ok(formAction.includes('http://localhost:3000') && formAction.includes('https://assets.example.com'));
  setStandaloneFormOrigins([]);
});
