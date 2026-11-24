// Role walk (execution plan §8b, RW-1): every kind of person signs in through the real hosted pages and CLICKS every item
// of their own menus, in the Command Center, the Admin Center and the products app (every portal of the Settings &
// Portals switcher). Each page is checked for: empty menu, 404, the 403 page, being sent back to sign-in, a blank page,
// error text, a list that is empty while its counter says otherwise, page errors, console errors, router warnings and
// API answers >= 400. Also: every member must land on a usable page in the products app.
//
// Starts and stops nothing. With the stack running (`node scripts/dev.mjs`, demo organisation built), from the workspace
// root:  node scripts/check.mjs role-walk     or from karbexa-admin/client:  node e2e-real/role-walk.mjs
//
// Environment (all optional):
//   DEMO_ACCOUNTS        default ../server/.local/demo-accounts.json (Admin seed:demo: members and the shared password)
//   ROLE_WALK_OUT        default D:/karbexa-test-tmp/role-walk (walk-report.md, role-walk-results.json, shots/)
//   DEMO_WALK_STATE      authenticator secrets, shared with demo-walk.mjs (default <folder of DEMO_ACCOUNTS>/demo-walk-totp.json)
//   ROLE_WALK_MFA_KEYS   extra key files (comma separated JSON objects e-mail → secret), e.g. keys enrolled by hand
//   DEMO_OPERATOR_EMAIL / DEMO_OPERATOR_PASSWORD   the operator; without them the operator persona is skipped.
//                        An operator whose authenticator was enrolled on a phone needs its key in a key file
//                        (`operator:<email>` → secret), else that persona is skipped with a note.
//   ROLE_WALK_NO_ACCESS  e-mail of a demo member with no product access (expected to land on /403 with the launcher)
//   ROLE_WALK_ONLY       regular expression on the persona key (operator, amira, hassan, irene, omar, daniel, bilal, yusuf, tariq)
//   ROLE_WALK_HEADED=1   show the browser
//   DEMO_ADMIN_URL / DEMO_PRODUCTS_URL   default http://admin.karbexa.localhost:5173 and http://app.karbexa.localhost:5174
//
// Exit code 0 when no page failed (warnings are reported, not fatal), 1 otherwise, 2 for a setup problem.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { totpStore, signIn, watch, settle, verdict } from './lib.mjs';

const ADMIN = (process.env.DEMO_ADMIN_URL || 'http://admin.karbexa.localhost:5173').replace(/\/$/, '');
const PRODUCTS = (process.env.DEMO_PRODUCTS_URL || 'http://app.karbexa.localhost:5174').replace(/\/$/, '');
const ACCOUNTS_FILE = path.resolve(process.env.DEMO_ACCOUNTS || path.join('..', 'server', '.local', 'demo-accounts.json'));
const OUT = process.env.ROLE_WALK_OUT || 'D:/karbexa-test-tmp/role-walk';
const STATE_FILE = process.env.DEMO_WALK_STATE || path.join(path.dirname(ACCOUNTS_FILE), 'demo-walk-totp.json');
const EXTRA_KEYS = (process.env.ROLE_WALK_MFA_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean);
const ONLY = process.env.ROLE_WALK_ONLY ? new RegExp(process.env.ROLE_WALK_ONLY, 'i') : null;

if (!fs.existsSync(ACCOUNTS_FILE)) {
  console.error(`role-walk: ${ACCOUNTS_FILE} is missing. Build the demo organisation first: node scripts/dev.mjs --demo`);
  process.exit(2);
}
const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
const store = totpStore(STATE_FILE, EXTRA_KEYS);
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

const byName = (name) => {
  const p = (accounts.people || []).find((x) => x.name === name);
  return p ? { email: p.email, password: accounts.password } : null;
};
const byEmail = (email) => ((accounts.people || []).some((x) => x.email === email) ? { email, password: accounts.password } : null);

// Who walks, and in which apps. Roles as built by Admin seed:demo (see its ACCESS table).
const PERSONAS = [
  { key: 'operator', label: 'Operator (Command Center)', apps: ['operator'] },
  { key: 'amira', label: 'Super Admin (Amira Khan)', who: () => byName('Amira Khan'), apps: ['admin', 'products'] },
  { key: 'hassan', label: 'HR Admin, People administrator (Hassan Ali)', who: () => byName('Hassan Ali'), apps: ['admin', 'products'] },
  { key: 'irene', label: 'IT Admin, Desk admin (Irene Chen)', who: () => byName('Irene Chen'), apps: ['admin', 'products'] },
  { key: 'omar', label: 'Manager, Projects manager (Omar Farooq)', who: () => byName('Omar Farooq'), apps: ['admin', 'products'] },
  { key: 'daniel', label: 'Manager, Desk support lead (Daniel Brooks)', who: () => byName('Daniel Brooks'), apps: ['products'] },
  { key: 'bilal', label: 'Employee, Projects team member (Bilal Ahmed)', who: () => byName('Bilal Ahmed'), apps: ['admin', 'products'] },
  { key: 'yusuf', label: 'Employee, Desk technician (Yusuf Rahman)', who: () => byName('Yusuf Rahman'), apps: ['products'] },
  { key: 'tariq', label: 'Sales employee, access only through All Members (Tariq Hussain)', who: () => byName('Tariq Hussain'), apps: ['products'] },
];
if (process.env.ROLE_WALK_NO_ACCESS) {
  PERSONAS.push({ key: 'noaccess', label: `No product access (${process.env.ROLE_WALK_NO_ACCESS})`, who: () => byEmail(process.env.ROLE_WALK_NO_ACCESS), apps: ['products'], noAccess: true });
}

const rows = [];      // one per page visited
const personas = [];  // one per persona: status and notes
let currentRow = null;

function newRow(persona, app, item, href) {
  const row = { persona: persona.key, app, item, href, path: '', heading: '', level: 'ok', problems: [], shot: '' };
  rows.push(row);
  currentRow = row;
  return row;
}
function closeRow(row, v, shotName) {
  row.path = v.path;
  row.heading = v.heading;
  row.problems.push(...v.problems);
  row.shot = shotName;
  // The same problem may be reported by several listeners: keep one of each.
  const seen = new Set();
  row.problems = row.problems.filter(([, m]) => (seen.has(m) ? false : seen.add(m)));
  row.level = row.problems.some(([l]) => l === 'fail') ? 'fail' : row.problems.length ? 'warn' : 'ok';
  currentRow = null;
  const mark = row.level === 'fail' ? 'FAIL' : row.level === 'warn' ? 'warn' : 'ok  ';
  console.log(`${mark}  ${row.persona.padEnd(8)} ${row.app.padEnd(9)} ${row.item.slice(0, 40).padEnd(40)} ${row.path}`);
  for (const [l, m] of row.problems) console.log(`        ${l}: ${m}`);
}

async function shot(page, name) {
  const file = `${name.replace(/[^a-z0-9]+/gi, '_').slice(0, 90)}.png`;
  await page.screenshot({ path: path.join(OUT, 'shots', file) }).catch(() => {});
  return file;
}

/** Visits `startUrl`; when the hosted sign-in shows its form, signs in. Single sign-on covers the second app. */
async function ensureSignedIn(page, startUrl, who, key) {
  const origin = new URL(startUrl).origin;
  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Either the hosted sign-in form appears, or single sign-on brings the browser straight back to the app.
  await Promise.race([
    page.waitForSelector('input[name=email]', { timeout: 60000 }),
    page.waitForURL((u) => u.origin === origin && !/callback/.test(u.pathname), { timeout: 60000 }),
  ]).catch(() => {});
  if (await page.locator('input[name=email]').isVisible().catch(() => false)) await signIn(page, startUrl, who, key, store);
  await settle(page);
}

/** Clicks every internal link that `linkSelector` finds (re-queried each time); pages already seen are skipped. */
async function walkLinks(page, persona, app, linkSelector, scope, seen) {
  await page.waitForSelector(linkSelector, { timeout: 15000 }).catch(() => {});
  const links = await page.$$eval(linkSelector, (as) => as.map((a) => ({ text: (a.textContent || '').replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') || '' })));
  const internal = links.filter((l) => l.href.startsWith('/'));
  if (!internal.length) {
    const row = newRow(persona, app, `${scope}: menu`, '');
    row.problems.push(['fail', `empty menu (${links.length} links, none internal)`]);
    closeRow(row, await verdict(page), await shot(page, `${persona.key}-${app}-empty-menu`));
    return;
  }
  for (const link of internal) {
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    const row = newRow(persona, app, `${scope}: ${link.text || link.href}`, link.href);
    const target = page.locator(`${linkSelector}[href="${link.href}"]`).first();
    try {
      if (await target.isVisible()) await target.click();
      else { row.problems.push(['warn', 'menu item not visible; opened by its address']); await page.goto(new URL(link.href, page.url()).href); }
    } catch (e) {
      row.problems.push(['fail', `could not open: ${String(e.message).split('\n')[0].slice(0, 120)}`]);
    }
    await settle(page);
    closeRow(row, await verdict(page), await shot(page, `${persona.key}-${app}-${link.href}`));
  }
}

/** Names of the apps in the products Settings & Portals switcher (opens it). */
async function switcherApps(page) {
  // The button toggles the flyout: click it only while the flyout is closed.
  if (!(await page.getByText('Karbexa Applications').isVisible().catch(() => false))) {
    await page.getByText('Settings & Portals').first().click();
  }
  const list = page.getByText('Karbexa Applications').locator('xpath=..');
  await list.locator('button').first().waitFor({ timeout: 10000 }).catch(() => {});
  const names = await list.locator('button .font-semibold').allInnerTexts().catch(() => []);
  return names.map((n) => n.trim()).filter(Boolean);
}

async function walkProducts(page, persona, who) {
  const seen = new Set();
  // Landing: everyone with a product must land on a usable page.
  const land = newRow(persona, 'products', 'landing (/)', '/');
  await ensureSignedIn(page, `${PRODUCTS}/`, who, who.email);
  const lv = await verdict(page);
  if (persona.noAccess) lv.problems = lv.problems.filter(([, m]) => m !== 'opened the 403 page'); // expected for this persona
  closeRow(land, lv, await shot(page, `${persona.key}-products-landing`));
  if (persona.noAccess) return;

  let apps = [];
  try { apps = await switcherApps(page); } catch { /* reported below */ }
  await page.keyboard.press('Escape').catch(() => {});
  if (!apps.length) {
    const row = newRow(persona, 'products', 'Settings & Portals switcher', '');
    row.problems.push(['fail', 'the switcher lists no apps']);
    closeRow(row, await verdict(page), await shot(page, `${persona.key}-products-no-apps`));
    return;
  }
  console.log(`        ${persona.key}: switcher lists ${apps.join(', ')}`);
  for (const name of apps) {
    const row = newRow(persona, 'products', `switcher: ${name}`, '');
    try {
      await switcherApps(page);
      const popup = page.context().waitForEvent('page', { timeout: 3000 }).catch(() => null);
      await page.getByText('Karbexa Applications').locator('xpath=..').locator('button', { hasText: name }).first().click();
      const other = await popup;
      if (other) { row.problems.push(['warn', `opens in a new tab: ${other.url().slice(0, 80)} (not walked here)`]); await other.close(); }
    } catch (e) {
      row.problems.push(['fail', `could not open from the switcher: ${String(e.message).split('\n')[0].slice(0, 120)}`]);
    }
    await settle(page);
    closeRow(row, await verdict(page), await shot(page, `${persona.key}-products-switch-${name}`));
    await walkLinks(page, persona, 'products', 'aside nav a', name, seen);
  }
}

async function walkPersona(browser, persona) {
  const rec = { key: persona.key, label: persona.label, status: 'walked', notes: [] };
  personas.push(rec);
  let who;
  let appKey;
  if (persona.key === 'operator') {
    const email = process.env.DEMO_OPERATOR_EMAIL || process.env.OPERATOR_SEED_EMAIL;
    const password = process.env.DEMO_OPERATOR_PASSWORD || process.env.OPERATOR_SEED_PASSWORD;
    if (!email || !password) { rec.status = 'skipped'; rec.notes.push('set DEMO_OPERATOR_EMAIL and DEMO_OPERATOR_PASSWORD to walk the Command Center'); return; }
    who = { email, password };
    appKey = `operator:${email}`;
  } else {
    who = persona.who();
    if (!who) { rec.status = 'skipped'; rec.notes.push(`not in ${path.basename(ACCOUNTS_FILE)}`); return; }
    appKey = who.email;
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  watch(page, (level, message) => { if (currentRow) currentRow.problems.push([level, message]); });
  try {
    for (const app of persona.apps) {
      if (app === 'operator') {
        await ensureSignedIn(page, `${ADMIN}/operator/overview`, who, appKey);
        await walkLinks(page, persona, 'operator', 'nav[aria-label="Main"] a', 'menu', new Set());
      } else if (app === 'admin') {
        await ensureSignedIn(page, `${ADMIN}/overview`, who, appKey);
        await walkLinks(page, persona, 'admin', 'nav[aria-label="Main"] a', 'menu', new Set());
      } else {
        await walkProducts(page, persona, who);
      }
    }
  } catch (e) {
    const msg = String(e.message).split('\n')[0].slice(0, 200);
    if (/authenticator app but its key is not stored/.test(msg)) { rec.status = 'skipped'; rec.notes.push(msg); }
    else { rec.status = 'error'; rec.notes.push(msg); await shot(page, `${persona.key}-error`); }
    currentRow = null;
  } finally {
    await context.close();
  }
  const mine = rows.filter((r) => r.persona === persona.key);
  console.log(`--- ${persona.key}: ${mine.length} pages, ${mine.filter((r) => r.level === 'fail').length} fail, ${mine.filter((r) => r.level === 'warn').length} warn${rec.notes.length ? `; ${rec.notes.join('; ')}` : ''}`);
}

function writeReport() {
  const fails = rows.filter((r) => r.level === 'fail');
  const warns = rows.filter((r) => r.level === 'warn');
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  const lines = [
    `# Role walk report`, '',
    `${new Date().toISOString()} · ${rows.length} pages · **${fails.length} fail** · ${warns.length} warn · stack ${ADMIN} and ${PRODUCTS}`, '',
    '## Personas', '', '| Persona | Status | Pages | Fail | Warn | Notes |', '|---|---|---|---|---|---|',
    ...personas.map((p) => {
      const mine = rows.filter((r) => r.persona === p.key);
      return `| ${esc(p.label)} | ${p.status} | ${mine.length} | ${mine.filter((r) => r.level === 'fail').length} | ${mine.filter((r) => r.level === 'warn').length} | ${esc(p.notes.join('; '))} |`;
    }),
    '', '## Problems', '', '| Level | Persona | App | Menu item | Ended at | Problems | Screenshot |', '|---|---|---|---|---|---|---|',
    ...[...fails, ...warns].map((r) => `| ${r.level} | ${r.persona} | ${r.app} | ${esc(r.item)} | \`${esc(r.path)}\` | ${esc(r.problems.map(([l, m]) => `${l}: ${m}`).join('<br>'))} | shots/${r.shot} |`),
    '', '## Every page', '', '| Persona | App | Menu item | Ended at | Heading | Level |', '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.persona} | ${r.app} | ${esc(r.item)} | \`${esc(r.path)}\` | ${esc(r.heading)} | ${r.level} |`),
  ];
  fs.writeFileSync(path.join(OUT, 'walk-report.md'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'role-walk-results.json'), JSON.stringify({ at: new Date().toISOString(), personas, rows }, null, 1));
  return { fails, warns };
}

const browser = await chromium.launch({ headless: process.env.ROLE_WALK_HEADED !== '1' });
try {
  for (const persona of PERSONAS) {
    if (ONLY && !ONLY.test(persona.key)) continue;
    await walkPersona(browser, persona);
  }
} finally {
  await browser.close();
}
const { fails, warns } = writeReport();
const errored = personas.filter((p) => p.status === 'error').length;
console.log(`ROLE WALK: ${rows.length} pages, ${fails.length} fail, ${warns.length} warn, ${errored} persona error(s); report ${path.join(OUT, 'walk-report.md')}`);
process.exit(fails.length || errored ? 1 : 0);
