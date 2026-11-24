// Shared helpers for the small real-stack checks (operator sidebar, Zyntrus SSO): TOTP and the hosted sign-in page.
// The operator password is read from karbexa-admin/server/.env at run time and is never printed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function totp(secretB32) {
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

export function readEnvFile(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export function operatorCredentials() {
  // A dedicated test operator (random password, kept outside the repo) avoids touching the real operator's authenticator.
  const testFile = process.env.SSO_TEST_OPERATOR || 'D:/karbexa-test-tmp/sso/test-operator.json';
  if (fs.existsSync(testFile)) return JSON.parse(fs.readFileSync(testFile, 'utf8'));
  const env = readEnvFile(path.resolve('..', 'server', '.env'));
  const email = process.env.DEMO_OPERATOR_EMAIL || env.OPERATOR_SEED_EMAIL || 'operator@karbexa.local';
  const password = process.env.DEMO_OPERATOR_PASSWORD || env.OPERATOR_SEED_PASSWORD;
  if (!password) throw new Error('No operator password: set DEMO_OPERATOR_PASSWORD or OPERATOR_SEED_PASSWORD in karbexa-admin/server/.env');
  return { email, password };
}

const STATE = process.env.SSO_TEST_STATE || 'D:/karbexa-test-tmp/sso/totp.json';
export function loadState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } }
export function saveState(s) { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); }

/** Hosted sign-in (password, then TOTP). First sign-in of an account shows a setup key: read it and keep it for the next run. */
export async function hostedSignIn(page, startUrl, who, stateKey, expectOrigin) {
  const state = loadState();
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/interaction/, { timeout: 60000 });
  await page.fill('input[name=email]', who.email);
  await page.fill('input[name=password]', who.password);
  await page.click('button[type=submit]');
  await page.waitForSelector('input[name=code]', { timeout: 30000 });
  const setup = page.locator('button[data-copy]');
  let secret = state[stateKey];
  if (await setup.count()) { secret = await setup.first().getAttribute('data-copy'); state[stateKey] = secret; saveState(state); }
  if (!secret) throw new Error(`${stateKey} already has an authenticator app and no secret is stored in ${STATE}`);
  await page.fill('input[name=code]', totp(secret));
  await page.click('button[type=submit]');
  await page.waitForURL((u) => u.origin === expectOrigin && !/callback/.test(u.pathname), { timeout: 60000 });
}
