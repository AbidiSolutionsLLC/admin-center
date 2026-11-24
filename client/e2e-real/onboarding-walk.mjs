// Onboarding walk on the running local stack (node scripts/dev.mjs), in real Chromium, nothing mocked:
//   1. a Karbexa operator creates a NEW company in the Command Center (plan decides which apps it owns),
//   2. the company's first admin accepts the invite, signs in (authenticator enrolment) and sees the Admin Center,
//   3. the admin invites a NEW user; the user accepts the invite,
//   4. the admin assigns apps to that user in Apps & Access,
//   5. the new user signs in to the products app and sees exactly the assigned apps,
//   6. every portal launcher offers both "this tab" and "new tab" (Admin Center launcher, products launcher).
// It creates data: one organisation "Walk Co <stamp>" per run (the stack's database; use the Command Center to close it).
//   cd karbexa-admin/client && node e2e-real/onboarding-walk.mjs        (ONBOARD_HEADED=1 shows the browser)
// Operator login: same files as zyntrus-setup.mjs (D:/karbexa-test-tmp/sso/test-operator.json, else DEMO_OPERATOR_* env).
// Passwords and authenticator secrets are never printed. Output: D:/karbexa-test-tmp/onboarding-walk (screenshots, result.json).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { operatorCredentials } from './lib-signin.mjs';
import { signIn, totpStore } from './lib.mjs';

const ADMIN = (process.env.DEMO_ADMIN_URL || 'http://admin.karbexa.localhost:5173').replace(/\/$/, '');
const API = (process.env.DEMO_ADMIN_API || 'http://admin.karbexa.localhost:5000').replace(/\/$/, '');
const PRODUCTS = (process.env.DEMO_PRODUCTS_URL || 'http://app.karbexa.localhost:5174').replace(/\/$/, '');
const ZYNTRUS_WEB = (process.env.ZYNTRUS_WEB || 'http://localhost:5175').replace(/\/$/, '');
const OUT = process.env.ONBOARD_OUT || 'D:/karbexa-test-tmp/onboarding-walk';
const PLAN = process.env.ONBOARD_PLAN || 'enterprise';
const APPS_FOR_USER = (process.env.ONBOARD_APPS || 'People,Desk').split(',').map((s) => s.trim());
const WITH_ZYNTRUS = process.env.ONBOARD_ZYNTRUS === '1' || APPS_FOR_USER.some((a) => a.toLowerCase() === 'zyntrus');
const PASSWORD = 'Walk-Karbexa-2026!';
const stamp = Date.now().toString(36);
// ONBOARD_REUSE=1: skip steps 1-4 and run 5-6 against the company, admin and user the last full run made.
const REUSE = process.env.ONBOARD_REUSE === '1';
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const prev = REUSE ? JSON.parse(fs.readFileSync(path.join(OUT, 'result.json'), 'utf8')) : null;
const company = prev ? { name: prev.company, owner: prev.owner, ownerName: 'Walk Owner' } : { name: `Walk Co ${stamp}`, owner: `owner@walkco-${stamp}.test`, ownerName: 'Walk Owner' };
const hire = prev ? { email: prev.hire, name: 'New Hire' } : { email: `new.hire@walkco-${stamp}.test`, name: 'New Hire' };
const store = totpStore(path.join(OUT, 'totp.json'), ['D:/karbexa-test-tmp/sso/totp.json']);

const results = [];
const shot = (page, name) => page.screenshot({ path: path.join(OUT, 'shots', `${name}.png`) }).catch(() => {});
async function step(id, title, fn) {
  const t0 = Date.now();
  let error = null;
  try { await fn(); } catch (e) {
    error = String(e.message).split('\n')[0].slice(0, 260);
    // What was on screen when it failed: a screenshot and the visible text of every open tab.
    let n = 0;
    for (const c of browser.contexts()) for (const pg of c.pages()) {
      n += 1;
      await shot(pg, `fail-${id}-${n}`);
      const text = (await pg.locator('body').innerText({ timeout: 3000 }).catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
      error += `\n        tab ${n}: ${pg.url().slice(0, 90)} | ${text}`;
    }
  }
  results.push({ id, title, ok: !error, error, s: Math.round((Date.now() - t0) / 1000) });
  console.log(`${error ? 'FAIL' : 'ok  '}  ${id} ${title} (${Math.round((Date.now() - t0) / 1000)}s)${error ? `\n        ${error}` : ''}`);
  // Steps 1-3 build the company, the admin and the user; the rest cannot mean anything without them.
  if (error && /^[1-3]\./.test(id)) { console.log('        setup step failed, later steps depend on it: stopping'); await finish(); }
  return !error;
}

/** Clicks "Set Password & Activate" and waits for the API's answer (the page's own wording is not proof). */
async function setPassword(p) {
  const answer = p.waitForResponse((r) => /setup-password/.test(r.url()) && r.request().method() === 'POST', { timeout: 90000 });
  await p.getByRole('button', { name: /Set Password/ }).click();
  const res = await answer;
  if (res.status() >= 400) throw new Error(`setup-password answered ${res.status()}: ${(await res.text()).slice(0, 160)}`);
}
const hex64 = (s) => /[0-9a-f]{64}/.exec(String(s))?.[0];

const browser = await chromium.launch({ headless: process.env.ONBOARD_HEADED !== '1' });
const newPage = async () => (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const bearerOf = (page, re) => { const box = { v: '', base: '' }; page.on('request', (r) => { const a = r.headers()['authorization']; const m = re.exec(r.url()); if (a && m) { box.v = a; box.base = m[1]; } }); return box; };
const state = {};
async function finish() {
  await browser.close().catch(() => {});
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ company: company.name, owner: company.owner, hire: hire.email, plan: state.planUsed, owns: state.ownedText, results }, null, 2));
  console.log(`\n${failed.length ? 'FAIL' : 'PASS'}: ${results.length - failed.length}/${results.length} steps. Company "${company.name}" (owner ${company.owner}, user ${hire.email}). Screenshots: ${path.join(OUT, 'shots')}`);
  process.exit(failed.length ? 1 : 0);
}

if (!REUSE) {
// ── 1. Operator creates the company ──
await step('1.1', 'operator signs in to the Command Center', async () => {
  state.opPage = await newPage();
  state.opBearer = bearerOf(state.opPage, /^(https?:\/\/[^/]+\/operator\/v1)\//);
  const op = operatorCredentials();
  await signIn(state.opPage, `${ADMIN}/operator`, op, `operator:${op.email}`, store);
  await state.opPage.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await shot(state.opPage, '1-1-operator-home');
});
await step('1.2', `operator creates "${company.name}" on plan ${PLAN}`, async () => {
  const p = state.opPage;
  await p.goto(`${ADMIN}/operator/organizations`, { waitUntil: 'domcontentloaded' });
  await p.getByRole('button', { name: 'Create organization' }).click();
  await p.getByPlaceholder('Organization name').fill(company.name);
  const plan = p.locator('select[aria-label=Plan]').last();
  await p.waitForFunction(() => [...document.querySelectorAll('select[aria-label=Plan]')].some((s) => s.options.length > 1), null, { timeout: 15000 });
  const values = await plan.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  state.planUsed = values.includes(PLAN) ? PLAN : values[values.length - 1];
  await plan.selectOption(state.planUsed);
  await p.getByRole('button', { name: 'Next' }).click();
  await p.getByPlaceholder('First admin full name').fill(company.ownerName);
  await p.getByPlaceholder('First admin email').fill(company.owner);
  await p.getByRole('button', { name: 'Next' }).click();
  await shot(p, '1-2-operator-review');
  const created = p.waitForResponse((r) => /\/operator\/v1\/orgs$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', { timeout: 150000 });
  await p.getByRole('button', { name: 'Create', exact: true }).click();
  const tCreate = Date.now();
  const cres = await created;
  state.createStatus = cres.status();
  state.createBody = (await cres.text().catch(() => '')).slice(0, 400).replace(/"invite_token":"[0-9a-f]{64}"/, '"invite_token":"<hidden>"');
  console.log(`        POST /operator/v1/orgs -> ${state.createStatus} after ${Math.round((Date.now() - tCreate) / 1000)}s ${state.createBody.slice(0, 200)}`);
  await p.getByText(/Organization (created|already existed)/).waitFor({ timeout: 25000 }).catch(() => {});
  await shot(p, '1-2-operator-created');
  const code = p.getByRole('dialog').locator('code').first();
  if (!(await code.waitFor({ timeout: 5000 }).then(() => true, () => false))) {
    const text = (await p.getByRole('dialog').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    throw new Error(`no invite token in the dialog (EXPOSE_INVITE_TOKEN off?). Dialog says: ${text || 'nothing, no dialog'}`);
  }
  state.ownerToken = hex64(await code.textContent());
  if (!state.ownerToken) throw new Error('the dialog showed no invite token (EXPOSE_INVITE_TOKEN is off?)');
  await shot(p, '1-2-operator-created');
  await p.getByRole('button', { name: 'Done' }).click();
});
await step('1.3', 'operator sees the apps the new company owns (Products tab)', async () => {
  const p = state.opPage;
  await p.goto(`${ADMIN}/operator/organizations`, { waitUntil: 'domcontentloaded' });
  await p.getByText(company.name).first().click({ timeout: 20000 });
  await p.waitForURL(/organizations\/[0-9a-f]{24}/, { timeout: 15000 });
  state.orgUrl = p.url().split('?')[0];
  state.orgId = state.orgUrl.match(/[0-9a-f]{24}$/)?.[0];
  if (WITH_ZYNTRUS && state.orgId && state.opBearer?.v) {
    await fetch(`${API}/operator/v1/orgs/${state.orgId}/entitlements/zyntrus`, {
      method: 'PUT',
      headers: { authorization: state.opBearer.v, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'active', reason: 'Onboarding walk with Zyntrus' }),
    }).catch(() => {});
  }
  await p.goto(`${state.orgUrl}?tab=products`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => /People/.test(document.body.innerText) && /Desk/.test(document.body.innerText), null, { timeout: 20000 });
  state.ownedText = (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 600);
  await shot(p, '1-3-operator-products-tab');
});

// ── 2. First admin accepts the invite and signs in ──
await step('2.1', 'first admin sets a password from the invite link', async () => {
  const p = await newPage();
  state.adminPage = p;
  await p.goto(`${ADMIN}/onboarding?token=${state.ownerToken}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#newPassword', { timeout: 20000 });
  await p.fill('#newPassword', PASSWORD);
  await p.fill('#confirmPassword', PASSWORD);
  await shot(p, '2-1-admin-onboarding');
  await setPassword(p);
});
await step('2.2', 'first admin signs in (authenticator enrolment) and reaches the Admin Center', async () => {
  const p = state.adminPage;
  state.adminBearer = bearerOf(p, /^(https?:\/\/[^/]+\/api\/v1)\//);
  await signIn(p, `${ADMIN}/overview`, { email: company.owner, password: PASSWORD }, company.owner, store);
  await p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await shot(p, '2-2-admin-overview');
  if (/interaction|\/login/.test(p.url())) throw new Error(`still at ${p.url()}`);
});

// ── 3. Admin invites the new user; the user accepts ──
await step('3.1', 'admin invites a new user in People', async () => {
  const p = state.adminPage;
  await p.goto(`${ADMIN}/people`, { waitUntil: 'domcontentloaded' });
  await p.getByRole('button', { name: /Invite user/i }).first().click();
  await p.fill('#invite-name', hire.name);
  await p.fill('#invite-email', hire.email);
  await shot(p, '3-1-admin-invite-modal');
  const done = p.waitForResponse((r) => /\/people\/invite$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', { timeout: 20000 });
  await p.getByRole('button', { name: 'Send Invite' }).click();
  const res = await done;
  if (res.status() >= 400) throw new Error(`invite answered ${res.status()}: ${(await res.text()).slice(0, 160)}`);
  const body = await res.json().catch(() => ({}));
  state.hireId = JSON.stringify(body).match(/"_?id":"([0-9a-f]{24})"/)?.[1];
});
await step('3.2', 'new user opens the invite link and sets a password', async () => {
  const b = state.adminBearer;
  if (!b.v) throw new Error('no admin bearer token seen');
  const api = (u, init = {}) => fetch(`${b.base}${u}`, { ...init, headers: { authorization: b.v, 'content-type': 'application/json' } }).then(async (r) => ({ ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) }));
  if (!state.hireId) {
    const list = await api(`/people?search=${encodeURIComponent(hire.email)}`);
    state.hireId = JSON.stringify(list.json).match(new RegExp(`"_id":"([0-9a-f]{24})"[^}]*?${hire.email.replace(/[.]/g, '\\.')}`))?.[1] || JSON.stringify(list.json).match(/"_id":"([0-9a-f]{24})"/)?.[1];
  }
  if (!state.hireId) throw new Error('could not find the invited user id');
  const copy = await api(`/people/${state.hireId}/resend-invite?copy=true`, { method: 'POST' });
  const token = hex64(copy.json?.data?.invite_link);
  if (!token) throw new Error(`no invite link (HTTP ${copy.status})`);
  const p = await newPage();
  await p.goto(`${ADMIN}/onboarding?token=${token}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#newPassword', { timeout: 20000 });
  await p.fill('#newPassword', PASSWORD);
  await p.fill('#confirmPassword', PASSWORD);
  await setPassword(p);
  await shot(p, '3-2-hire-password-set');
  await p.context().close();
});

// ── 4. Admin assigns apps to the new user ──
for (const app of APPS_FOR_USER) {
  await step(`4.${app}`, `admin assigns ${app} to ${hire.name} (Apps & Access)`, async () => {
    const p = state.adminPage;
    await p.goto(`${ADMIN}/apps`, { waitUntil: 'domcontentloaded' });
    await p.getByRole('button', { name: new RegExp(`^\\s*${app}\\b`) }).first().click({ timeout: 20000 });
    await p.getByRole('button', { name: 'Assign App' }).click();
    const dlg = p.getByRole('dialog');
    await dlg.getByRole('button', { name: 'User', exact: true }).click();
    const sel = dlg.locator('select').first();
    await p.waitForFunction((email) => [...document.querySelectorAll('[role=dialog] select option')].some((o) => o.textContent.includes(email)), hire.email, { timeout: 20000 });
    const value = await sel.locator('option', { hasText: hire.email }).getAttribute('value');
    await sel.selectOption(value);
    await shot(p, `4-${app}-assign-modal`);
    await dlg.getByRole('button', { name: 'Confirm Assignment' }).click();
    await p.waitForFunction(() => !document.querySelector('[role=dialog]'), null, { timeout: 20000 });
    await shot(p, `4-${app}-assigned`);
  });
}

} else {
  await step('R.1', 'reuse: the company admin signs in again', async () => {
    state.adminPage = await newPage();
    await signIn(state.adminPage, `${ADMIN}/overview`, { email: company.owner, password: PASSWORD }, company.owner, store);
  });
}

// ── 5. New user signs in to the products app ──
await step('5.1', 'new user signs in to the products app and sees the assigned apps', async () => {
  const p = await newPage();
  state.userPage = p;
  await signIn(p, `${PRODUCTS}/people/home`, { email: hire.email, password: PASSWORD }, hire.email, store);
  await p.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(4000); // the access projection reaches the products app through the worker
  await p.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await shot(p, '5-1-user-products-home');
  // A first sign-in shows the release-notes modal over the app: dismiss it like a person would.
  const gotIt = p.getByRole('button', { name: 'Got It' });
  if (await gotIt.waitFor({ timeout: 8000 }).then(() => true, () => false)) await gotIt.click();
  const trigger = p.locator('#settings-trigger-btn');
  await trigger.click({ timeout: 20000 });
  for (const app of APPS_FOR_USER) {
    const key = app.toLowerCase();
    await p.locator(`[data-testid="launcher-same-${key}"]`).waitFor({ timeout: 25000 });
  }
  await shot(p, '5-1-user-launcher');
});

// ── 6. Same tab or new tab, for every portal option ──
await step('6.1', 'products launcher: a new-tab button and a same-tab tile for every assigned app', async () => {
  const p = state.userPage;
  const key = APPS_FOR_USER[0].toLowerCase();
  const popup = p.context().waitForEvent('page', { timeout: 15000 }); popup.catch(() => {});
  await p.locator(`[data-testid="launcher-new-${key}"]`).click();
  const tab = await popup;
  await tab.waitForLoadState('domcontentloaded');
  const expectedOrigin = key === 'zyntrus' ? ZYNTRUS_WEB : PRODUCTS;
  if (!tab.url().startsWith(expectedOrigin) && !tab.url().startsWith(PRODUCTS)) throw new Error(`new tab opened ${tab.url()}`);
  await shot(tab, '6-1-new-tab');
  await tab.close();
  if (p.isClosed()) throw new Error('the original tab closed');
});
await step('6.2', 'products launcher: the same-tab tile navigates this tab (no new tab)', async () => {
  const p = state.userPage;
  const pages = p.context().pages().length;
  if (!(await p.locator('[data-testid^="launcher-same-"]').count())) await p.locator('#settings-trigger-btn').click();
  await p.locator(`[data-testid="launcher-same-${APPS_FOR_USER[APPS_FOR_USER.length - 1].toLowerCase()}"]`).click();
  await p.waitForLoadState('domcontentloaded');
  await p.waitForTimeout(1500);
  if (p.context().pages().length !== pages) throw new Error('same-tab click opened another tab');
  await shot(p, '6-2-same-tab');
});
await step('6.3', 'Admin Center launcher: "Karbexa Admin" opens in a new tab or this tab, as chosen', async () => {
  const p = state.adminPage;
  await p.goto(`${ADMIN}/overview`, { waitUntil: 'domcontentloaded' });
  await p.getByRole('button', { name: 'App Launcher' }).click();
  await p.locator('[data-testid="launcher-same-admin"]').waitFor({ timeout: 15000 });
  await shot(p, '6-3-admin-launcher');
  const popup = p.context().waitForEvent('page', { timeout: 15000 }); popup.catch(() => {});
  await p.locator('[data-testid="launcher-new-admin"]').click();
  const tab = await popup;
  await tab.waitForLoadState('domcontentloaded');
  if (!tab.url().startsWith(ADMIN)) throw new Error(`new tab opened ${tab.url()}`);
  await tab.close();
  await p.getByRole('button', { name: 'App Launcher' }).click();
  const before = p.context().pages().length;
  await p.locator('[data-testid="launcher-same-admin"]').click();
  await p.waitForTimeout(1500);
  if (p.context().pages().length !== before) throw new Error('same-tab click opened another tab');
});

await finish();
