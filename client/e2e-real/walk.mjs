// Plan 7.5: a real-stack walk. Signs in through the real hosted pages (password + TOTP) against `npm run walk:server`
// (in-memory Mongo, port 5000) and the Vite dev server (port 4173), then opens every Command Center and Admin Center page
// and records page errors, console errors, failed API calls and error states. Not part of `npx playwright test`.
//   node e2e-real/walk.mjs      (env: WALK_CREDS, WALK_OUT, WALK_BASE)
import { chromium } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.WALK_BASE || 'http://127.0.0.1:4173';
const creds = JSON.parse(fs.readFileSync(process.env.WALK_CREDS || 'D:/karbexa-test-tmp/walk/creds.json', 'utf8'));
const OUT = process.env.WALK_OUT || 'D:/karbexa-test-tmp/walk';
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

// RFC 6238 TOTP (SHA-1, 30 s, 6 digits) so the script needs no dependency.
function totp(secretB32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretB32.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const ERROR_TEXT = /failed to load|could not be loaded|something went wrong|unexpected error/i;
const ONLY = process.env.WALK_ONLY || ''; // 'operator' or 'admin' runs one half (a memory-tight machine)
const results = [];
const strip = (u) => u.replace(/^https?:\/\/[^/]+/, '').slice(0, 100);

async function signIn(page, startPath, who) {
  await page.goto(BASE + startPath, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/interaction/, { timeout: 60000 });
  await page.fill('input[name=email]', who.email);
  await page.fill('input[name=password]', who.password);
  await page.click('button[type=submit]');
  await page.waitForSelector('input[name=code]', { timeout: 30000 });
  await page.fill('input[name=code]', totp(who.totp_secret));
  await page.click('button[type=submit]');
  await page.waitForURL((u) => u.origin === new URL(BASE).origin && !/callback/.test(u.pathname), { timeout: 60000 });
}

const FILTER = process.env.WALK_FILTER ? new RegExp(process.env.WALK_FILTER, 'i') : null; // only labels that match

async function visit(page, label, url, selector = 'h1') {
  if (FILTER && !FILTER.test(label)) return;
  const problems = [];
  const onErr = (e) => problems.push(`pageerror: ${String(e.message).slice(0, 160)}`);
  const onCons = (m) => {
    if (m.type() === 'error' && !/favicon|status of (401|403|404)/.test(m.text())) problems.push(`console: ${m.text().slice(0, 160)}`);
  };
  const onResp = (r) => {
    const u = r.url();
    if (!/:5000\/(api|operator)\//.test(u)) return;
    if (r.status() >= 400 && r.status() !== 401) problems.push(`HTTP ${r.status()} ${r.request().method()} ${strip(u)}`);
  };
  page.on('pageerror', onErr);
  page.on('console', onCons);
  page.on('response', onResp);
  let heading = '';
  try {
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(selector, { timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
    heading = (await page.locator(selector).first().innerText().catch(() => '')).trim().slice(0, 60);
    const m = (await page.locator('body').innerText()).match(ERROR_TEXT);
    if (m) problems.push(`error text on page: "${m[0]}"`);
  } catch (e) {
    problems.push(`navigation: ${String(e.message).split('\n')[0].slice(0, 160)}`);
  }
  await page.screenshot({ path: path.join(OUT, 'shots', label.replace(/[^a-z0-9]+/gi, '_') + '.png') }).catch(() => {});
  page.off('pageerror', onErr);
  page.off('console', onCons);
  page.off('response', onResp);
  results.push({ label, url, heading, problems });
  console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${label.padEnd(34)} ${heading ? `[${heading}]` : ''}${problems.length ? '\n        ' + problems.join('\n        ') : ''}`);
}

const browser = await chromium.launch();
try {
  // Command Center
  if (!ONLY || ONLY === 'operator') {
  const octx = await browser.newContext();
  const op = await octx.newPage();
  await signIn(op, '/operator', creds.operator);
  console.log('operator signed in at', op.url());
  for (const [label, url] of [
    ['operator overview', '/operator/overview'], ['operator organizations', '/operator/organizations'], ['operator onboarding', '/operator/onboarding'],
    ['operator products', '/operator/products'], ['operator health', '/operator/health'], ['operator plans', '/operator/plans'],
    ['operator operators', '/operator/operators'], ['operator audit', '/operator/audit'], ['operator security', '/operator/security'],
    ['operator tenant profile', `/operator/organizations/${creds.org_id}`], ['operator tenant onboarding tab', `/operator/organizations/${creds.org_id}?tab=onboarding`],
  ]) await visit(op, label, url);
  await octx.close();
  }

  // Admin Center
  if (!ONLY || ONLY === 'admin') {
  const actx = await browser.newContext();
  const ad = await actx.newPage();
  await signIn(ad, '/overview', creds.admin);
  console.log('admin signed in at', ad.url());
  for (const [label, url] of [
    ['admin overview', '/overview'], ['admin insight history', '/overview/insight-history'], ['admin organization', '/organization'], ['admin company settings', '/company/settings'],
    ['admin teams', '/teams'], ['admin people', '/people'], ['admin roles', '/roles'], ['admin groups', '/groups'], ['admin apps', '/apps'], ['admin subscription', '/subscription'],
    ['admin security', '/security'], ['admin security sessions', '/security?tab=active-sessions'], ['admin security access log', '/security?tab=access-log'],
    ['admin audit log', '/audit-logs'], ['admin policies', '/policies'], ['admin locations', '/locations'], ['admin locations holidays', '/locations?tab=holidays'],
    ['admin data fields', '/data-fields'], ['admin integrations', '/integrations'], ['admin workflows', '/workflows'], ['admin approvals', '/approvals'], ['admin notifications', '/notifications'],
  ]) await visit(ad, label, url);
  // A member profile: open the first member row of the people list (rows navigate on click).
  if (!FILTER || FILTER.test('admin member profile')) {
    await ad.goto(BASE + '/people', { waitUntil: 'domcontentloaded' });
    await ad.waitForSelector('tbody tr', { timeout: 45000 }).catch(() => {});
    await ad.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const row = ad.locator('tbody tr').first();
    if (await row.count()) {
      await row.click();
      const PROFILE_URL = new RegExp('/people/[0-9a-f]{24}');
      await ad.waitForURL(PROFILE_URL, { timeout: 15000 }).catch(() => {});
      const m = PROFILE_URL.exec(ad.url());
      if (m) await visit(ad, 'admin member profile', m[0]);
      else { results.push({ label: 'admin member profile', url: '/people', heading: '', problems: ['clicking the first row did not open a profile'] }); console.log('FAIL  admin member profile: row click did not open a profile'); }
    } else { results.push({ label: 'admin member profile', url: '/people', heading: '', problems: ['no rows on /people'] }); console.log('FAIL  admin member profile: no rows on /people'); }
  }
  await actx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => r.problems.length);
console.log(`\nWALK: ${results.length - failed.length}/${results.length} pages clean; ${failed.length} with problems`);
fs.writeFileSync(path.join(OUT, `walk-results${ONLY ? '-' + ONLY : ''}.json`), JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);
