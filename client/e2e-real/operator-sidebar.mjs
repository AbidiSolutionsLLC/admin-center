// Real-stack check: does the Command Center show its sidebar? Signs in as the operator on the running stack
// (node scripts/dev.mjs), records the /operator/v1/me answer, console errors and the sidebar links.
//   cd karbexa-admin/client && node e2e-real/operator-sidebar.mjs      (env: DEMO_ADMIN_URL, SSO_TEST_OUT, DEMO_HEADED=1)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { operatorCredentials, hostedSignIn } from './lib-signin.mjs';

const ADMIN = (process.env.DEMO_ADMIN_URL || 'http://admin.karbexa.localhost:5173').replace(/\/$/, '');
const OUT = process.env.SSO_TEST_OUT || 'D:/karbexa-test-tmp/sso';
fs.mkdirSync(OUT, { recursive: true });

const who = operatorCredentials();
const browser = await chromium.launch({ headless: !process.env.DEMO_HEADED });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const log = { api: [], console: [], pageerrors: [] };
page.on('response', async (r) => {
  const u = r.url();
  if (/\/operator\/v1\//.test(u)) log.api.push({ status: r.status(), method: r.request().method(), url: u.replace(/^https?:\/\/[^/]+/, '') });
  if (/\/operator\/v1\/me$/.test(u)) { try { log.me = await r.json(); } catch { log.me = '(not JSON)'; } }
});
page.on('console', (m) => { if (m.type() === 'error') log.console.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => log.pageerrors.push(String(e.message).slice(0, 200)));

let failure = '';
try {
  await hostedSignIn(page, `${ADMIN}/operator`, who, `operator:${who.email}`, new URL(ADMIN).origin);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
} catch (e) { failure = String(e.message).split('\n')[0]; }

const url = page.url();
const links = await page.locator('aside[aria-label=Primary] nav a').allInnerTexts().catch(() => []);
const aside = await page.locator('aside[aria-label=Primary]').count();
const asideVisible = aside ? await page.locator('aside[aria-label=Primary]').first().isVisible() : false;
const box = aside ? await page.locator('aside[aria-label=Primary]').first().boundingBox() : null;
await page.screenshot({ path: path.join(OUT, 'operator-after-signin.png') });

const mePerms = Array.isArray(log.me?.data?.permissions) ? log.me.data.permissions : null;
console.log(JSON.stringify({
  signInFailure: failure || null,
  finalUrl: url.replace(/\?.*$/, ''),
  sidebar: { asideCount: aside, visible: asideVisible, box, links },
  me: { calls: log.api.filter((a) => a.url.endsWith('/me')), roles: log.me?.data?.roles, permissionCount: mePerms?.length ?? null },
  operatorApiNon2xx: log.api.filter((a) => a.status >= 400),
  consoleErrors: log.console.slice(0, 6),
  pageErrors: log.pageerrors.slice(0, 4),
}, null, 2));
await browser.close();
process.exit(failure || !links.length ? 1 : 0);
