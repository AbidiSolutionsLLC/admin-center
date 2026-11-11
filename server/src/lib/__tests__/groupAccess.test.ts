// L3-2 (H1): inactive static groups grant nothing; group-target resolution is company scoped. Uses an in-memory Mongo (no transactions needed).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo: MongoMemoryServer;
const companyA = new Types.ObjectId();
const companyB = new Types.ObjectId();
const userA = new Types.ObjectId();
const appId = new Types.ObjectId();
const staticGroup = new Types.ObjectId();
const dynamicGroup = new Types.ObjectId();
const foreignGroup = new Types.ObjectId();

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'group_access_test' });
  await import('../../models');
  const db = mongoose.connection.db!;
  await db.collection('companies').insertMany([{ _id: companyA, status: 'active' }, { _id: companyB, status: 'active' }]);
  await db.collection('users').insertOne({ _id: userA, company_id: companyA, email: 'a@a.test', lifecycle_state: 'active', is_active: true, authz_ver: 1, department_id: null });
  await db.collection('apps').insertOne({ _id: appId, app_type: 'karbexa_product', product_key: 'sign', default_role_key: 'sign_user', name: 'Sign', slug: 'karbexa-sign' });
  await db.collection('productroles').insertMany([
    { product_key: 'sign', key: 'sign_user', name: 'Sign User', rank: 10, is_default: true, assignable: true },
    { product_key: 'sign', key: 'sign_administrator', name: 'Sign Administrator', rank: 20, assignable: true },
  ]);
  await db.collection('organizationentitlements').insertOne({ company_id: companyA, product_key: 'sign', status: 'active' });
  await db.collection('groups').insertMany([
    { _id: staticGroup, company_id: companyA, name: 's', type: 'static', is_active: true },
    { _id: dynamicGroup, company_id: companyA, name: 'd', type: 'dynamic', is_active: true, dynamic_rules: { lifecycle_state: 'active' } },
    { _id: foreignGroup, company_id: companyB, name: 'f', type: 'static', is_active: true },
  ]);
  await db.collection('groupmembers').insertMany([
    { group_id: staticGroup, user_id: userA },
    { group_id: foreignGroup, user_id: userA }, // membership row pointing at another tenant's group must never grant
  ]);
  await db.collection('appassignments').insertMany([
    { company_id: companyA, app_id: appId, is_active: true, target_type: 'group', target_id: staticGroup, product_role_key: 'sign_administrator' },
  ]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test('static group grant counts while the group is active', async () => {
  const { computeEffectiveAccess } = await import('../effectiveAccess');
  const acc = await computeEffectiveAccess(companyA, userA);
  assert.equal(acc.products.sign?.role, 'sign_administrator');
});

test('deactivating a static group removes its grant (effective access)', async () => {
  const { computeEffectiveAccess } = await import('../effectiveAccess');
  await mongoose.connection.db!.collection('groups').updateOne({ _id: staticGroup }, { $set: { is_active: false } });
  const acc = await computeEffectiveAccess(companyA, userA);
  assert.equal(acc.products.sign, undefined);
  assert.equal(acc.denials.sign, 'NO_ASSIGNMENT');
});

test('resolveAssignmentMemberIds: inactive or foreign group resolves to no members; active resolves to its members', async () => {
  const { resolveAssignmentMemberIds } = await import('../effectiveAccess');
  const base = { company_id: companyA, target_type: 'group' as const, include_descendants: true };
  assert.deepEqual(await resolveAssignmentMemberIds({ ...base, target_id: staticGroup } as never), []);
  await mongoose.connection.db!.collection('groups').updateOne({ _id: staticGroup }, { $set: { is_active: true } });
  assert.deepEqual((await resolveAssignmentMemberIds({ ...base, target_id: staticGroup } as never)).map(String), [String(userA)]);
  assert.deepEqual(await resolveAssignmentMemberIds({ ...base, target_id: foreignGroup } as never), []);
});

test('resolveAssignmentMemberIds: dynamic group resolves rule-matched members of the same company only', async () => {
  const { resolveAssignmentMemberIds } = await import('../effectiveAccess');
  const ids = await resolveAssignmentMemberIds({ company_id: companyA, target_type: 'group', target_id: dynamicGroup, include_descendants: true } as never);
  assert.deepEqual(ids.map(String), [String(userA)]);
  await mongoose.connection.db!.collection('groups').updateOne({ _id: dynamicGroup }, { $set: { is_active: false } });
  assert.deepEqual(await resolveAssignmentMemberIds({ company_id: companyA, target_type: 'group', target_id: dynamicGroup, include_descendants: true } as never), []);
});

test('a membership row for another tenant\'s group never grants access', async () => {
  const { computeEffectiveAccess } = await import('../effectiveAccess');
  await mongoose.connection.db!.collection('groups').updateOne({ _id: staticGroup }, { $set: { is_active: false } });
  await mongoose.connection.db!.collection('appassignments').insertOne({ company_id: companyA, app_id: appId, is_active: true, target_type: 'group', target_id: foreignGroup, product_role_key: 'sign_administrator' });
  const acc = await computeEffectiveAccess(companyA, userA);
  assert.equal(acc.products.sign, undefined);
});
