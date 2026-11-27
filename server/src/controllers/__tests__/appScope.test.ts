// server/src/controllers/__tests__/appScope.test.ts
// Regression (tenant-scope review 2026-11-27): a tenant IT admin could change or delete a global app (no company_id:
// the Karbexa products), which every organisation shares; owner_id and location targets were not checked against the org.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
process.env.OIDC_COOKIE_KEYS = process.env.OIDC_COOKIE_KEYS || crypto.randomBytes(32).toString('base64url');
process.env.ALLOW_STANDALONE_MONGO = 'true';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as jose from 'jose';
import http from 'http';
import { AddressInfo } from 'net';

import { createServer } from '../../app';
import { Identity } from '../../models/Identity.model';
import { User, IUser } from '../../models/User.model';
import { Company } from '../../models/Company.model';
import { Role } from '../../models/Role.model';
import { UserRole } from '../../models/UserRole.model';
import { Session } from '../../models/Session.model';
import { Location } from '../../models/Location.model';
import { App } from '../../models/App.model';
import { loadRealmKeys } from '../../identity/keys';
import { getIdentityConfig } from '../../identity/config';

let mongo: MongoMemoryServer;
let server: http.Server;
let baseUrl: string;

const companyA = new Types.ObjectId();
const companyB = new Types.ObjectId();
let adminA: IUser;
let adminB: IUser;
const ids: Record<string, Types.ObjectId> = {};

async function makeAdmin(company: Types.ObjectId, email: string): Promise<IUser> {
  const role = await Role.create({ company_id: company, name: 'Super Admin', type: 'system', description: 'Super Admin' });
  const idn = await Identity.create({ email, full_name: email, password_hash: 'x', email_verified_at: new Date(), status: 'active' });
  const user = await User.create({
    company_id: company, identity_id: idn._id, email, full_name: email, password_hash: 'legacy-unused',
    role: 'Super Admin' as any, lifecycle_state: 'active', is_active: true,
  });
  await UserRole.create({ user_id: user._id, role_id: role._id, company_id: company, assigned_by: user._id });
  return user;
}

async function tokenFor(user: IUser): Promise<string> {
  const sid = `sid_${crypto.randomBytes(8).toString('hex')}`;
  await Session.create({
    _id: sid, identity_id: user.identity_id, member_id: user._id, company_id: user.company_id, realm: 'tenant',
    created_at: new Date(), last_seen_at: new Date(),
    idle_expires_at: new Date(Date.now() + 3600e3), absolute_expires_at: new Date(Date.now() + 3600e3),
    amr: ['pwd', 'otp'], user_agent: 'TestBrowser/1.0', ip: '127.0.0.1',
  });
  const keys = await loadRealmKeys('tenant');
  const jwk = keys.privateJwks.keys[0];
  const key = await jose.importJWK(jwk, 'RS256');
  return new jose.SignJWT({ token_use: 'access', org: String(user.company_id), sid, email: user.email })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid, typ: 'at+jwt' })
    .setIssuer(getIdentityConfig().tenantIssuer).setAudience('urn:karbexa:admin')
    .setSubject(String(user._id)).setIssuedAt().setExpirationTime('10m').sign(key);
}

async function call(method: string, path: string, user: IUser, body?: unknown) {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${await tokenFor(user)}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.status;
}

async function getJson(path: string, user: IUser): Promise<any> {
  const res = await fetch(`${baseUrl}/api/v1${path}`, { headers: { Authorization: `Bearer ${await tokenFor(user)}` } });
  return res.json();
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'app_scope_test' });
  const app = await createServer();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await Company.insertMany([
    { _id: companyA, name: 'Company A', slug: 'company-a', status: 'active', is_active: true },
    { _id: companyB, name: 'Company B', slug: 'company-b', status: 'active', is_active: true },
  ]);
  adminA = await makeAdmin(companyA, 'admin@org-a.test');
  adminB = await makeAdmin(companyB, 'admin@org-b.test');

  ids.global = (await App.create({ name: 'Shared App', slug: 'shared-app', category: 'Karbexa', is_system_app: true, is_active: true, status: 'active' }))._id;
  ids.appA = (await App.create({ company_id: companyA, name: 'A Tool', slug: 'a-tool', category: 'utilities', is_active: true, status: 'active' }))._id;
  ids.locB = (await Location.create({ company_id: companyB, name: 'Office B', type: 'office', timezone: 'UTC' }))._id;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.disconnect();
  await mongo.stop();
});

test('a tenant cannot disable, rename or delete a global app shared by every organisation', async () => {
  assert.equal(await call('PUT', `/apps/${ids.global}`, adminA, { is_active: false, status: 'inactive' }), 403);
  assert.equal(await call('PUT', `/apps/${ids.global}`, adminA, { name: 'Renamed' }), 403);
  assert.equal(await call('DELETE', `/apps/${ids.global}`, adminA), 403);
  const g = await App.findById(ids.global).lean();
  assert.ok(g, 'global app must survive');
  assert.equal(g!.is_active, true);
  assert.equal(g!.name, 'Shared App');
  // the global app is still readable by both organisations
  assert.equal(await call('GET', `/apps/${ids.global}`, adminB), 200);
});

test('a tenant still manages its own apps', async () => {
  assert.equal(await call('PUT', `/apps/${ids.appA}`, adminA, { is_active: false, status: 'inactive' }), 200);
  assert.equal((await App.findById(ids.appA).lean())!.is_active, false);
  assert.equal(await call('PUT', `/apps/${ids.appA}`, adminB, { name: 'Taken' }), 404);
  assert.equal(await call('DELETE', `/apps/${ids.appA}`, adminA), 200);
  assert.equal(await App.exists({ _id: ids.appA }), null);
});

test('owner_id must belong to the organisation (no other organisation\'s name or e-mail via owner_info)', async () => {
  assert.equal(await call('POST', '/apps', adminA, { name: 'Owned', slug: 'owned', category: 'utilities', owner_id: String(adminB._id) }), 400);
  assert.equal(await call('POST', '/apps', adminA, { name: 'Owned', slug: 'owned', category: 'utilities', owner_id: String(adminA._id) }), 201);
  const own = await App.findOne({ company_id: companyA, slug: 'owned' }).lean();
  assert.equal(await call('PUT', `/apps/${own!._id}`, adminA, { owner_id: String(adminB._id) }), 400);
  // an owner_id written before this check (from another organisation) is not shown
  await App.updateOne({ _id: own!._id }, { owner_id: adminB._id });
  const body = await getJson(`/apps/${own!._id}`, adminA);
  assert.equal(body.data.owner_info, null);
});

test('assigning to another organisation\'s location is refused', async () => {
  const own = await App.create({ company_id: companyA, name: 'Loc Tool', slug: 'loc-tool', category: 'utilities', is_active: true, status: 'active' });
  assert.equal(await call('POST', `/apps/${own._id}/assign`, adminA, { target_type: 'location', target_id: String(ids.locB) }), 404);
});

test('assigning to the organisation\'s own location still works; a malformed owner_id is a 400', async () => {
  const locA = await Location.create({ company_id: companyA, name: 'Office A', type: 'office', timezone: 'UTC' });
  const own = await App.create({ company_id: companyA, name: 'Loc Tool 2', slug: 'loc-tool-2', category: 'utilities', is_active: true, status: 'active' });
  assert.equal(await call('POST', `/apps/${own._id}/assign`, adminA, { target_type: 'location', target_id: String(locA._id) }), 201);
  assert.equal(await call('POST', '/apps', adminA, { name: 'Bad Owner', slug: 'bad-owner', category: 'utilities', owner_id: 'not-an-id' }), 400);
});

test('an assignment naming another organisation\'s user does not reveal that user\'s name', async () => {
  const { AppAssignment } = await import('../../models/AppAssignment.model');
  const own = await App.create({ company_id: companyA, name: 'Legacy', slug: 'legacy', category: 'utilities', is_active: true, status: 'active' });
  await AppAssignment.create({ company_id: companyA, app_id: own._id, target_type: 'user', target_id: adminB._id, granted_by: adminA._id, granted_at: new Date(), is_active: true });
  const body = await getJson(`/apps/${own._id}`, adminA);
  assert.equal(body.data.assignments.length, 1);
  assert.equal(body.data.assignments[0].target_name, 'Unknown User');
});
