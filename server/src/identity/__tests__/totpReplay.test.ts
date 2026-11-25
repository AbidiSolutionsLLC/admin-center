// server/src/identity/__tests__/totpReplay.test.ts
// Regression (2026-11-25 browser test): a sign-in code was accepted twice inside its 30 s window. A code is now
// accepted once per account: claimTotpStep records the accepted RFC 6238 step with one conditional write.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generateSecret, generate } from 'otplib';
import { totpStep, claimTotpStep } from '../interactions';
import { Identity } from '../../models/Identity.model';
import { OperatorAccount } from '../../models/OperatorAccount.model';

let mongo: MongoMemoryServer;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'totp_replay_test' });
});
after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test('totpStep: a valid code yields its time step, a wrong or malformed code yields null', async () => {
  const secret = generateSecret();
  const code = await generate({ secret });
  const step = await totpStep(secret, code);
  assert.equal(typeof step, 'number');
  assert.equal(step, Math.floor(Date.now() / 30000));
  assert.equal(await totpStep(secret, code === '000000' ? '111111' : '000000'), null);
  assert.equal(await totpStep(secret, '12345'), null);
});

test('claimTotpStep: the same step is accepted once per member; a later step is accepted again', async () => {
  const idn = await Identity.create({ email: `r${Date.now()}@replay.test`, full_name: 'Replay', mfa: { totp_enabled: true } });
  const field = 'mfa.totp_last_step';
  assert.equal(await claimTotpStep(Identity, idn._id, field, 100), true);
  assert.equal(await claimTotpStep(Identity, idn._id, field, 100), false, 'replay of the same code');
  assert.equal(await claimTotpStep(Identity, idn._id, field, 99), false, 'an older code after a newer one');
  assert.equal(await claimTotpStep(Identity, idn._id, field, 101), true);
  const stored = await Identity.findById(idn._id).lean();
  assert.equal((stored as any).mfa.totp_last_step, 101);
});

test('claimTotpStep: two parallel submissions of one code cannot both win', async () => {
  const idn = await Identity.create({ email: `p${Date.now()}@replay.test`, full_name: 'Parallel', mfa: { totp_enabled: true } });
  const results = await Promise.all([1, 2, 3].map(() => claimTotpStep(Identity, idn._id, 'mfa.totp_last_step', 500)));
  assert.equal(results.filter(Boolean).length, 1);
});

test('claimTotpStep: operator accounts keep their own step', async () => {
  const op = await OperatorAccount.create({ email: `o${Date.now()}@replay.test`, full_name: 'Op', password_hash: 'x', mfa: { enabled: true, last_step: 10 } });
  assert.equal(await claimTotpStep(OperatorAccount, op._id, 'mfa.last_step', 10), false);
  assert.equal(await claimTotpStep(OperatorAccount, op._id, 'mfa.last_step', 11), true);
});
