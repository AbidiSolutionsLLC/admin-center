// M2: TRUST_PROXY resolution (no database). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustProxy } from '../trustProxy';

const env = (o: Record<string, string | undefined>) => o as NodeJS.ProcessEnv;

test('production: unset or blank TRUST_PROXY throws', () => {
  assert.throws(() => resolveTrustProxy(env({ NODE_ENV: 'production' })), /TRUST_PROXY must be set explicitly/);
  assert.throws(() => resolveTrustProxy(env({ NODE_ENV: 'production', TRUST_PROXY: '  ' })), /TRUST_PROXY must be set explicitly/);
});

test('production: explicit hop count, false, 0 and CIDR lists are accepted', () => {
  assert.equal(resolveTrustProxy(env({ NODE_ENV: 'production', TRUST_PROXY: '2' })), 2);
  assert.equal(resolveTrustProxy(env({ NODE_ENV: 'production', TRUST_PROXY: 'false' })), false);
  assert.equal(resolveTrustProxy(env({ NODE_ENV: 'production', TRUST_PROXY: '0' })), 0);
  assert.equal(resolveTrustProxy(env({ NODE_ENV: 'production', TRUST_PROXY: '10.0.0.0/8, 192.0.2.7' })), '10.0.0.0/8,192.0.2.7');
  assert.equal(resolveTrustProxy(env({ NODE_ENV: 'production', TRUST_PROXY: 'loopback' })), 'loopback');
});

test('production: TRUST_PROXY=true (trust every hop) is rejected', () => {
  assert.throws(() => resolveTrustProxy(env({ NODE_ENV: 'production', TRUST_PROXY: 'true' })), /not allowed in production/);
});

test('development: unset keeps the 1-hop default and true is allowed', () => {
  assert.equal(resolveTrustProxy(env({ NODE_ENV: 'development' })), 1);
  assert.equal(resolveTrustProxy(env({})), 1);
  assert.equal(resolveTrustProxy(env({ NODE_ENV: 'development', TRUST_PROXY: 'true' })), true);
});

test('garbage values throw in every environment', () => {
  assert.throws(() => resolveTrustProxy(env({ NODE_ENV: 'development', TRUST_PROXY: 'not-an-ip' })), /hop count/);
  assert.throws(() => resolveTrustProxy(env({ NODE_ENV: 'production', TRUST_PROXY: '10.0.0.0/8,oops' })), /hop count/);
});
