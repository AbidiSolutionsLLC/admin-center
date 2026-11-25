// server/src/middleware/__tests__/errorHandlerBody.test.ts
// Regression (2026-11-25 browser test): an oversized sign-in form answered 500 INTERNAL_ERROR; it is a 413.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { errorHandler } from '../errorHandler';

async function post(body: string, type: string) {
  const app = express();
  app.post('/x', express.urlencoded({ extended: false, limit: '10kb' }), express.json({ limit: '10kb' }), (_req, res) => { res.json({ ok: true }); });
  app.use(errorHandler);
  const server = http.createServer(app).listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const r = await fetch(`http://127.0.0.1:${port}/x`, { method: 'POST', headers: { 'content-type': type }, body });
    return { status: r.status, json: await r.json() as any };
  } finally {
    server.close();
  }
}

test('errorHandler: an oversized form body is 413 PAYLOAD_TOO_LARGE, not 500', async () => {
  const r = await post(`email=${'a'.repeat(20_000)}`, 'application/x-www-form-urlencoded');
  assert.equal(r.status, 413);
  assert.equal(r.json.code, 'PAYLOAD_TOO_LARGE');
});

test('errorHandler: malformed JSON is 400 BAD_REQUEST; a normal body still passes', async () => {
  const bad = await post('{"a":', 'application/json');
  assert.equal(bad.status, 400);
  assert.equal(bad.json.code, 'BAD_REQUEST');
  const ok = await post('email=a%40b.test', 'application/x-www-form-urlencoded');
  assert.equal(ok.status, 200);
});
