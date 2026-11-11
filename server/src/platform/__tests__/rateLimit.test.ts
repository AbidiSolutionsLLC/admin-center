// M4: Platform API limiter is keyed on the service client; /platform/v1 skips the global per-IP limiter. No database.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import type { AddressInfo } from 'net';

process.env.GLOBAL_RATE_LIMIT = '2'; // read when middleware/rateLimiter is first imported

const servers: http.Server[] = [];
after(() => { for (const s of servers) s.close(); });

async function listen(app: import('express').Express): Promise<string> {
  const server = http.createServer(app);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('platform limiter: separate budgets per client_id, 429 RATE_LIMITED when exceeded, never keyed on IP', async () => {
  const express = (await import('express')).default;
  const { platformRateLimiter } = await import('../rateLimit');
  const app = express();
  // Stand-in for authenticateService: the client id comes from a header.
  app.use((req, _res, next) => { (req as any).service = { client_id: String(req.headers['x-client']), scopes: [] }; next(); });
  app.use(platformRateLimiter);
  app.get('/ping', (_req, res) => { res.json({ ok: true }); });
  const base = await listen(app);
  const call = (client: string) => fetch(`${base}/ping`, { headers: { 'x-client': client } });

  process.env.PLATFORM_RATE_LIMIT_PER_MIN = '3';
  try {
    for (let i = 0; i < 3; i++) assert.equal((await call('client-a')).status, 200);
    const over = await call('client-a');
    assert.equal(over.status, 429);
    assert.deepEqual(await over.json(), { error: 'Too many requests', code: 'RATE_LIMITED' });
    // Same source IP, different client: its own budget.
    for (let i = 0; i < 3; i++) assert.equal((await call('client-b')).status, 200);
    assert.equal((await call('client-b')).status, 429);
    assert.equal((await call('client-a')).status, 429, 'client-a stays throttled within the window');
  } finally {
    delete process.env.PLATFORM_RATE_LIMIT_PER_MIN;
  }
  assert.equal((await call('client-a')).status, 200, 'with the default budget (1200) the same client passes again');
});

test('platform limiter: invalid PLATFORM_RATE_LIMIT_PER_MIN falls back to 1200', async () => {
  const { platformRateLimitPerMin } = await import('../rateLimit');
  for (const bad of ['', '0', '-5', 'abc', '1.5']) {
    process.env.PLATFORM_RATE_LIMIT_PER_MIN = bad;
    assert.equal(platformRateLimitPerMin(), 1200, `value "${bad}"`);
  }
  process.env.PLATFORM_RATE_LIMIT_PER_MIN = '250';
  assert.equal(platformRateLimitPerMin(), 250);
  delete process.env.PLATFORM_RATE_LIMIT_PER_MIN;
});

test('global per-IP limiter skips /platform/v1 but still limits other routes', async () => {
  const express = (await import('express')).default;
  const { globalLimiter } = await import('../../middleware/rateLimiter');
  const app = express();
  app.use(globalLimiter);
  app.get('/platform/v1/ping', (_req, res) => { res.json({ ok: true }); });
  app.get('/api/v1/ping', (_req, res) => { res.json({ ok: true }); });
  const base = await listen(app);
  for (let i = 0; i < 6; i++) assert.equal((await fetch(`${base}/platform/v1/ping`)).status, 200);
  assert.equal((await fetch(`${base}/api/v1/ping`)).status, 200);
  assert.equal((await fetch(`${base}/api/v1/ping`)).status, 200);
  assert.equal((await fetch(`${base}/api/v1/ping`)).status, 429, 'GLOBAL_RATE_LIMIT=2 still applies to /api/v1');
  assert.equal((await fetch(`${base}/platform/v1/ping`)).status, 200, 'platform stays unaffected by the exhausted per-IP budget');
});
