// Karbexa side of the Zyntrus sign-in test, on the running local stack (node scripts/dev.mjs):
//  1. sign in to the Command Center as the test operator in a real browser,
//  2. register Zyntrus as a standalone portal (PUT /operator/v1/products/zyntrus, secret shown once),
//  3. create the test agency (organisation) with a first admin and give it the Zyntrus entitlement.
// Result: D:/karbexa-test-tmp/sso/setup.json (client secret, org id, admin invite token). Idempotent: run again to rotate the secret.
//   cd karbexa-admin/client && node e2e-real/zyntrus-setup.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { operatorCredentials, hostedSignIn } from './lib-signin.mjs';

const ADMIN = (process.env.DEMO_ADMIN_URL || 'http://admin.karbexa.localhost:5173').replace(/\/$/, '');
const API = (process.env.DEMO_ADMIN_API || 'http://admin.karbexa.localhost:5000').replace(/\/$/, '');
const OUT = process.env.SSO_TEST_OUT || 'D:/karbexa-test-tmp/sso';
const ZYNTRUS_API = process.env.ZYNTRUS_API || 'http://localhost:3000';
const ZYNTRUS_WEB = process.env.ZYNTRUS_WEB || 'http://localhost:5175';
fs.mkdirSync(OUT, { recursive: true });

const who = operatorCredentials();
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
let bearer = '';
page.on('request', (r) => { const a = r.headers()['authorization']; if (a && r.url().includes('/operator/v1/')) bearer = a; });
await hostedSignIn(page, `${ADMIN}/operator`, who, `operator:${who.email}`, new URL(ADMIN).origin);
await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
if (!bearer) throw new Error('no operator bearer token was seen');

const call = async (method, url, body) => {
  const res = await fetch(`${API}/operator/v1${url}`, { method, headers: { authorization: bearer, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${json.code || ''} ${json.error || ''}`);
  return json.data ?? json;
};

const manifest = {
  manifest_version: 1, key: 'zyntrus', name: 'Zyntrus', description: 'Hiring platform for recruitment agencies', icon: 'briefcase',
  category: 'talent', status: 'active', version: 1,
  hosting: {
    mode: 'standalone', launch_url: `${ZYNTRUS_API}/api/auth/karbexa/login`, per_tenant_launch_url: false, health_url: `${ZYNTRUS_API}/health/live`,
    client: {
      type: 'confidential', token_endpoint_auth: 'client_secret_basic',
      redirect_uris: [`${ZYNTRUS_API}/api/auth/karbexa/callback`], post_logout_redirect_uris: [`${ZYNTRUS_WEB}/login`],
      backchannel_logout_uri: `${ZYNTRUS_API}/api/auth/karbexa/backchannel-logout`,
    },
  },
  roles: [
    { key: 'zyntrus_admin', name: 'Account Manager', description: 'Reviews jobs, assigns recruiters, manages accounts', rank: 40 },
    { key: 'recruiter', name: 'Recruiter', description: 'Works the jobs assigned to them', rank: 30, is_default: true },
  ],
};

const out = {};
const known = await call('GET', '/products/standalone').catch(() => []);
const existing = (Array.isArray(known) ? known : []).find((p) => (p.product_key || p.key) === 'zyntrus');
if (existing) {
  const stored = Number(existing.role_catalog_version ?? existing.version ?? 1);
  const r = await call('PUT', '/products/zyntrus', { ...manifest, version: Math.max(1, stored) });
  console.log('zyntrus already registered; manifest re-saved; rotating the secret');
  const rot = await call('POST', '/products/zyntrus/rotate-secret');
  out.client_id = rot.client_id; out.client_secret = rot.client_secret;
  void r;
} else {
  const r = await call('PUT', '/products/zyntrus', manifest);
  console.log('zyntrus registered');
  out.client_id = r.client_id; out.client_secret = r.client_secret;
}
if (!out.client_secret) throw new Error('registration returned no client secret');

const org = await call('POST', '/orgs', { name: 'SSO Test Agency', slug: 'sso-test-agency', plan_key: 'enterprise', first_admin: { email: 'sso-admin@sso-test.local', full_name: 'SSO Admin' } });
out.org_id = org.id || org._id;
out.invite_token = org.invite_token || null;
out.org_already_existed = !!org.already_existed;
await call('PUT', `/orgs/${out.org_id}/entitlements/zyntrus`, { status: 'active', reason: 'Zyntrus sign-in test' });
console.log('org ready, entitled to zyntrus');

fs.writeFileSync(path.join(OUT, 'setup.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ client_id: out.client_id, org_id: out.org_id, org_already_existed: out.org_already_existed, invite_token_present: !!out.invite_token, secret_saved_to: path.join(OUT, 'setup.json') }, null, 2));
await browser.close();
