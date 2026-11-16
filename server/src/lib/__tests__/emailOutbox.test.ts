// Plan 0.6: e-mail outbox. In-memory MongoDB; delivery is a real nodemailer send to a closed port (failure) or the
// JSON transport (success), so no network is used.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { EmailDelivery } from '../../models/EmailDelivery.model';
import { decrypt } from '../cryptoService';

type Svc = typeof import('../emailService');
type Sender = typeof import('../emailSender');

const saved = { ...process.env };
let mongo: MongoMemoryServer;

/** Fresh copies of both modules: emailService caches its transporter and reads its mode from env per call. */
function load(env: Record<string, string | undefined>): { svc: Svc; sender: Sender } {
  for (const k of ['MOCK_EMAIL', 'SMTP_HOST', 'SMTP_PORT', 'AZURE_COMMUNICATION_CONNECTION_STRING', 'SENDER_EMAIL_ADDRESS']) delete process.env[k];
  Object.assign(process.env, { NODE_ENV: 'development' }, env);
  for (const m of ['../emailService', '../emailSender']) delete require.cache[require.resolve(m)];
  /* eslint-disable @typescript-eslint/no-require-imports */
  return { svc: require('../emailService'), sender: require('../emailSender') };
}

const CLOSED_PORT = { SMTP_HOST: '127.0.0.1', SMTP_PORT: '1' };

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'email_outbox' });
  await EmailDelivery.init();
});
after(async () => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => { await EmailDelivery.deleteMany({}); });
afterEach(() => { for (const m of ['../emailService', '../emailSender']) delete require.cache[require.resolve(m)]; });

const msg = {
  to: 'person@example.test',
  subject: 'Hello',
  html: '<p>secret-token-123</p>',
  text: 'secret-token-123',
  meta: { template: 'welcome', related: { type: 'user' as const, id: 'u1' } },
};

test('queue mode: sendEmail only inserts a queued row, with the bodies encrypted', async () => {
  const { svc } = load(CLOSED_PORT);
  const id = await svc.sendEmail(msg);
  const row = await EmailDelivery.findById(id);
  assert.equal(row?.status, 'queued');
  assert.equal(row?.template, 'welcome');
  assert.deepEqual({ type: row?.related?.type, id: row?.related?.id }, { type: 'user', id: 'u1' });
  assert.ok(row?.html_enc && !row.html_enc.includes('secret-token-123'), 'body is not stored in clear');
  assert.equal(decrypt(row!.html_enc!), msg.html);
});

test('inline mode (mock mail): delivers in the call, marks the row sent and clears the bodies', async () => {
  const { svc } = load({ MOCK_EMAIL: 'true' });
  const id = await svc.sendEmail(msg);
  const row = await EmailDelivery.findById(id);
  assert.equal(row?.status, 'sent');
  assert.ok(row?.sent_at);
  assert.equal(row?.html_enc, undefined);
  assert.equal(row?.text_enc, undefined);
});

test('direct mode: a delivery failure marks the row failed and still throws, as before the outbox', async () => {
  const { svc } = load(CLOSED_PORT);
  await assert.rejects(() => svc.sendEmail({ ...msg, meta: { ...msg.meta, direct: true } }));
  const row = await EmailDelivery.findOne({});
  assert.equal(row?.status, 'failed');
  assert.ok(row?.last_error);
  assert.equal(row?.html_enc, undefined);
});

test('an invalid address is recorded as failed and does not throw', async () => {
  const { svc } = load({ MOCK_EMAIL: 'true' });
  const id = await svc.sendEmail({ ...msg, to: 'not-an-address' });
  const row = await EmailDelivery.findById(id);
  assert.equal(row?.status, 'failed');
  assert.match(row?.last_error || '', /^INVALID_ADDRESS/);
});

test('claims are exclusive: five concurrent senders claim one queued row exactly once', async () => {
  const { svc, sender } = load(CLOSED_PORT);
  await svc.sendEmail(msg);
  const claims = await Promise.all(Array.from({ length: 5 }, () => sender.claimOne()));
  const won = claims.filter(Boolean);
  assert.equal(won.length, 1);
  assert.equal(won[0]?.status, 'sending');
  assert.equal(won[0]?.attempts, 1);
});

test('retry schedule 1, 5, 30, 120 minutes, then failed with the bodies cleared', async () => {
  const { svc, sender } = load(CLOSED_PORT);
  const id = await svc.sendEmail(msg);
  for (const minutes of sender.RETRY_DELAYS_MIN) {
    const claimed = await sender.claimOne();
    assert.ok(claimed);
    const t0 = Date.now();
    await sender.sendClaimed(claimed!);
    const row = await EmailDelivery.findById(id);
    assert.equal(row?.status, 'queued');
    assert.ok(row?.last_error);
    const waitedMin = (row!.next_attempt_at.getTime() - t0) / 60_000;
    assert.ok(Math.abs(waitedMin - minutes) < 0.5, `attempt ${claimed!.attempts} waits ${minutes} min, got ${waitedMin}`);
    assert.ok(row?.html_enc, 'bodies are kept while retries remain');
    await EmailDelivery.updateOne({ _id: id }, { $set: { next_attempt_at: new Date(0) } });
  }
  const last = await sender.claimOne();
  await sender.sendClaimed(last!);
  const row = await EmailDelivery.findById(id);
  assert.equal(row?.status, 'failed');
  assert.equal(row?.attempts, 5);
  assert.equal(row?.html_enc, undefined);
  assert.equal(row?.text_enc, undefined);
  assert.ok(row?.last_error);
});

test('a successful send marks the row sent, clears the bodies and the last error', async () => {
  const { svc } = load(CLOSED_PORT);
  const id = await svc.sendEmail(msg); // queued while the transport is a closed port
  await EmailDelivery.updateOne({ _id: id }, { $set: { last_error: 'ECONNREFUSED: earlier try' } });
  const { sender } = load({ MOCK_EMAIL: 'true' }); // the sender now has a working (JSON) transport
  const claimed = await sender.claimOne();
  await sender.sendClaimed(claimed!);
  const row = await EmailDelivery.findById(id);
  assert.equal(row?.status, 'sent');
  assert.ok(row?.sent_at);
  assert.equal(row?.html_enc, undefined);
  assert.equal(row?.last_error, undefined);
});

test('rows stuck in sending past locked_until are put back in the queue', async () => {
  const { svc, sender } = load(CLOSED_PORT);
  const id = await svc.sendEmail(msg);
  await sender.claimOne();
  assert.equal(await sender.reclaimStuck(), 0, 'a live claim is left alone');
  await EmailDelivery.updateOne({ _id: id }, { $set: { locked_until: new Date(Date.now() - 1000) } });
  assert.equal(await sender.reclaimStuck(), 1);
  assert.equal((await EmailDelivery.findById(id))?.status, 'queued');
});
