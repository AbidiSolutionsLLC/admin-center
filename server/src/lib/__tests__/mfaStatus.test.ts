// MFA is enrolled on the Identity at the hosted sign-in page; the legacy User.mfa_enabled flag is never set by sign-in.
// Regression (Zyntrus walk 2026-11-25): an admin who had set up an authenticator app was reported as "MFA disabled".
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { usersWithMfa } from '../mfaStatus';
import { runIntelligenceRules } from '../intelligence';
import { Identity } from '../../models/Identity.model';
import { User } from '../../models/User.model';
import { Insight } from '../../models/Insight.model';
import { Company } from '../../models/Company.model';

let mongo: MongoMemoryServer;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'mfa_status' });
});
after(async () => { await mongoose.disconnect(); await mongo.stop(); });

const identity = (email: string, mfa: Record<string, unknown>) =>
  Identity.collection.insertOne({ email, status: 'active', mfa: { recovery_codes_hash: [], email_otp_enabled: false, totp_enabled: false, ...mfa } });

test('usersWithMfa: authenticator app or e-mail code on the Identity counts; no identity or no factor does not', async () => {
  const totp = await identity('t@x.test', { totp_enabled: true, totp_secret_enc: 'x' });
  const email = await identity('e@x.test', { email_otp_enabled: true });
  const none = await identity('n@x.test', {});
  const users = [
    { _id: new Types.ObjectId(), identity_id: totp.insertedId },
    { _id: new Types.ObjectId(), identity_id: email.insertedId },
    { _id: new Types.ObjectId(), identity_id: none.insertedId },
    { _id: new Types.ObjectId() },
  ];
  const got = await usersWithMfa(users);
  assert.deepEqual([...got].sort(), [String(users[0]._id), String(users[1]._id)].sort());
  assert.equal((await usersWithMfa([])).size, 0);
});

test('health scan: "has MFA disabled" is raised only for the admin whose Identity has no second factor', async () => {
  const companyId = new Types.ObjectId();
  await Company.collection.insertOne({ _id: companyId, name: 'Acme', slug: `acme-${companyId}`, status: 'active', is_active: true });
  const enrolled = await identity('zara@x.test', { totp_enabled: true, totp_secret_enc: 'x' });
  const notEnrolled = await identity('omar@x.test', {});
  const admin = (email: string, full_name: string, identity_id: Types.ObjectId) => User.collection.insertOne({
    company_id: companyId, email, full_name, employee_id: email, identity_id, role: 'Super Admin',
    lifecycle_state: 'active', is_active: true, mfa_enabled: false,
  });
  await admin('zara@x.test', 'Zara Enrolled', enrolled.insertedId);
  await admin('omar@x.test', 'Omar Missing', notEnrolled.insertedId);
  await runIntelligenceRules(companyId);
  const titles = (await Insight.find({ company_id: companyId, title: /has MFA disabled/ }).lean()).map((i) => i.title);
  assert.deepEqual(titles, ['Omar Missing (admin) has MFA disabled']);
});
