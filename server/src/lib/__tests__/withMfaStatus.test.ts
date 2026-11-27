// server/src/lib/__tests__/withMfaStatus.test.ts
// Regression (code audit 2026-11-27): the member profile MFA badge read the legacy User.mfa_enabled, which sign-in never
// sets, so a member who enrolled an authenticator showed "not enrolled". GET /people/:id now reads it from the Identity.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { withMfaStatus } from '../mfaStatus';
import { Identity } from '../../models/Identity.model';

let mongo: MongoMemoryServer;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'mfa_status_test' });
});
after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test('mfa_enabled follows the identity, not the legacy user field', async () => {
  const enrolled = await Identity.create({ email: `m${Date.now()}@mfa.test`, full_name: 'M', mfa: { totp_enabled: true } });
  const none = await Identity.create({ email: `n${Date.now()}@mfa.test`, full_name: 'N', mfa: { totp_enabled: false } });
  const a = await withMfaStatus({ _id: new Types.ObjectId(), identity_id: enrolled._id, mfa_enabled: false } as any);
  const b = await withMfaStatus({ _id: new Types.ObjectId(), identity_id: none._id, mfa_enabled: true } as any);
  const c = await withMfaStatus({ _id: new Types.ObjectId() });
  assert.equal(a.mfa_enabled, true);
  assert.equal(b.mfa_enabled, false);
  assert.equal(c.mfa_enabled, false);
});
