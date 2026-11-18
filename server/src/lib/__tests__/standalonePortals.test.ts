// server/src/lib/__tests__/standalonePortals.test.ts — pure unit tests for standalone portal registration (DRD §8.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  portalUrlProblem, standaloneManifestSchema, keyFromClientId, clientIdFor, audienceFor, authMethodOf, usesClientSecret,
  generateClientSecret, storedClient, standaloneView,
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
