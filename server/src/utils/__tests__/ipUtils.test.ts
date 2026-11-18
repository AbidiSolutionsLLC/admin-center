// server/src/utils/__tests__/ipUtils.test.ts — proxy-appended ports (Azure App Service sends `ip:port` in X-Forwarded-For). No database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripPort, isIpInRange } from '../ipUtils';
import { ipKey } from '../../middleware/rateLimiter';

test('stripPort removes the port of an IPv4 or bracketed IPv6 address and leaves everything else alone', () => {
  assert.equal(stripPort('203.0.113.7:51234'), '203.0.113.7');
  assert.equal(stripPort('203.0.113.7'), '203.0.113.7');
  assert.equal(stripPort('[2001:db8::1]:443'), '2001:db8::1');
  assert.equal(stripPort('[2001:db8::1]'), '2001:db8::1');
  assert.equal(stripPort('2001:db8::1'), '2001:db8::1'); // bare IPv6: the colons are not a port
  assert.equal(stripPort('::1'), '::1');
  assert.equal(stripPort('::ffff:203.0.113.7'), '::ffff:203.0.113.7');
  assert.equal(stripPort(''), '');
});

test('isIpInRange compares the address, not the port', () => {
  assert.equal(isIpInRange('203.0.113.7:51234', '203.0.113.7'), true);
  assert.equal(isIpInRange('203.0.113.7:51234', '203.0.113.0/24'), true);
  assert.equal(isIpInRange('203.0.113.7:51234', '198.51.100.0/24'), false);
  assert.equal(isIpInRange('[2001:db8::1]:443', '2001:db8::/32'), true);
  assert.equal(isIpInRange('198.51.100.9:80', '203.0.113.0/24'), false);
  assert.equal(isIpInRange('', '203.0.113.0/24'), false);
});

test('isIpInRange without a port is unchanged', () => {
  assert.equal(isIpInRange('203.0.113.7', '203.0.113.0/24'), true);
  assert.equal(isIpInRange('::1', '127.0.0.1'), true);
  assert.equal(isIpInRange('::ffff:203.0.113.7', '203.0.113.0/24'), true);
});

test('ipKey: one client, one rate-limit key whatever source port the proxy reports', () => {
  const k = (ip: string) => ipKey({ ip } as never);
  assert.equal(k('203.0.113.7:51234'), k('203.0.113.7:60000'));
  assert.equal(k('203.0.113.7:51234'), k('203.0.113.7'));
  assert.notEqual(k('203.0.113.7:51234'), k('203.0.113.8:51234'));
});
