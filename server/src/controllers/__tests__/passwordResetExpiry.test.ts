// server/src/controllers/__tests__/passwordResetExpiry.test.ts
// Regression (2026-11-25 browser test): reset links lived 1 hour; 03-IDENTITY-AND-TOKEN-SPEC §4.4 says 30 minutes.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
process.env.MOCK_EMAIL = 'true';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://admin.test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { requestPasswordReset } from '../auth.controller';
import { User } from '../../models/User.model';
import { Identity } from '../../models/Identity.model';
import { Company } from '../../models/Company.model';
import { PasswordResetToken } from '../../models';

let mongo: MongoMemoryServer;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'reset_expiry_test' });
});
after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test('a password reset link expires 30 minutes after it is requested', async () => {
  const email = `r${Date.now()}@reset.test`;
  const identity = await Identity.create({ email, full_name: 'Reset Test' });
  const company = await Company.create({ name: 'Reset Co', slug: `reset-${Date.now()}` });
  const user = await User.create({ company_id: company._id as Types.ObjectId, email, full_name: 'Reset Test', identity_id: identity._id, password_hash: 'x' });

  let status = 0;
  const res: any = { status(s: number) { status = s; return this; }, json() { return this; } };
  const before = Date.now();
  await new Promise<void>((resolve, reject) => {
    const r = requestPasswordReset({ body: { email }, ip: '10.0.0.1', headers: { 'user-agent': 'test' } } as any, res, (e?: unknown) => (e ? reject(e) : resolve()));
    Promise.resolve(r).then(() => resolve(), reject);
  });
  assert.equal(status, 200);

  const token = await PasswordResetToken.findOne({ user_id: user._id }).lean();
  assert.ok(token, 'a reset token is stored');
  const lifetimeMin = (new Date(token!.expires_at).getTime() - before) / 60_000;
  assert.ok(lifetimeMin > 29.9 && lifetimeMin <= 30.1, `lifetime ${lifetimeMin.toFixed(2)} min`);
});
