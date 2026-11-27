// server/src/lib/__tests__/emailFailClosed.test.ts
// Go-live blocker G3 (code audit 2026-11-27): with neither Azure nor SMTP configured, production silently used an
// ethereal.email test mailbox, so mail looked sent and never arrived. Production now refuses; development keeps it.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransporter } from '../emailService';

async function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { await fn(); } finally {
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

test('production without Azure or SMTP refuses to create a transport', async () => {
  await withEnv({ NODE_ENV: 'production', SMTP_HOST: undefined, MOCK_EMAIL: 'true' }, async () => {
    await assert.rejects(createTransporter(), /No e-mail service configured/);
  });
});

test('production with SMTP_HOST gets an SMTP transport', async () => {
  await withEnv({ NODE_ENV: 'production', SMTP_HOST: '127.0.0.1', SMTP_PORT: '2525' }, async () => {
    const t = await createTransporter();
    assert.equal((t as any).options.host, '127.0.0.1');
  });
});

test('outside production MOCK_EMAIL still gives the in-process JSON transport', async () => {
  await withEnv({ NODE_ENV: 'development', MOCK_EMAIL: 'true', SMTP_HOST: undefined }, async () => {
    const t = await createTransporter();
    assert.equal((t as any).options.jsonTransport, true);
  });
});
