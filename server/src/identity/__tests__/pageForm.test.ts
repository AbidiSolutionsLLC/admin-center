// server/src/identity/__tests__/pageForm.test.ts
// Regression (2026-11-25 browser test): an oversized hosted sign-in form answered with the API's raw JSON error.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { pageForm } from '../interactions';

async function post(body: string) {
  const app = express();
  app.post('/interaction/x/login', pageForm('10kb'), (req, res) => { res.json({ email: req.body.email }); });
  const server = http.createServer(app).listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const r = await fetch(`http://127.0.0.1:${port}/interaction/x/login`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
    });
    return { status: r.status, type: r.headers.get('content-type') || '', csp: r.headers.get('content-security-policy') || '', text: await r.text() };
  } finally {
    server.close();
  }
}

test('pageForm: an oversized form gets a hosted 413 page, not JSON', async () => {
  const r = await post(`email=${'a'.repeat(20_000)}`);
  assert.equal(r.status, 413);
  assert.match(r.type, /text\/html/);
  assert.match(r.text, /That form was too large/);
  assert.match(r.csp, /nonce-/);
  assert.doesNotMatch(r.text, /"success"\s*:/);
});

test('pageForm: a normal form still reaches the handler', async () => {
  const r = await post('email=a%40b.test');
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.text).email, 'a@b.test');
});
