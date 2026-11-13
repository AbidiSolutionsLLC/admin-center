// server/src/identity/__tests__/enrol-ui.test.ts
// Unit tests for the hosted-login presentation helpers: TOTP enrolment QR code, setup-key formatting, page shell.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
process.env.OIDC_COOKIE_KEYS = process.env.OIDC_COOKIE_KEYS || crypto.randomBytes(32).toString('base64url');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSecret, generateURI } from 'otplib';
import { formatSetupKey, totpQrDataUri } from '../interactions';
import { pageShell } from '../html';

test('formatSetupKey groups the secret into 4-character blocks', () => {
  assert.equal(formatSetupKey('ABCDEFGHJKLMNPQR'), 'ABCD EFGH JKLM NPQR');
  assert.equal(formatSetupKey('ABCDEFGHJK'), 'ABCD EFGH JK');
  assert.equal(formatSetupKey('AB CD'), 'ABCD');
  assert.equal(formatSetupKey(''), '');
});

test('totpQrDataUri renders a local 200x200 PNG data URI for the otpauth URI', async () => {
  const uri = generateURI({ issuer: 'Karbexa', label: 'someone@example.com', secret: generateSecret() });
  const dataUri = await totpQrDataUri(uri);
  const prefix = 'data:image/png;base64,';
  assert.ok(dataUri.startsWith(prefix));
  const png = Buffer.from(dataUri.slice(prefix.length), 'base64');
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  // IHDR: width/height are big-endian uint32 at bytes 16 and 20.
  assert.equal(png.readUInt32BE(16), 200);
  assert.equal(png.readUInt32BE(20), 200);
});

test('pageShell includes the brand header and a nonce-bound copy script', () => {
  const html = pageShell('n0nce', 'Sign in', '<h1>x</h1>');
  assert.match(html, /<header class="brand">/);
  assert.match(html, /<style nonce="n0nce">/);
  assert.match(html, /<script nonce="n0nce">/);
  assert.match(html, /button\[data-copy\]/);
});
