// server/src/middleware/__tests__/rateLimiter.test.ts — W2-RATE: the sign-in limiter default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authRateLimitMax } from '../rateLimiter';

test('authRateLimitMax defaults to 100 in production and in development', () => {
  assert.equal(authRateLimitMax({ NODE_ENV: 'production' }), 100);
  assert.equal(authRateLimitMax({ NODE_ENV: 'development' }), 100);
  assert.equal(authRateLimitMax({}), 100);
});

test('authRateLimitMax: AUTH_RATE_LIMIT overrides; an invalid or zero value falls back to 100', () => {
  assert.equal(authRateLimitMax({ AUTH_RATE_LIMIT: '20' }), 20);
  assert.equal(authRateLimitMax({ AUTH_RATE_LIMIT: '10000' }), 10000);
  assert.equal(authRateLimitMax({ AUTH_RATE_LIMIT: 'abc' }), 100);
  assert.equal(authRateLimitMax({ AUTH_RATE_LIMIT: '0' }), 100);
});
