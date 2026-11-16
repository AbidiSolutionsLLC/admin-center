// Plan 0.7d: password-reset links never fall back to localhost; an unset origin fails loudly.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
process.env.OIDC_COOKIE_KEYS = process.env.OIDC_COOKIE_KEYS || crypto.randomBytes(32).toString('base64url');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSpaOrigin } from '../auth.controller';

test('ADMIN_SPA_ORIGIN wins, then CLIENT_URL; a trailing slash is dropped', () => {
  assert.equal(resolveSpaOrigin({ ADMIN_SPA_ORIGIN: 'https://admin.example.test/', CLIENT_URL: 'https://other.test' }), 'https://admin.example.test');
  assert.equal(resolveSpaOrigin({ CLIENT_URL: 'https://client.example.test' }), 'https://client.example.test');
});

test('with neither origin set it throws instead of using localhost', () => {
  assert.throws(() => resolveSpaOrigin({}), /ADMIN_SPA_ORIGIN or CLIENT_URL must be set/);
});
