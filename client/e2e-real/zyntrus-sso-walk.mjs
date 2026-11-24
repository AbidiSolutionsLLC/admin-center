// Real-stack acceptance walk: Zyntrus staff sign-in through Karbexa. Short on purpose (one browser, five checks).
// Needs: Karbexa running (node scripts/dev.mjs), Zyntrus backend :3000 and frontend :5175 with KARBEXA_SSO_ENABLED=true,
// and `node e2e-real/zyntrus-setup.mjs` run once (registers Zyntrus, creates the test agency).
//   cd karbexa-admin/client && node e2e-real/zyntrus-sso-walk.mjs      (env: SSO_TEST_OUT, SSO_HEADED=1)
// Checks: 1 no role -> Karbexa refuses  2 Account Manager role -> Account Manager portal  3 role change -> old session ends,
// new sign-in lands in the Recruiter portal  4 access removed -> session ends, Karbexa refuses  6 first-time sign-in (no Karbexa
// session) lands in the portal  7 Karbexa sign-out -> Zyntrus session ends through back-channel logout. Checks 3 and 4 age the Zyntrus grant (refreshedAt) in the TEST database so the
// 8-minute refresh runs now; nothing else in Zyntrus's data is touched.
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hostedSignIn } from './lib-signin.mjs';

const ADMIN = (process.env.DEMO_ADMIN_URL || 'http://admin.karbexa.localhost:5173').replace(/\/$/, '');
const API = (process.env.DEMO_ADMIN_API || 'http://admin.karbexa.localhost:5000').replace(/\/$/, '');
const ZAPI = process.env.ZYNTRUS_API || 'http://localhost:3000';
const ZWEB = process.env.ZYNTRUS_WEB || 'http://localhost:5175';
const ISSUER = (process.env.KARBEXA_ISSUER || 'http://id.karbexa.localhost:5000/realms/tenant').replace(/\/$/, '');
const OUT = process.env.SSO_TEST_OUT || 'D:/karbexa-test-tmp/sso';
const ZMONGO = process.env.ZYNTRUS_MONGO || 'mongodb://127.0.0.1:27117/zyntrus_sso_test?replicaSet=rs0';
const ZBACKEND = path.resolve('..', '..', 'portals', 'zyntrus', 'backend');
const setup = JSON.parse(fs.readFileSync(path.join(OUT, 'setup.json'), 'utf8'));
const ADMIN_EMAIL = 'sso-admin@sso-test.local';
const adminFile = path.join(OUT, 'tenant-admin.json');
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`); return ok; };
const shot = (page, name) => page.screenshot({ path: path.join(OUT, 'shots', `${name}.png`) }).catch(() => {});
const strip = (u) => u.replace(/\?.*$/, '');

const browser = await chromium.launch({ headless: !process.env.SSO_HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e.message).slice(0, 140)}`));

// ── Agency admin: accept the invite once, sign in to the Admin Center, find the Zyntrus app and the admin's member id. ──
if (!fs.existsSync(adminFile)) {
  const password = `Aa1!${crypto.randomBytes(9).toString('base64url')}`;
  await page.goto(`${ADMIN}/onboarding?token=${encodeURIComponent(setup.invite_token)}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('invite-form').waitFor({ timeout: 30000 });
  await page.fill('#newPassword', password);
  await page.fill('#confirmPassword', password);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/login|interaction/, { timeout: 30000 });
  fs.writeFileSync(adminFile, JSON.stringify({ email: ADMIN_EMAIL, password }));
}
const admin = JSON.parse(fs.readFileSync(adminFile, 'utf8'));
let bearer = '';
let apiBase = `${API}/api/v1`;
page.on('request', (r) => { const a = r.headers()['authorization']; const m = /^(https?:\/\/[^/]+\/api\/v1)\//.exec(r.url()); if (a && m) { bearer = a; apiBase = m[1]; } });
await hostedSignIn(page, `${ADMIN}/overview`, admin, `tenant:${admin.email}`, new URL(ADMIN).origin);
await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
await page.goto(`${ADMIN}/apps`, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
const adminAppsText = await page.locator('main').innerText();
check('Admin Center "Apps & Access" lists Zyntrus for the entitled agency', /Zyntrus/i.test(adminAppsText));
await shot(page, 'admin-apps-with-zyntrus');
if (!bearer) throw new Error('no tenant bearer token was seen');

const karbexa = async (method, url, body) => {
  const res = await fetch(`${apiBase}${url}`, { method, headers: { authorization: bearer, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${json.code || ''} ${json.error || ''}`);
  return json.data ?? json;
};
const me = await karbexa('GET', '/auth/me');
const memberId = String(me.user?._id || me.user?.id);
const apps = await karbexa('GET', '/apps');
const zyntrusApp = (Array.isArray(apps) ? apps : apps.apps || []).find((a) => a.product_key === 'zyntrus');
if (!zyntrusApp) throw new Error('the Zyntrus app is not visible to the agency admin');
const appId = String(zyntrusApp._id || zyntrusApp.id);
// Start from a clean slate so the walk can be run again: drop any active Zyntrus assignment this member still has.
for (const a of await karbexa('GET', `/apps/target/user/${memberId}`).catch(() => [])) {
  if (String(a.app_id) === appId && a.is_active !== false) await karbexa('POST', `/apps/${appId}/revoke`, { assignment_id: String(a._id) }).catch(() => {});
}

// ── Zyntrus's test database (for ageing the grant only) ──
const { MongoClient } = createRequire(path.join(ZBACKEND, 'package.json'))('mongodb');
const mongo = new MongoClient(ZMONGO);
await mongo.connect();
const zusers = mongo.db().collection('users');
const ageGrant = () => zusers.updateMany({ 'karbexa.sub': memberId }, { $set: { 'karbexa.refreshedAt': new Date(Date.now() - 30 * 60 * 1000) } });

// A fresh browser context for "the recruiter / account manager using Zyntrus"; it holds its own Karbexa session.
const zctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const z = await zctx.newPage();
z.on('pageerror', (e) => problems.push(`zyntrus pageerror: ${String(e.message).slice(0, 140)}`));
const startSso = async () => {
  await z.goto(`${ZAPI}/api/auth/karbexa/login`, { waitUntil: 'domcontentloaded' });
  if (/id\.karbexa\.localhost.*interaction.*/.test(z.url()) && (await z.locator('input[name=email]').count())) {
    await z.fill('input[name=email]', admin.email);
    await z.fill('input[name=password]', admin.password);
    await z.click('button[type=submit]');
    await z.waitForSelector('input[name=code]', { timeout: 30000 });
    const { totp, loadState } = await import('./lib-signin.mjs');
    await z.fill('input[name=code]', totp(loadState()[`tenant:${admin.email}`]));
    await z.click('button[type=submit]');
  }
  // Done when we are back in Zyntrus, or Karbexa's hosted page has refused us.
  await Promise.race([
    z.waitForURL((u) => u.origin === new URL(ZWEB).origin, { timeout: 30000 }).catch(() => {}),
    z.waitForFunction(() => /have access to|not available for your/i.test(document.body?.innerText || ''), null, { timeout: 30000 }).catch(() => {}),
  ]);
  await z.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await z.waitForTimeout(800);
};

// 1. No Zyntrus role -> Karbexa's access gate refuses; Zyntrus never sees the member.
await startSso();
const body1 = await z.locator('body').innerText().catch(() => '');
check('1  no Zyntrus role: Karbexa shows "You don\'t have access to Zyntrus" and Zyntrus is not reached', /don.t have access to Zyntrus/i.test(body1) && /id\.karbexa\.localhost/.test(z.url()), strip(z.url()));
await shot(z, '1-no-access');
check('1b no Zyntrus user was created', (await zusers.countDocuments({ 'karbexa.sub': memberId })) === 0);

// 2. Assign Account Manager (zyntrus_admin) -> signs in and lands in the Account Manager portal.
const assignment = await karbexa('POST', `/apps/${appId}/assign`, { target_type: 'user', target_id: memberId, product_role_key: 'zyntrus_admin', reason: 'Zyntrus sign-in test' });
const assignmentId = String(assignment.assignment?._id || assignment.assignment?.id || assignment._id || assignment.id || '');
await startSso();
check('2  Account Manager role: lands in the Account Manager portal', /\/account-manager\//.test(z.url()), strip(z.url()));
await shot(z, '2-account-manager-portal');
const linked = await zusers.findOne({ 'karbexa.sub': memberId }, { projection: { role: 1, 'karbexa.org': 1, company: 1, isActive: 1 } });
check('2b Zyntrus linked the member to the agency and mapped zyntrus_admin to accountManager', !!linked && linked.role === 'accountManager' && linked.karbexa?.org === setup.org_id, JSON.stringify({ role: linked?.role, company: linked?.company }));

// 3. Role changed to Recruiter in Karbexa -> the next Karbexa refresh ends the old session; signing in again gives the Recruiter portal.
if (assignmentId) await karbexa('PATCH', `/apps/assignments/${assignmentId}`, { product_role_key: 'recruiter', reason: 'role change test' });
await ageGrant();
await z.reload({ waitUntil: 'domcontentloaded' });
await z.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await z.waitForTimeout(1000);
check('3  role change: the Account Manager session ends at the next refresh (back at sign-in)', /\/login|\/$/.test(new URL(z.url()).pathname) || !/\/account-manager\//.test(z.url()), strip(z.url()));
await startSso();
check('3b signing in again lands in the Recruiter portal', /\/recruiter\//.test(z.url()), strip(z.url()));
await shot(z, '3-recruiter-portal');

// 4. Access removed -> the next refresh fails, the session ends, and Karbexa refuses a new sign-in.
if (assignmentId) await karbexa('POST', `/apps/${appId}/revoke`, { assignment_id: assignmentId });
await ageGrant();
await z.reload({ waitUntil: 'domcontentloaded' });
await z.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await z.waitForTimeout(1000);
check('4  access removed: the Recruiter session ends at the next refresh', !/\/recruiter\//.test(z.url()), strip(z.url()));
await startSso();
const body4 = await z.locator('body').innerText().catch(() => '');
check('4b access removed: Karbexa refuses a new sign-in', /don.t have access to Zyntrus/i.test(body4), strip(z.url()));

// 5. Access is granted again (the next two checks need it).
await karbexa('POST', `/apps/${appId}/assign`, { target_type: 'user', target_id: memberId, product_role_key: 'recruiter', reason: 'sign-in and sign-out test' });

// 6. First-time sign-in: a browser with NO Karbexa session opens Zyntrus, signs in on the Karbexa page (password + code) and must be
// sent back to Zyntrus. (The browser checks the sign-in page's form-action list along that redirect.)
const fctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const f = await fctx.newPage();
const cspErrors = [];
f.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) cspErrors.push(m.text().slice(0, 120)); });
await f.goto(`${ZAPI}/api/auth/karbexa/login`, { waitUntil: 'domcontentloaded' });
await f.waitForURL(/interaction/, { timeout: 30000 });
await f.fill('input[name=email]', admin.email);
await f.fill('input[name=password]', admin.password);
await f.click('button[type=submit]');
await f.waitForSelector('input[name=code]', { timeout: 30000 });
const { totp: totpNow, loadState: loadTotp } = await import('./lib-signin.mjs');
await f.fill('input[name=code]', totpNow(loadTotp()[`tenant:${admin.email}`]));
await f.click('button[type=submit]');
const reached = await f.waitForURL((u) => u.origin === new URL(ZWEB).origin, { timeout: 30000 }).then(() => true).catch(() => false);
await f.waitForURL(/\/(recruiter|account-manager)\//, { timeout: 20000 }).catch(() => {}); // /auth/karbexa/complete hands over to the portal page
check('6  first-time sign-in (no Karbexa session): login form on Karbexa, then back in the Zyntrus portal', reached && /\/(recruiter|account-manager)\//.test(f.url()), `${strip(f.url())}${cspErrors.length ? ' CSP: ' + cspErrors[0] : ''}`);
await shot(f, '6-first-time-sign-in');

// 7. Back-channel logout: signing out of Karbexa (in the browser that holds this Karbexa session) ends the Zyntrus session by itself.
// (Done on the fresh session of check 6 on purpose: Karbexa merges a second logout for the same session within 10 minutes of an
// earlier one, and check 4 already queued one for the first session.)
const before = await zusers.findOne({ 'karbexa.sub': memberId }, { projection: { sessionVersion: 1, refreshToken: 1 } });
const k = await fctx.newPage();
await k.goto(`${ISSUER}/oauth/end_session?client_id=karbexa-zyntrus&post_logout_redirect_uri=${encodeURIComponent(`${ZWEB}/login`)}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
const signedOut = await k.waitForURL((u) => u.origin === new URL(ZWEB).origin, { timeout: 60000 }).then(() => true).catch(() => false);
await shot(k, '7-karbexa-signout');
await k.close();
let ended = false;
for (let i = 0; i < 30 && !ended; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const now = await zusers.findOne({ 'karbexa.sub': memberId }, { projection: { sessionVersion: 1, refreshToken: 1 } });
  ended = !!now && (now.refreshToken == null || (now.sessionVersion || 0) > (before?.sessionVersion || 0));
}
check('7  Karbexa sign-out reaches Zyntrus by back-channel logout (its session is ended within 60 s)', signedOut && ended, signedOut ? '' : 'Karbexa sign-out page did not finish');

check('no page errors in either browser', problems.length === 0, problems.slice(0, 3).join(' | '));
await mongo.close();
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${path.join(OUT, 'shots')}`);
process.exit(failed ? 1 : 0);
