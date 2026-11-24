// Shared helpers for the real-stack browser walks (e2e-real/*.mjs): TOTP, the authenticator-key store, sign-in through
// the hosted pages, problem capture and a page verdict. No dependency beyond @playwright/test and node built-ins.
// Used by role-walk.mjs (plan §8b RW-1). demo-walk.mjs keeps its own copy until its first green run.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ── TOTP (RFC 6238, SHA-1, 30 s, 6 digits) ──
export function totp(secretB32, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretB32.replace(/[\s=-]+/g, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = crypto.createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/**
 * Authenticator secrets by account key (the e-mail; `operator:<email>` for the operator). `file` is read and written;
 * `extraFiles` (JSON objects of key → secret, e.g. keys enrolled by hand) are merged in, the stored file wins.
 */
export function totpStore(file, extraFiles = []) {
  let data = {};
  for (const f of extraFiles) { try { data = { ...data, ...JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { /* optional */ } }
  try { data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }
  return {
    get: (key) => data[key],
    set: (key, secret) => {
      data[key] = secret;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 1));
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Signs `who` ({ email, password }) in through the hosted pages, starting at `startUrl`. Handles authenticator
 * enrolment (stores the secret) and the code prompt. A code is accepted once per 30 s window, so a refused code is
 * retried once with the next window's code. Resolves when the browser is back on the start URL's origin.
 */
export async function signIn(page, startUrl, who, key, store) {
  const origin = new URL(startUrl).origin;
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/interaction/, { timeout: 60000 });
  await page.fill('input[name=email]', who.email);
  await page.fill('input[name=password]', who.password);
  await page.click('button[type=submit]');
  await page.waitForSelector('input[name=code]', { timeout: 30000 });
  const setupKey = page.locator('button[data-copy]');
  let secret;
  if (await setupKey.count()) {
    secret = await setupKey.first().getAttribute('data-copy');
    store.set(key, secret);
  } else {
    secret = store.get(key);
  }
  if (!secret) throw new Error(`${who.email} has an authenticator app but its key is not stored (enrolled by hand?): add it to the key file or reset its MFA`);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if ((Date.now() / 1000) % 30 > 27) await sleep(3500); // too close to the window edge
    await page.fill('input[name=code]', totp(secret));
    await page.click('button[type=submit]');
    const back = await page.waitForURL((u) => u.origin === origin && !/callback/.test(u.pathname), { timeout: attempt ? 60000 : 15000 })
      .then(() => true, () => false);
    if (back) return;
    if (!(await page.locator('input[name=code]').count())) break;
    await sleep(30000 - (Date.now() % 30000) + 500); // the same code twice in one window is refused: wait for the next
  }
  if (new URL(page.url()).origin !== origin) throw new Error(`sign-in of ${who.email} did not return to ${origin} (at ${page.url().slice(0, 100)})`);
}

// ── Problem capture ──
export const API_RE = /:(5000|4000)\/(api|operator|platform)\//;
const IGNORE_CONSOLE = /favicon|Failed to load resource|net::ERR_ABORTED|ResizeObserver|Download the React DevTools/i;
const ROUTER_WARNING = /Matched leaf route|No routes matched location/i;
const SLOW_API_MS = Number(process.env.ROLE_WALK_SLOW_API_MS || 5000);
const strip = (u) => u.replace(/^https?:\/\/[^/]+/, '').slice(0, 120);

/**
 * Calls `sink(level, message)` for each problem the page shows: 'fail' for page errors, 5xx answers and router warnings
 * (an empty route), 'warn' for console errors and 4xx answers (401 is the token renewal and is ignored).
 */
export function watch(page, sink) {
  page.on('pageerror', (e) => sink('fail', `pageerror: ${String(e.message).slice(0, 200)}`));
  page.on('console', (m) => {
    const t = m.text();
    if (ROUTER_WARNING.test(t)) sink('fail', `router: ${t.slice(0, 160)}`);
    else if (m.type() === 'error' && !IGNORE_CONSOLE.test(t)) sink('warn', `console: ${t.slice(0, 200)}`);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (process.env.ROLE_WALK_DEBUG && API_RE.test(u)) sink('info', `api ${r.status()} ${r.request().method()} ${strip(u)}`);
    if (!API_RE.test(u) || r.status() < 400 || r.status() === 401) return;
    sink(r.status() >= 500 ? 'fail' : 'warn', `HTTP ${r.status()} ${r.request().method()} ${strip(u)}`);
  });
  // A slow API answer is reported, so a page judged while still loading points at its cause.
  page.on('requestfinished', (req) => {
    if (!API_RE.test(req.url())) return;
    const t = req.timing();
    if (t && t.responseEnd > SLOW_API_MS) sink('warn', `slow API ${Math.round(t.responseEnd)} ms ${req.method()} ${strip(req.url())}`);
  });
}

/**
 * Waits until a page is ready to be judged: network quiet (a notification stream may never go idle, so bounded),
 * not on the sign-in callback, and no "Loading…" text on screen (at most `maxWaitMs`).
 */
export async function settle(page, ms = 6000, maxWaitMs = 25000) {
  await page.waitForLoadState('networkidle', { timeout: ms }).catch(() => {});
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const busy = await page.evaluate(() => {
      if (/\/auth\/callback$/.test(location.pathname)) return true;
      if (/(^|\n)\s*Loading(\.\.\.|…)?\s*(\n|$)/i.test(document.body?.innerText || '')) return true;
      const inChrome = (el) => !!el.closest('nav, aside, header');
      // skeleton placeholders (Tailwind animate-pulse) in the content area: data still on its way (the Admin app has no <main>)
      if ([...document.querySelectorAll('.animate-pulse')].some((el) => !inChrome(el) && el.getBoundingClientRect().height > 0)) return true;
      // nothing rendered yet (a lazy route still compiling on the dev server): same measure as verdict()
      const clone = (document.querySelector('main') || document.body).cloneNode(true);
      clone.querySelectorAll('nav, aside, header, script, style').forEach((n) => n.remove());
      return (clone.textContent || '').replace(/\s+/g, ' ').trim().length < 40;
    }).catch(() => false);
    if (!busy) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(900);
}

const ERROR_TEXT = /failed to load|could not be loaded|something went wrong|unexpected error/i;
const EMPTY_STATE = /\bNo [a-z][a-z /-]{1,40}(found|match(es)?|yet)\b/i;
const COUNTER = /\b([1-9]\d*)\s+(Requests?|Tickets?|Projects?|Tasks?|Agreements?|Users?|Employees?|Members?|Leaves?)\b/;

/**
 * What a page looks like to a person: the path it ended on, and problems: 404 page, the 403 page, the sign-in page,
 * a blank content area, error text, or an empty list next to a counter that says there is data.
 */
export async function verdict(page) {
  // A list may flash back to its skeleton during a background refetch: an empty content area counts only when it stays
  // empty for 5 s.
  for (let i = 0; i < 10; i += 1) {
    const len = await page.evaluate(() => {
      const clone = (document.querySelector('main') || document.body).cloneNode(true);
      clone.querySelectorAll('nav, aside, header, script, style').forEach((n) => n.remove());
      return (clone.textContent || '').replace(/\s+/g, ' ').trim().length;
    }).catch(() => 0);
    if (len >= 40) break;
    await page.waitForTimeout(500);
  }
  const url = new URL(page.url());
  const facts = await page.evaluate(() => {
    const root = document.querySelector('main') || document.body;
    const clone = root.cloneNode(true);
    clone.querySelectorAll('nav, aside, header, script, style').forEach((n) => n.remove());
    const content = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    const heading = (document.querySelector('main h1, h1') || {}).textContent || '';
    return { content: content.slice(0, 4000), heading: heading.trim().slice(0, 120) };
  }).catch(() => ({ content: '', heading: '' }));
  const problems = [];
  if (/^id\./.test(url.hostname) || /\/interaction\//.test(url.pathname)) problems.push(['fail', 'sent back to sign-in']);
  else if (url.pathname === '/403' || /Access Restricted/.test(facts.content)) problems.push(['fail', 'opened the 403 page']);
  else if (facts.heading === '404' || /Page Not Found/i.test(facts.content)) problems.push(['fail', '404 page']);
  else if (facts.content.length < 40) problems.push(['fail', 'blank page (no content)']);
  const err = facts.content.match(ERROR_TEXT);
  if (err) problems.push(['fail', `shows "${err[0]}"`]);
  const empty = facts.content.match(EMPTY_STATE);
  const count = facts.content.match(COUNTER);
  if (empty && count) problems.push(['warn', `list says "${empty[0]}" while a counter says "${count[0]}"`]);
  return { path: url.pathname + url.search, heading: facts.heading, problems };
}
