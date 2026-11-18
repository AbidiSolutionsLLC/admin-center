// server/src/lib/__tests__/standaloneHealth.test.ts — health component `standalone_portals` and the launcher URL rule (DRD §8.7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalStandalonePortals, PORTAL_FAILURES_TO_DEGRADE } from '../health/evaluate';
import { isAlive } from '../health/standaloneProbe';
import { launchUrlFor } from '../standalonePortals';

const portal = (key: string, failures: number) => ({ key, ok: failures === 0, failures });

test('standalone_portals: healthy with none, healthy when all answer', () => {
  assert.equal(evalStandalonePortals({ portals: [], logoutFailed24h: 0 }).state, 'healthy');
  assert.equal(evalStandalonePortals({ portals: [portal('assets', 0)], logoutFailed24h: 0 }).state, 'healthy');
});

test('standalone_portals: one or two failed checks are not yet degraded; the third in a row is', () => {
  assert.equal(evalStandalonePortals({ portals: [portal('assets', PORTAL_FAILURES_TO_DEGRADE - 1)], logoutFailed24h: 0 }).state, 'healthy');
  const ev = evalStandalonePortals({ portals: [portal('assets', PORTAL_FAILURES_TO_DEGRADE), portal('zyntrus', 0)], logoutFailed24h: 0 });
  assert.equal(ev.state, 'degraded');
  assert.deepEqual((ev.metrics as any).unreachable, ['assets']);
});

test('standalone_portals: never critical, however many portals are down; undelivered logouts degrade', () => {
  const ev = evalStandalonePortals({ portals: [portal('a', 9), portal('b', 9), portal('c', 9)], logoutFailed24h: 5 });
  assert.equal(ev.state, 'degraded');
  const logoutOnly = evalStandalonePortals({ portals: [portal('a', 0)], logoutFailed24h: 2 });
  assert.equal(logoutOnly.state, 'degraded');
  assert.equal((logoutOnly.metrics as any).logout_failed_24h, 2);
});

test('probe: 2xx and 3xx answer, everything else (and no status) does not', () => {
  for (const s of [200, 204, 301, 302, 399]) assert.equal(isAlive(s), true, String(s));
  for (const s of [199, 400, 404, 500, 503, 0]) assert.equal(isAlive(s), false, String(s));
  assert.equal(isAlive(null), false);
});

test('launchUrlFor: tenant override first for per-tenant portals only', () => {
  const fixed = { launch_url: 'https://p.example.com/', hosting: { launch_url: 'https://p.example.com/', per_tenant_launch_url: false } };
  const perTenant = { ...fixed, hosting: { ...fixed.hosting, per_tenant_launch_url: true } };
  assert.equal(launchUrlFor(fixed, 'https://acme.p.example.com/'), 'https://p.example.com/');
  assert.equal(launchUrlFor(perTenant, 'https://acme.p.example.com/'), 'https://acme.p.example.com/');
  assert.equal(launchUrlFor(perTenant, null), 'https://p.example.com/');
  assert.equal(launchUrlFor({ launch_url: '/people' }), '/people');
});
