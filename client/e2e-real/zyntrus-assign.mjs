// Give a demo member access to Zyntrus on the running local stack, the way a real customer would get it:
//  1. a platform operator gives the member's organisation the Zyntrus entitlement (Command Center),
//  2. the organisation's admin assigns the member a Zyntrus role (Admin Center, Apps & Access),
//  3. the member's Admin Center and products-app menus are opened and checked for the Zyntrus tile.
// Zyntrus must already be registered (node e2e-real/zyntrus-setup.mjs). Passwords and authenticator secrets are read from files at
// run time (server/.local/demo-accounts.json, demo-walk-totp.json) and are never printed.
//   cd karbexa-admin/client && node e2e-real/zyntrus-assign.mjs            (env: ZYNTRUS_PERSON=amira.khan@acme-demo.test, ZYNTRUS_ROLE=zyntrus_admin)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { operatorCredentials, hostedSignIn, loadState, saveState } from './lib-signin.mjs';

const ADMIN = (process.env.DEMO_ADMIN_URL || 'http://admin.karbexa.localhost:5173').replace(/\/$/, '');
const API = (process.env.DEMO_ADMIN_API || 'http://admin.karbexa.localhost:5000').replace(/\/$/, '');
const PRODUCTS = (process.env.DEMO_PRODUCTS_URL || 'http://app.karbexa.localhost:5174').replace(/\/$/, '');
const OUT = process.env.SSO_TEST_OUT || 'D:/karbexa-test-tmp/sso';
const LOCAL = path.resolve('..', 'server', '.local');
const PERSON = process.env.ZYNTRUS_PERSON || 'amira.khan@acme-demo.test';
const ROLE = process.env.ZYNTRUS_ROLE || 'zyntrus_admin';
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

const accounts = JSON.parse(fs.readFileSync(path.join(LOCAL, 'demo-accounts.json'), 'utf8'));
const secrets = JSON.parse(fs.readFileSync(path.join(LOCAL, 'demo-walk-totp.json'), 'utf8'));
if (!secrets[PERSON]) throw new Error(`no stored authenticator secret for ${PERSON}`);
saveState({ ...loadState(), [`demo:${PERSON}`]: secrets[PERSON] });
const orgId = accounts.organisation.id;

const browser = await chromium.launch();
const results = [];
const say = (ok, what, detail = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FAIL'}  ${what}${detail ? `  [${detail}]` : ''}`); };

// 1. Operator: entitle the organisation.
{
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  let bearer = '';
  page.on('request', (r) => { const a = r.headers()['authorization']; if (a && r.url().includes('/operator/v1/')) bearer = a; });
  const op = operatorCredentials();
  await hostedSignIn(page, `${ADMIN}/operator`, op, `operator:${op.email}`, new URL(ADMIN).origin);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  const res = await fetch(`${API}/operator/v1/orgs/${orgId}/entitlements/zyntrus`, {
    method: 'PUT', headers: { authorization: bearer, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'active', reason: 'Zyntrus sign-in demo' }),
  });
  say(res.ok, `operator: ${accounts.organisation.name} entitled to Zyntrus`, `HTTP ${res.status}`);
  await page.goto(`${ADMIN}/operator/organizations/${orgId}?tab=products`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  const listed = await page.waitForFunction(() => /Zyntrus/i.test(document.body.innerText), null, { timeout: 15000 }).then(() => true).catch(() => false);
  say(listed, 'operator: the Products tab of the organisation lists Zyntrus');
  await page.screenshot({ path: path.join(OUT, 'shots', 'assign-1-operator-org.png') });
  await page.context().close();
}

// 2. The organisation's admin: assign the Zyntrus role.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let bearer = '', apiBase = `${API}/api/v1`;
page.on('request', (r) => { const a = r.headers()['authorization']; const m = /^(https?:\/\/[^/]+\/api\/v1)\//.exec(r.url()); if (a && m) { bearer = a; apiBase = m[1]; } });
await hostedSignIn(page, `${ADMIN}/overview`, { email: PERSON, password: accounts.password }, `demo:${PERSON}`, new URL(ADMIN).origin);
await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
const k = async (method, url, body) => {
  const r = await fetch(apiBase + url, { method, headers: { authorization: bearer, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const me = (await k('GET', '/auth/me')).json.data.user;
const memberId = String(me._id || me.id);
const apps = (await k('GET', '/apps')).json.data;
const zyntrus = apps.find((a) => a.product_key === 'zyntrus');
say(!!zyntrus, 'admin center: Zyntrus is listed in Apps & Access for the organisation');
if (!zyntrus) { await browser.close(); process.exit(1); }
const appId = String(zyntrus._id);
for (const a of (await k('GET', `/apps/target/user/${memberId}`)).json.data || []) {
  if (String(a.app_id) === appId && a.is_active !== false) await k('POST', `/apps/${appId}/revoke`, { assignment_id: String(a._id) });
}
const assigned = await k('POST', `/apps/${appId}/assign`, { target_type: 'user', target_id: memberId, product_role_key: ROLE, reason: 'Zyntrus sign-in demo' });
say(assigned.status === 201, `admin center: ${me.full_name || PERSON} assigned Zyntrus as ${ROLE}`, `HTTP ${assigned.status}`);

// 3. The member's menus.
await page.goto(`${ADMIN}/overview`, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
await page.getByRole('button', { name: /apps|launcher/i }).first().click();
await page.waitForTimeout(800);
say(/Zyntrus/.test(await page.locator('body').innerText()), 'admin center menu: the Zyntrus tile is there');
await page.screenshot({ path: path.join(OUT, 'shots', 'assign-2-admin-menu.png') });

const q = await ctx.newPage();
// The products app's own sign-in callback sometimes answers "grant request is invalid" (the one-time code is used twice in dev);
// the Karbexa session is already live, so one more attempt goes straight through.
for (let attempt = 1; attempt <= 2; attempt++) {
  await q.goto(`${PRODUCTS}/people/home`, { waitUntil: 'domcontentloaded' });
  await q.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await q.waitForTimeout(2500);
  if (!/auth\/callback/.test(q.url())) break;
  console.log(`      (products sign-in callback failed on attempt ${attempt}; ${attempt < 2 ? 'trying again' : 'giving up'})`);
}
const trigger = q.getByText('Settings & Portals').first(); // the sidebar appears after the dashboard has loaded
await trigger.waitFor({ timeout: 30000 }).catch(() => {});
if (await trigger.count()) {
  // A "What's New" dialog may cover the page on a member's first visit: close it (Escape, then its close button).
  const whatsNew = q.getByRole('dialog', { name: /what.s new/i });
  if (await whatsNew.count()) {
    await q.keyboard.press('Escape');
    if (await whatsNew.count()) await whatsNew.getByRole('button').first().click().catch(() => {});
    await q.waitForTimeout(500);
  }
  await trigger.click();
  await q.waitForTimeout(2000);
  say(/Zyntrus/.test(await q.locator('body').innerText()), 'products app menu (Settings & Portals): the Zyntrus tile is there');
  await q.screenshot({ path: path.join(OUT, 'shots', 'assign-3-products-menu.png') });
} else {
  await q.screenshot({ path: path.join(OUT, 'shots', 'assign-3-products-no-trigger.png') });
  say(false, 'products app: no sidebar (the member could not sign in to the products app)', q.url().replace(/\?.*/, ''));
}
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
