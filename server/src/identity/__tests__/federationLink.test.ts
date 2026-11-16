// server/src/identity/__tests__/federationLink.test.ts
// Elevation 5.11: safe first-sign-in linking for Microsoft Entra. Written now, run in Phase 7.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
process.env.ALLOW_STANDALONE_MONGO = 'true';

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Identity } from '../../models/Identity.model';
import { User } from '../../models/User.model';
import { AuditEvent } from '../../models/AuditEvent.model';
import { resolveFederatedIdentity } from '../federationLink';

let mongo: MongoMemoryServer;
const companyId = new Types.ObjectId();
const otherCompanyId = new Types.ObjectId();
const connection = { _id: new Types.ObjectId(), company_id: companyId, verified_domains: ['acme.test'] };
const ISS = 'https://login.microsoftonline.com/tid/v2.0';

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'federation_link_test' });
  await Identity.init();
});
after(async () => { await mongoose.disconnect(); await mongo.stop(); });
beforeEach(async () => { await Identity.deleteMany({}); await User.deleteMany({}); await AuditEvent.deleteMany({}); });

async function member(email: string, opts: { status?: 'active' | 'disabled'; company?: Types.ObjectId; state?: 'active' | 'terminated' } = {}) {
  const identity = await Identity.create({ email, full_name: 'M', status: opts.status ?? 'active' });
  await User.create({
    company_id: opts.company ?? companyId, identity_id: identity._id, full_name: 'M', email, password_hash: 'x', role: 'Employee',
    lifecycle_state: opts.state ?? 'active', is_active: true, employment_type: 'full_time', employee_id: `E-${email}`,
  });
  return identity;
}

test('links an existing active member whose e-mail domain is verified, and audits it', async () => {
  const id = await member('ann@acme.test');
  const r = await resolveFederatedIdentity({ connection, issuer: ISS, oid: 'oid-1', email: 'Ann@Acme.test' });
  assert.equal(r.ok && r.linked, true);
  const fresh = await Identity.findById(id._id);
  assert.equal(fresh!.federated_links.length, 1);
  assert.equal(fresh!.federated_links[0].subject, 'oid-1');
  assert.equal(await AuditEvent.countDocuments({ company_id: companyId, action: 'identity.federation_linked' }), 1);
});

test('the second sign-in resolves by the link and does not link again', async () => {
  await member('ann@acme.test');
  await resolveFederatedIdentity({ connection, issuer: ISS, oid: 'oid-1', email: 'ann@acme.test' });
  const r = await resolveFederatedIdentity({ connection, issuer: ISS, oid: 'oid-1', email: 'whatever@else.test' });
  assert.equal(r.ok && r.linked, false);
});

test('a domain that is not verified on the connection is refused', async () => {
  await member('ann@evil.test');
  const r = await resolveFederatedIdentity({ connection, issuer: ISS, oid: 'oid-1', email: 'ann@evil.test' });
  assert.deepEqual(r, { ok: false, reason: 'federation_domain_not_verified' });
});

test('no e-mail claim, or no existing identity, is refused', async () => {
  assert.equal((await resolveFederatedIdentity({ connection, issuer: ISS, oid: 'o', email: undefined })).ok, false);
  assert.deepEqual(await resolveFederatedIdentity({ connection, issuer: ISS, oid: 'o', email: 'nobody@acme.test' }), { ok: false, reason: 'federation_no_link' });
});

test('a disabled identity is refused', async () => {
  await member('ann@acme.test', { status: 'disabled' });
  assert.deepEqual(await resolveFederatedIdentity({ connection, issuer: ISS, oid: 'o', email: 'ann@acme.test' }), { ok: false, reason: 'identity_inactive' });
});

test('a member of another company only is refused (no cross-tenant link)', async () => {
  await member('ann@acme.test', { company: otherCompanyId });
  assert.deepEqual(await resolveFederatedIdentity({ connection, issuer: ISS, oid: 'o', email: 'ann@acme.test' }), { ok: false, reason: 'federation_no_link' });
});

test('a member who is not in an access state is refused', async () => {
  await member('ann@acme.test', { state: 'terminated' });
  assert.equal((await resolveFederatedIdentity({ connection, issuer: ISS, oid: 'o', email: 'ann@acme.test' })).ok, false);
});

test('a second Microsoft account cannot replace the first link for the same connection', async () => {
  await member('ann@acme.test');
  await resolveFederatedIdentity({ connection, issuer: ISS, oid: 'oid-1', email: 'ann@acme.test' });
  assert.deepEqual(await resolveFederatedIdentity({ connection, issuer: ISS, oid: 'oid-2', email: 'ann@acme.test' }), { ok: false, reason: 'federation_conflict' });
});

test('an oid linked through another connection does not resolve here', async () => {
  const id = await member('ann@acme.test');
  await Identity.updateOne({ _id: id._id }, { $push: { federated_links: { connection_id: new Types.ObjectId(), issuer: ISS, subject: 'oid-9', linked_at: new Date() } } });
  assert.deepEqual(await resolveFederatedIdentity({ connection, issuer: ISS, oid: 'oid-9', email: 'ann@acme.test' }), { ok: false, reason: 'federation_no_link' });
});
