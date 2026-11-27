// server/src/controllers/__tests__/holidayAssignmentScope.test.ts
// Regression (tenant-scope review 2026-11-27): PUT /holidays/assignments/:id accepted any calendar_id / location_id,
// so an org A admin could point an assignment at org B's calendar or location (create already checked them).
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
import { HolidayCalendar } from '../../models/HolidayCalendar.model';
import { HolidayAssignment } from '../../models/HolidayAssignment.model';
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

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'holiday_assignment_scope_test' });
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
    ids[`cal${tag}`] = (await HolidayCalendar.create({ company_id: company, name: `Calendar ${tag}` }))._id;
    ids[`asg${tag}`] = (await HolidayAssignment.create({
      company_id: company, location_id: ids[`loc${tag}`], calendar_id: ids[`cal${tag}`], is_primary: true, effective_date: new Date('2026-01-01'),
    }))._id;
  }
  ids.calA2 = (await HolidayCalendar.create({ company_id: companyA, name: 'Calendar A2' }))._id;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.disconnect();
  await mongo.stop();
});

test('PUT refuses another organisation\'s calendar or location and leaves the assignment unchanged', async () => {
  assert.equal(await call('PUT', `/holidays/assignments/${ids.asgA}`, adminA, { calendar_id: String(ids.calB) }), 404);
  assert.equal(await call('PUT', `/holidays/assignments/${ids.asgA}`, adminA, { location_id: String(ids.locB) }), 404);
  const asg = await HolidayAssignment.findById(ids.asgA).lean();
  assert.equal(String(asg!.calendar_id), String(ids.calA));
  assert.equal(String(asg!.location_id), String(ids.locA));
});

test('PUT with the organisation\'s own calendar still works', async () => {
  assert.equal(await call('PUT', `/holidays/assignments/${ids.asgA}`, adminA, { calendar_id: String(ids.calA2) }), 200);
  assert.equal(String((await HolidayAssignment.findById(ids.asgA).lean())!.calendar_id), String(ids.calA2));
});

// Regression: the bulk delete looked the ids up in the caller's company but then deleted every requested id.
test('bulk delete removes only the caller\'s own assignments when the list also names another organisation\'s', async () => {
  const own = await HolidayAssignment.create({ company_id: companyA, location_id: ids.locA, calendar_id: ids.calA, is_primary: false, effective_date: new Date('2026-02-01') });
  const theirs = await HolidayAssignment.create({ company_id: companyB, location_id: ids.locB, calendar_id: ids.calB, is_primary: false, effective_date: new Date('2026-02-01') });
  assert.equal(await call('DELETE', '/holidays/assignments/bulk', adminA, { assignment_ids: [String(own._id), String(theirs._id)] }), 200);
  assert.equal(await HolidayAssignment.exists({ _id: own._id }), null);
  assert.ok(await HolidayAssignment.exists({ _id: theirs._id }), 'org B assignment must survive');
});

// Regression: moveHoliday loaded the source holiday by _id only, so another organisation's holiday could be
// moved into the caller's calendar (Holiday has no company_id; ownership is its calendar's).
test('moving another organisation\'s holiday into your calendar is refused', async () => {
  const { Holiday } = await import('../../models/Holiday.model');
  const theirs = await Holiday.create({ name: 'B Day', date: new Date('2031-05-05'), calendar_id: ids.calB });
  assert.equal(await call('POST', '/holidays/holiday/move', adminA, { holiday_id: String(theirs._id), target_calendar_id: String(ids.calA) }), 404);
  assert.equal(String((await Holiday.findById(theirs._id).lean())!.calendar_id), String(ids.calB));
  const mine = await Holiday.create({ name: 'A Day', date: new Date('2031-05-06'), calendar_id: ids.calA });
  assert.equal(await call('POST', '/holidays/holiday/move', adminA, { holiday_id: String(mine._id), target_calendar_id: String(ids.calA2) }), 200);
});

// Regression: clearing a holiday custom field unset that slug on every organisation's holidays.
test('clearing a holiday custom field touches only the caller\'s holidays', async () => {
  const { Holiday } = await import('../../models/Holiday.model');
  const { CustomField } = await import('../../models/CustomField.model');
  const field = await CustomField.create({ company_id: companyA, name: 'Region', slug: 'region', field_type: 'text', target_object: 'holiday', label: 'Region' });
  const mine = await Holiday.create({ name: 'A Region Day', date: new Date('2031-06-01'), calendar_id: ids.calA, custom_fields: { region: 'north' } });
  const theirs = await Holiday.create({ name: 'B Region Day', date: new Date('2031-06-01'), calendar_id: ids.calB, custom_fields: { region: 'south' } });
  const status = await call('POST', `/data-fields/${field._id}/clear-data`, adminA, { confirm: true });
  assert.ok(status < 300, `clear-data answered ${status}`);
  assert.equal((await Holiday.findById(mine._id).lean() as any).custom_fields?.region, undefined);
  assert.equal((await Holiday.findById(theirs._id).lean() as any).custom_fields?.region, 'south');
});

test('another organisation\'s assignment can be neither updated nor deleted', async () => {
  assert.equal(await call('PUT', `/holidays/assignments/${ids.asgB}`, adminA, { is_primary: false }), 404);
  assert.equal(await call('DELETE', `/holidays/assignments/${ids.asgB}`, adminA), 404);
  assert.ok(await HolidayAssignment.exists({ _id: ids.asgB }));
  assert.equal(await call('DELETE', `/holidays/assignments/${ids.asgB}`, adminB), 200);
});
