// server/src/controllers/__tests__/workScheduleScope.test.ts
// Tenant-scope review 2026-11-27: work schedule assignments are looked up by _id and company_id.
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
import { WorkSchedule } from '../../models/WorkSchedule.model';
import { WorkScheduleAssignment } from '../../models/WorkScheduleAssignment.model';
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
  await mongoose.connect(mongo.getUri(), { dbName: 'work_schedule_scope_test' });
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
  for (const [tag, company] of [['A', companyA], ['B', companyB]] as const) {
    ids[`loc${tag}`] = (await Location.create({ company_id: company, name: `Office ${tag}`, type: 'office', timezone: 'UTC' }))._id;
    ids[`ws${tag}`] = (await WorkSchedule.create({ company_id: company, name: `Hours ${tag}`, working_hours: { start: '09:00', end: '17:00' } }))._id;
    ids[`asg${tag}`] = (await WorkScheduleAssignment.create({ company_id: company, location_id: ids[`loc${tag}`], work_schedule_id: ids[`ws${tag}`], is_primary: true, effective_date: new Date('2026-01-01') }))._id;
  }
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.disconnect();
  await mongo.stop();
});

test('another organisation\'s work schedule assignment can be neither updated nor deleted', async () => {
  assert.equal(await call('PUT', `/work-schedules/assignments/${ids.asgB}`, adminA, { is_primary: false }), 404);
  assert.equal(await call('DELETE', `/work-schedules/assignments/${ids.asgB}`, adminA), 404);
  assert.equal((await WorkScheduleAssignment.findById(ids.asgB).lean())!.is_primary, true);
  assert.equal(await call('PUT', `/work-schedules/assignments/${ids.asgA}`, adminA, { is_primary: false }), 200);
  assert.equal(await call('DELETE', `/work-schedules/assignments/${ids.asgB}`, adminB), 200);
});

test('a schedule\'s assignments list only the organisation\'s own rows', async () => {
  // a stray row from another organisation that names A's schedule (cannot be created through the API)
  await WorkScheduleAssignment.create({ company_id: companyB, location_id: ids.locB, work_schedule_id: ids.wsA, is_primary: false, effective_date: new Date('2026-01-01') });
  const body = await getJson(`/work-schedules/${ids.wsA}`, adminA);
  assert.equal(body.data.assignment_count, 1);
  assert.equal(body.data.locations.length, 1);
});
