// Wave 3 demo walk (execution plan WS-J, J-2): the section 1 path D1-D5 in a real browser against the local stack
// seeded with "node scripts/dev.mjs --demo" (Admin seed:demo + products seed:demo, organisation "Acme Demo").
// It starts and stops nothing: leave `node scripts/dev.mjs --demo` running, then in a second shell (workspace root):
//   node scripts/check.mjs demo-walk          (sets everything below), or by hand from karbexa-admin/client:
//   node e2e-real/demo-walk.mjs
//
// Environment (all optional except the operator login):
//   DEMO_OPERATOR_EMAIL / DEMO_OPERATOR_PASSWORD   the operator made by `npm run seed:operator` (OPERATOR_SEED_EMAIL / _PASSWORD
//                                                  work too). Never read from a file: the script reads no .env.
//   DEMO_ACCOUNTS     default ../server/.local/demo-accounts.json (written by Admin seed:demo: members and the shared password)
//   DEMO_WALK_OUT     default D:/karbexa-test-tmp/demo-walk (screenshots and demo-walk-results.json)
//   DEMO_WALK_STATE   default <folder of DEMO_ACCOUNTS>/demo-walk-totp.json (authenticator secrets of the accounts, local only)
//   DEMO_ADMIN_URL    default http://admin.karbexa.localhost:5173
//   DEMO_PRODUCTS_URL default http://app.karbexa.localhost:5174
//   DEMO_REVOKE_SECONDS  default 10: how long a revoked member's product access may stay open (D5)
//   DEMO_WALK_ONLY    a regular expression on "<id> <title>" of the steps to run (steps do not depend on each other)
//   DEMO_HEADED=1     show the browser
//
// Authenticator enrolment: the hosted sign-in shows a setup key (the `data-copy` attribute of the "Copy key" button) the
// first time an account signs in; the walk reads it, types the 6-digit code and keeps the secret in DEMO_WALK_STATE so a
// second run signs in with a code instead of enrolling (same TOTP code as walk.mjs).
//
// Every step records page errors, console errors and API answers >= 400 (Admin :5000, products :4000; 401 is the token
// renewal and is ignored). A step with any of them fails. Expected refusals (a member without Sign opening Sign, a revoked
// member) are muted for that page only while the step expects them.
//
// The leave approval is done by the People administrator (Hassan Ali), not by the manager: the manager's People role is
// `employee`, so ViewLeaveModal offers no status control to him (see PROGRESS-WS-J.md, "Found while working").
// The access removal revokes the "Engineering" department rule of Projects through the Apps page and puts it back through
// the API with the Admin page's own session at the end, so the walk can be run again.
//
// Selectors come from reading the code of the apps (never from a run): the first run in Wave 3 may need small fixes.
import { chromium } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ADMIN = (process.env.DEMO_ADMIN_URL || 'http://admin.karbexa.localhost:5173').replace(/\/$/, '');
const PRODUCTS = (process.env.DEMO_PRODUCTS_URL || 'http://app.karbexa.localhost:5174').replace(/\/$/, '');
const ACCOUNTS_FILE = path.resolve(process.env.DEMO_ACCOUNTS || path.join('..', 'server', '.local', 'demo-accounts.json'));
const OUT = process.env.DEMO_WALK_OUT || 'D:/karbexa-test-tmp/demo-walk';
const STATE_FILE = process.env.DEMO_WALK_STATE || path.join(path.dirname(ACCOUNTS_FILE), 'demo-walk-totp.json');
const REVOKE_SECONDS = Number(process.env.DEMO_REVOKE_SECONDS || 10);
const ONLY = process.env.DEMO_WALK_ONLY ? new RegExp(process.env.DEMO_WALK_ONLY, 'i') : null;

if (!fs.existsSync(ACCOUNTS_FILE)) {
  console.error(`demo-walk: ${ACCOUNTS_FILE} is missing. Start the stack with: node scripts/dev.mjs --demo`);
  process.exit(2);
}
const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
const operatorEmail = process.env.DEMO_OPERATOR_EMAIL || process.env.OPERATOR_SEED_EMAIL || accounts.operator?.email;
const operatorPassword = process.env.DEMO_OPERATOR_PASSWORD || process.env.OPERATOR_SEED_PASSWORD;
if (!operatorEmail || !operatorPassword) {
  console.error('demo-walk: set DEMO_OPERATOR_EMAIL and DEMO_OPERATOR_PASSWORD (the operator made by "npm run seed:operator").');
  process.exit(2);
}
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

/** A demo member by name, as listed in demo-accounts.json (Admin seed:demo). */
function member(name) {
  const p = (accounts.people || []).find((x) => x.name === name);
  if (!p) throw new Error(`${name} is not in ${ACCOUNTS_FILE}`);
  return { name, email: p.email, password: accounts.password };
}
const CAST = {
  amira: () => member('Amira Khan'), // Super Admin; Projects and Sign administrator; all four products
  hassan: () => member('Hassan Ali'), // People administrator
  bilal: () => member('Bilal Ahmed'), // Engineer: People, Projects, Desk requester; no Sign
  noah: () => member('Noah Wilson'), // Engineer: observes the access removal
  yusuf: () => member('Yusuf Rahman'), // Desk technician
};

// ── TOTP (RFC 6238, SHA-1, 30 s, 6 digits) so the script needs no dependency; copied from walk.mjs ──
function totp(secretB32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretB32.replace(/[\s=]+/g, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
let totpState = {};
try { totpState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { /* first run */ }
const saveState = () => { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(totpState, null, 1)); };

// ── Problem collection: every page of every session reports into the step that is running ──
const API_RE = /:(5000|4000)\/(api|operator)\//;
const IGNORE_CONSOLE = /favicon|Failed to load resource|net::ERR_ABORTED|ResizeObserver|Download the React DevTools/i;
const ERROR_TEXT = /failed to load|could not be loaded|something went wrong|unexpected error/i;
const REFUSAL_TEXT = /access denied|not authori[sz]ed|forbidden|don't have permission|do not have permission|permission required/i;
const strip = (u) => u.replace(/^https?:\/\/[^/]+/, '').slice(0, 110);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const orphans = [];
let current = null;
const muted = new Set(); // pages whose problems are expected right now

function report(page, message) {
  if (muted.has(page)) return;
  (current ? current.problems : orphans).push(message);
}

function watch(s) {
  const { page } = s;
  page.on('pageerror', (e) => report(page, `${s.id}: pageerror: ${String(e.message).slice(0, 180)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORE_CONSOLE.test(m.text())) report(page, `${s.id}: console: ${m.text().slice(0, 180)}`);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (API_RE.test(u) && r.status() >= 400 && r.status() !== 401) report(page, `${s.id}: HTTP ${r.status()} ${r.request().method()} ${strip(u)}`);
  });
  page.on('request', async (r) => {
    if (!API_RE.test(r.url())) return;
    try {
      const h = (await r.allHeaders()).authorization;
      if (h) s.auth = { header: h, origin: new URL(r.url()).origin };
    } catch { /* request already gone */ }
  });
}

const browser = await chromium.launch({ headless: process.env.DEMO_HEADED !== '1' });

// ── Sessions: one browser context per (person, app), signed in once, kept for the rest of the run ──
const sessions = new Map();

async function signIn(page, startUrl, who, key) {
  const origin = new URL(startUrl).origin;
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/interaction/, { timeout: 60000 });
  await page.fill('input[name=email]', who.email);
  await page.fill('input[name=password]', who.password);
  await page.click('button[type=submit]');
  await page.waitForSelector('input[name=code]', { timeout: 30000 });
  let secret;
  const setupKey = page.locator('button[data-copy]');
  if (await setupKey.count()) {
    secret = await setupKey.first().getAttribute('data-copy'); // enrolment page: the secret of the authenticator app
    totpState[key] = secret;
    saveState();
  } else {
    secret = totpState[key];
  }
  if (!secret) throw new Error(`${who.email} already has an authenticator app but no secret is stored in ${STATE_FILE}; reset the demo databases (docs/DATABASE.md) and run dev.mjs --seed --demo`);
  await page.fill('input[name=code]', totp(secret));
  await page.click('button[type=submit]');
  await page.waitForURL((u) => u.origin === origin && !/callback/.test(u.pathname), { timeout: 60000 });
}

/** app: 'admin' (Admin Center), 'operator' (Command Center) or 'products'. Rejected sessions stay rejected (no repeated 60 s waits). */
function session(person, app) {
  const id = `${person}@${app}`;
  if (!sessions.has(id)) {
    sessions.set(id, (async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const s = { id, context, page, auth: null };
      watch(s);
      if (app === 'operator') await signIn(page, `${ADMIN}/operator`, { email: operatorEmail, password: operatorPassword }, `operator:${operatorEmail}`);
      else {
        const who = CAST[person]();
        await signIn(page, app === 'admin' ? `${ADMIN}/overview` : `${PRODUCTS}/people/home`, who, who.email);
      }
      return s;
    })());
  }
  return sessions.get(id);
}

// ── Steps ──
async function step(id, title, fn) {
  if (ONLY && !ONLY.test(`${id} ${title}`)) return;
  const rec = { id, title, status: 'ok', problems: [], notes: [], ms: 0 };
  current = rec;
  const t0 = Date.now();
  let skipped = false;
  try {
    skipped = (await fn(rec)) === 'skip';
  } catch (e) {
    rec.problems.push(`step: ${String(e.message).split('\n')[0].slice(0, 220)}`);
  }
  rec.ms = Date.now() - t0;
  rec.status = rec.problems.length ? 'fail' : skipped ? 'skip' : 'ok';
  current = null;
  results.push(rec);
  console.log(`${rec.status === 'fail' ? 'FAIL' : rec.status === 'skip' ? 'skip' : 'ok  '}  ${id.padEnd(6)} ${title} (${Math.round(rec.ms / 1000)}s)`);
  for (const n of rec.notes) console.log(`        note: ${n}`);
  for (const p of rec.problems) console.log(`        ${p}`);
}

const shot = (s, name) => s.page.screenshot({ path: path.join(OUT, 'shots', `${name.replace(/[^a-z0-9]+/gi, '_')}.png`) }).catch(() => {});

async function settle(page, ms = 5000) {
  await page.waitForLoadState('networkidle', { timeout: ms }).catch(() => {}); // an open notification stream may never go idle
  await page.waitForTimeout(700);
}

/**
 * Opens a page of the session and checks it: it stays on `expectPath` (a path prefix; default = the path asked for),
 * shows no error text and, with `selector`, shows that element. Problems from the page itself are collected by watch().
 */
async function visit(s, label, url, { selector = null, expectPath = null, refusal = true } = {}) {
  const base = /^https?:/.test(url) ? url : (s.id.endsWith('@products') ? PRODUCTS : ADMIN) + url;
  try {
    await s.page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (selector) await s.page.waitForSelector(selector, { timeout: 30000 });
    await settle(s.page);
    const want = expectPath ?? new URL(base).pathname;
    const at = new URL(s.page.url()).pathname;
    if (!at.startsWith(want)) current?.problems.push(`${label}: ended at ${at}, expected ${want}`);
    const text = await s.page.locator('body').innerText().catch(() => '');
    const m = text.match(ERROR_TEXT) || (refusal ? text.match(REFUSAL_TEXT) : null);
    if (m) current?.problems.push(`${label}: page shows "${m[0]}"`);
  } catch (e) {
    current?.problems.push(`${label}: ${String(e.message).split('\n')[0].slice(0, 160)}`);
  }
  await shot(s, `${s.id}-${label}`);
}

/** The "All Time" preset of the date popover that the leave and desk lists start with set to "This Week". */
async function allTime(page) {
  const trigger = page.getByRole('button', { name: /^Date:/ }).first();
  if (!(await trigger.count())) return;
  await trigger.click();
  await page.getByRole('button', { name: /All Time/ }).first().click();
  await page.waitForTimeout(400);
}

/** Opens a ModernSelect (themed select of the products app) and picks an option by its label. */
async function pickModern(page, scope, optionLabel) {
  await scope.locator('button').first().click();
  await page.locator('[data-modern-select-dropdown] div', { hasText: new RegExp(`^${optionLabel}$`) }).first().click();
}

const RUN = Date.now().toString(36);
const created = {}; // facts passed between steps (the organisation made in D1, its invite token)

// ───────────────────────────── D1: operator ─────────────────────────────
await step('D1.1', 'operator signs in (password + authenticator) and lands in the Command Center', async () => {
  const op = await session('operator', 'operator');
  const at = new URL(op.page.url()).pathname;
  if (!at.startsWith('/operator')) throw new Error(`signed in but at ${at}`);
  await shot(op, 'operator-landing');
});

await step('D1.2', 'Command Center: overview, organisations, onboarding, platform health', async () => {
  const op = await session('operator', 'operator');
  for (const [label, url] of [['overview', '/operator/overview'], ['organisations', '/operator/organizations'], ['onboarding', '/operator/onboarding'], ['health', '/operator/health']]) {
    await visit(op, label, url, { selector: 'h1' });
  }
});

await step('D1.3', 'operator creates an organisation from a plan (create dialog, three steps)', async (rec) => {
  const op = await session('operator', 'operator');
  const { page } = op;
  const name = `Walk Co ${RUN}`;
  const slug = `walk-${RUN}`;
  const email = `walk.admin.${RUN}@walk-demo.test`;
  await page.goto(`${ADMIN}/operator/organizations`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Create organization' }).click();
  await page.getByPlaceholder('Organization name').fill(name);
  await page.getByPlaceholder('Slug (optional)').fill(slug);
  const plans = await page.locator('select[aria-label=Plan] option').allTextContents();
  const plan = plans.find((p) => /enterprise/i.test(p)) || plans.filter((p) => p && !/select/i.test(p)).pop();
  if (!plan) throw new Error('the Plan list is empty');
  await page.getByLabel('Plan').selectOption({ label: plan });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByPlaceholder('First admin full name').fill('Walk Admin');
  await page.getByPlaceholder('First admin email').fill(email);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByText(/Organization created/).waitFor({ timeout: 30000 });
  const code = (await page.locator('code').first().innerText({ timeout: 3000 }).catch(() => '')).trim();
  const token = /([0-9a-f]{64})/.exec(code)?.[1];
  Object.assign(created, { name, slug, email, token });
  rec.notes.push(`${name} on plan ${plan}; first admin ${email}; invite token ${token ? 'shown (local stack)' : 'not shown (EXPOSE_INVITE_TOKEN off)'}`);
  await shot(op, 'operator-org-created');
  await page.getByRole('button', { name: 'Done' }).click();
});

await step('D1.4', 'the new organisation is listed under Onboarding', async () => {
  if (!created.name) return 'skip';
  const op = await session('operator', 'operator');
  await visit(op, 'onboarding', '/operator/onboarding', { selector: 'h1' });
  await op.page.getByText(created.name).first().waitFor({ timeout: 15000 });
});

// ───────────────────────────── D2: first admin ─────────────────────────────
await step('D2.1', 'the new first admin activates from the invitation, signs in and sees the setup checklist', async (rec) => {
  if (!created.token) { rec.notes.push('no invite token on screen: the invitation is only readable from the e-mail; not checked'); return 'skip'; }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const s = { id: 'newadmin@admin', context, page, auth: null };
  watch(s);
  const password = `Walk-${crypto.randomBytes(9).toString('base64url')}9!`;
  await page.goto(`${ADMIN}/onboarding?token=${created.token}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('invite-form').waitFor({ timeout: 30000 });
  await page.locator('#newPassword').fill(password);
  await page.locator('#confirmPassword').fill(password);
  await page.getByRole('button', { name: 'Set Password & Activate' }).click();
  await page.waitForTimeout(2500); // the page sends the new member to the sign-in after two seconds
  await signIn(page, `${ADMIN}/overview`, { email: created.email, password }, created.email);
  await page.getByTestId('setup-checklist').waitFor({ timeout: 30000 });
  await shot(s, 'new-admin-checklist');
  await context.close();
});

// ───────────────────────────── D3: Admin Center ─────────────────────────────
const ADMIN_PAGES = [
  ['overview', '/overview'], ['insight history', '/overview/insight-history'], ['organisation', '/organization'], ['company settings', '/company/settings'],
  ['teams', '/teams'], ['people', '/people'], ['roles', '/roles'], ['groups', '/groups'], ['apps and access', '/apps'], ['subscription and seats', '/subscription'],
  ['security', '/security'], ['active sessions', '/security?tab=active-sessions'], ['access log', '/security?tab=access-log'],
  ['audit log', '/audit-logs'], ['policies', '/policies'], ['locations', '/locations'], ['holidays', '/locations?tab=holidays'],
  ['data fields', '/data-fields'], ['integrations', '/integrations'], ['workflows', '/workflows'], ['approvals', '/approvals'], ['notifications', '/notifications'],
];

await step('D3.1', 'Admin Center pages open without errors (first admin Amira Khan)', async () => {
  const admin = await session('amira', 'admin');
  for (const [label, url] of ADMIN_PAGES) await visit(admin, label, url, { selector: 'h1' });
  // A member profile with its product access tab ("why this role"): the first row of People.
  await admin.page.goto(`${ADMIN}/people`, { waitUntil: 'domcontentloaded' });
  await admin.page.waitForSelector('tbody tr', { timeout: 45000 });
  await admin.page.locator('tbody tr').first().click();
  await admin.page.waitForURL(/\/people\/[0-9a-f]{24}/, { timeout: 15000 });
  await settle(admin.page);
  await shot(admin, 'member-profile');
});

await step('D3.2', 'no menu item of the Admin Center leads to a refusal', async (rec) => {
  const admin = await session('amira', 'admin');
  await admin.page.goto(`${ADMIN}/overview`, { waitUntil: 'domcontentloaded' });
  await admin.page.waitForSelector('nav[aria-label="Main"] a[href]', { timeout: 30000 });
  const links = await admin.page.$$eval('nav[aria-label="Main"] a[href]', (as) => [...new Set(as.map((a) => a.getAttribute('href')).filter((h) => h && h.startsWith('/')))]);
  rec.notes.push(`${links.length} menu items: ${links.join(' ')}`);
  if (links.length < 5) throw new Error(`only ${links.length} menu items found; the selector nav[aria-label="Main"] a may have changed`);
  for (const href of links) await visit(admin, `menu ${href}`, href, { selector: 'h1' });
});

// ───────────────────────────── D4: members in the products ─────────────────────────────
const PRODUCT_PAGES = [['People', '/people/home', '/people'], ['Projects', '/project/projectDashboard', '/project'], ['Sign', '/sign/dashboard', '/sign'], ['Desk', '/desk/home', '/desk']];

await step('D4.1', 'one sign-in opens People, Projects, Sign and Desk (Amira Khan has all four)', async () => {
  const s = await session('amira', 'products');
  for (const [label, url, prefix] of PRODUCT_PAGES) await visit(s, label, url, { expectPath: prefix });
});

await step('D4.2', 'a member sees only the assigned products (Bilal Ahmed: no Sign)', async () => {
  const s = await session('bilal', 'products');
  for (const [label, url, prefix] of PRODUCT_PAGES.filter(([l]) => l !== 'Sign')) await visit(s, label, url, { expectPath: prefix });
  muted.add(s.page); // the 403 answer of the Sign API is the expected result here
  try {
    await visit(s, 'Sign (not assigned)', '/sign/dashboard', { expectPath: '/403', refusal: false });
  } finally {
    muted.delete(s.page);
  }
});

await step('D4.3', 'leave request: the pending demo request is approved', async (rec) => {
  const s = await session('hassan', 'products');
  const { page } = s;
  await page.goto(`${PRODUCTS}/admin/leaveTrackerAdmin`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/Search by employee name/).waitFor({ timeout: 30000 });
  await allTime(page);
  await page.getByPlaceholder(/Search by employee name/).fill('Family event');
  await page.waitForTimeout(500);
  const row = page.getByRole('row').filter({ hasText: 'Family event' }).first();
  if (!(await row.count())) throw new Error('the demo leave request "[Demo] Family event" is not in the list (products seed:demo not run?)');
  if (!(await row.innerText()).includes('Pending')) { rec.notes.push('the demo request is not pending any more (approved on an earlier run)'); return 'skip'; }
  await row.locator('[aria-label="View request"]').first().click();
  const statusBox = page.locator('div:has(> label:has-text("Select new status"))').first();
  await statusBox.waitFor({ timeout: 15000 });
  await pickModern(page, statusBox, 'Approve');
  await page.getByRole('button', { name: /Confirm Approved/ }).click();
  await page.getByText('Leave status updated to Approved').waitFor({ timeout: 15000 });
  await shot(s, 'leave-approved');
});

await step('D4.4', 'Projects: a member moves a task to another status (Bilal Ahmed)', async (rec) => {
  const s = await session('bilal', 'products');
  const { page } = s;
  const title = 'Implement contact and lead forms';
  await page.goto(`${PRODUCTS}/project/myTasks`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Date:/ }).first().waitFor({ timeout: 30000 });
  await allTime(page);
  const row = page.getByRole('row').filter({ hasText: title }).first();
  await row.waitFor({ timeout: 30000 });
  await row.click();
  const statusBox = page.locator('div:has(> label:has-text("Status"))').filter({ has: page.locator('button') }).first();
  await statusBox.waitFor({ timeout: 15000 });
  const now = (await statusBox.locator('button').first().innerText()).trim();
  const next = /In Progress/i.test(now) ? 'In Review' : 'In Progress'; // toggle so the walk can run again
  rec.notes.push(`"${title}": ${now} -> ${next}`);
  await pickModern(page, statusBox, next);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Task details saved').waitFor({ timeout: 15000 });
  await shot(s, 'task-status');
});

await step('D4.5', 'Desk: a technician resolves a ticket (Yusuf Rahman)', async (rec) => {
  const s = await session('yusuf', 'products');
  const { page } = s;
  const subject = 'Cannot connect to the office VPN';
  await page.goto(`${PRODUCTS}/desk/workspace?queue=all`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/Search by subject/).waitFor({ timeout: 30000 });
  await allTime(page);
  await page.getByPlaceholder(/Search by subject/).fill('office VPN');
  await page.waitForTimeout(500);
  const row = page.getByRole('row').filter({ hasText: subject }).first();
  if (!(await row.count())) throw new Error(`the demo ticket "${subject}" is not in the All Tickets queue (products seed:demo not run?)`);
  await row.click();
  await page.getByText('Ticket Status').first().waitFor({ timeout: 30000 });
  const resolve = page.getByRole('button', { name: /Mark as Resolved/ });
  if (!(await resolve.count())) {
    const toProgress = page.getByRole('button', { name: /Move to In Progress/ });
    if (await toProgress.count()) { await toProgress.click(); await resolve.waitFor({ timeout: 15000 }); }
    else { rec.notes.push('the ticket cannot be resolved from its current status (resolved on an earlier run?)'); return 'skip'; }
  }
  await resolve.click();
  await page.getByPlaceholder(/Describe how the issue/).fill('VPN profile re-issued; confirmed working (demo walk).');
  await page.getByRole('button', { name: 'Confirm Transition' }).click();
  await page.getByText('Ticket status updated to RESOLVED').waitFor({ timeout: 15000 });
  await shot(s, 'ticket-resolved');
});

// ───────────────────────────── D5: access removal ─────────────────────────────
await step('D5.1', `removing product access closes it within ${REVOKE_SECONDS} s (Projects for Engineering; Noah Wilson is signed in)`, async (rec) => {
  const admin = await session('amira', 'admin');
  const noah = await session('noah', 'products');
  await visit(noah, 'Projects before', '/project/projectDashboard', { expectPath: '/project' });

  // 1. In Apps: select Projects, read its assignments, revoke the Engineering department rule.
  await admin.page.goto(`${ADMIN}/apps`, { waitUntil: 'domcontentloaded' });
  const card = admin.page.locator('button:has([data-testid="product-card-projects"])');
  await card.waitFor({ timeout: 30000 });
  const detail = admin.page.waitForResponse((r) => r.request().method() === 'GET' && /\/api\/v1\/apps\/[0-9a-f]{24}(\?|$)/.test(r.url()), { timeout: 30000 });
  await card.click();
  const app = (await (await detail).json()).data;
  const rule = (app.assignments || []).find((a) => a.target_type === 'department' && /engineering/i.test(a.target_name || ''));
  if (!rule) throw new Error('Projects has no active "Engineering" department rule (Admin seed:demo gives Projects team_member to it)');
  const row = admin.page.locator('div.justify-between').filter({ hasText: 'DEPARTMENT' }).filter({ hasText: 'Engineering' }).last(); // the row itself: nothing inside it has the justify-between class
  await row.getByRole('button', { name: 'Revoke' }).click();
  const revoked = admin.page.waitForResponse((r) => r.request().method() === 'POST' && /\/apps\/[0-9a-f]{24}\/revoke/.test(r.url()), { timeout: 30000 });
  await admin.page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const res = await revoked;
  if (!res.ok()) throw new Error(`revoke answered ${res.status()}`);
  const t0 = Date.now();

  // 2. Noah's next requests must be refused (403 NO_PRODUCT_ACCESS sends the app to /403) within the time limit.
  let closedAfter = null;
  muted.add(noah.page);
  try {
    while (Date.now() - t0 < REVOKE_SECONDS * 1000) {
      await noah.page.goto(`${PRODUCTS}/project/projectDashboard`, { waitUntil: 'domcontentloaded' });
      await noah.page.waitForTimeout(1200);
      if (new URL(noah.page.url()).pathname.startsWith('/403')) { closedAfter = Date.now() - t0; break; }
      await sleep(500);
    }
  } finally {
    muted.delete(noah.page);
  }
  if (closedAfter === null) current.problems.push(`Noah still reached Projects ${REVOKE_SECONDS} s after the revocation`);
  else rec.notes.push(`access closed ${(closedAfter / 1000).toFixed(1)} s after the revocation`);
  await shot(noah, 'revoked');

  // 3. Put the rule back (the walk must leave the demo as it found it) and wait for Noah to get Projects again.
  if (!admin.auth) throw new Error('could not read the Admin session token to restore the rule; restore "Engineering -> Projects (team_member)" in Apps by hand');
  const restore = await admin.context.request.post(`${admin.auth.origin}/api/v1/apps/${app._id}/assign`, {
    headers: { authorization: admin.auth.header },
    data: { target_type: 'department', target_id: rule.target_id, product_role_key: rule.product_role_key || 'team_member', include_descendants: !!rule.include_descendants, reason: 'demo walk: restore' },
  });
  if (!restore.ok()) throw new Error(`restoring the Engineering rule answered ${restore.status()}: restore it in Apps by hand`);
  muted.add(noah.page);
  let back = false;
  try {
    for (const end = Date.now() + 40000; Date.now() < end && !back;) {
      await noah.page.goto(`${PRODUCTS}/project/projectDashboard`, { waitUntil: 'domcontentloaded' });
      await noah.page.waitForTimeout(1500);
      back = new URL(noah.page.url()).pathname.startsWith('/project');
      if (!back) await sleep(1500);
    }
  } finally {
    muted.delete(noah.page);
  }
  if (!back) current.problems.push('Noah did not get Projects back within 40 s after the rule was restored');
});

// ── Summary ──
await browser.close();
const bad = results.filter((r) => r.status === 'fail');
const skipped = results.filter((r) => r.status === 'skip');
const okCount = results.length - bad.length;
if (orphans.length) console.log(`\nProblems outside any step (${orphans.length}):\n  ${orphans.slice(0, 20).join('\n  ')}`);
console.log(`\nDEMO WALK: ${okCount}/${results.length} steps ok; ${bad.length} failed, ${skipped.length} skipped`);
fs.writeFileSync(path.join(OUT, 'demo-walk-results.json'), JSON.stringify({ at: new Date().toISOString(), results, orphans }, null, 1));
process.exit(bad.length || orphans.length ? 1 : 0);
