// server/src/controllers/__tests__/lockoutReset.test.ts
// Regression (2026-11-25 browser test ID2-2): failures were counted over the last 30 min regardless of a successful
// sign-in or an admin unlock, so one typo after an unlock locked the account again.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { recordPasswordFailure, recordLockedAttempt } from '../auth.controller';
import { User } from '../../models/User.model';
import { Identity } from '../../models/Identity.model';
import { Company } from '../../models/Company.model';

let mongo: MongoMemoryServer;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'lockout_reset_test' });
});
after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const req: any = { ip: '10.0.0.1', headers: { 'user-agent': 'test' } };

async function member() {
  const email = `l${Date.now()}${Math.random().toString(16).slice(2, 6)}@lock.test`;
  const identity = await Identity.create({ email, full_name: 'Lock Test' });
  const company = await Company.create({ name: 'Lock Co', slug: `lock-${Date.now()}-${Math.random().toString(16).slice(2, 6)}` });
  const user = await User.create({ company_id: company._id as Types.ObjectId, email, full_name: 'Lock Test', identity_id: identity._id, password_hash: 'x' });
  return { user, identity };
}
const fail = async (m: { user: any; identity: any }) => {
  const user = await User.findById(m.user._id);
  await recordPasswordFailure(req, user!, m.identity);
};
const locked = async (id: unknown) => !!(await User.findById(id).lean())?.locked_until;

test('five failures lock (default policy), an unlock resets the count', async () => {
  const m = await member();
  for (let i = 0; i < 4; i += 1) await fail(m);
  assert.equal(await locked(m.user._id), false);
  await fail(m);
  assert.equal(await locked(m.user._id), true);

  // Admin unlock (people.controller unlockUser does the same two writes)
  await User.updateOne({ _id: m.user._id }, { $unset: { locked_until: 1 }, $set: { login_failures_reset_at: new Date() } });
  await new Promise((r) => setTimeout(r, 5));
  await fail(m);
  assert.equal(await locked(m.user._id), false, 'one typo after an unlock must not re-lock');
});

test('attempts refused while locked do not count towards the next lock', async () => {
  const m = await member();
  for (let i = 0; i < 6; i += 1) await recordLockedAttempt(req, m.user, m.identity.email);
  await fail(m);
  assert.equal(await locked(m.user._id), false);
});
