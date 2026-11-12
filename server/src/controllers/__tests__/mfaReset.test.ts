// server/src/controllers/__tests__/mfaReset.test.ts
// Tests for Admin MFA reset: POST /people/:id/mfa-reset (03 §4.4, A3-4).
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
process.env.OIDC_COOKIE_KEYS = process.env.OIDC_COOKIE_KEYS || crypto.randomBytes(32).toString('base64url');
process.env.ALLOW_STANDALONE_MONGO = 'true';

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as jose from 'jose';
import bcrypt from 'bcryptjs';
import http from 'http';
import { AddressInfo } from 'net';
import { generateSecret } from 'otplib';

import { createServer } from '../../app';
import { Identity, IIdentity } from '../../models/Identity.model';
import { User, IUser } from '../../models/User.model';
import { Company } from '../../models/Company.model';
import { Role } from '../../models/Role.model';
import { UserRole } from '../../models/UserRole.model';
import { Session } from '../../models/Session.model';
import { AuditEvent } from '../../models/AuditEvent.model';
import { loadRealmKeys } from '../../identity/keys';
import { getIdentityConfig } from '../../identity/config';
import { encrypt } from '../../lib/cryptoService';

let mongo: MongoMemoryServer;
let server: http.Server;
let baseUrl: string;

const companyA = new Types.ObjectId();
const companyB = new Types.ObjectId();

let superAdminA: IUser;
let itAdminA: IUser;
let employeeA: IUser;
let employeeB: IUser;

let superAdminIdnA: IIdentity;
let itAdminIdnA: IIdentity;
let employeeIdnA: IIdentity;
let employeeIdnB: IIdentity;

const DEFAULT_PASSWORD = 'Test-Passw0rd!123';

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'mfa_reset_test' });

  const app = await createServer();
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;

  await Company.insertMany([
    { _id: companyA, name: 'Company A', slug: 'company-a', status: 'active', is_active: true },
    { _id: companyB, name: 'Company B', slug: 'company-b', status: 'active', is_active: true },
  ]);

  const [roleSuperAdminA, roleItAdminA, roleEmployeeA, roleEmployeeB] = await Promise.all([
    Role.create({ company_id: companyA, name: 'Super Admin', type: 'system', description: 'Super Admin' }),
    Role.create({ company_id: companyA, name: 'IT Admin', type: 'system', description: 'IT Admin' }),
    Role.create({ company_id: companyA, name: 'Employee', type: 'system', description: 'Employee' }),
    Role.create({ company_id: companyB, name: 'Employee', type: 'system', description: 'Employee' }),
  ]);

  const makeIdentity = async (email: string, fullName: string) =>
    Identity.create({
      email,
      full_name: fullName,
      password_hash: await bcrypt.hash(DEFAULT_PASSWORD, 12),
      email_verified_at: new Date(),
      status: 'active',
      mfa: {
        totp_secret_enc: encrypt(generateSecret()),
        totp_enabled: true,
        recovery_codes_hash: [crypto.randomBytes(32).toString('hex')],
        email_otp_enabled: false,
      },
    });

  [superAdminIdnA, itAdminIdnA, employeeIdnA, employeeIdnB] = await Promise.all([
    makeIdentity('superadmin@org-a.test', 'Super Admin A'),
    makeIdentity('itadmin@org-a.test', 'IT Admin A'),
    makeIdentity('employee@org-a.test', 'Employee A'),
    makeIdentity('employee@org-b.test', 'Employee B'),
  ]);

  const makeUser = async (idn: IIdentity, company: Types.ObjectId, roleName: string) =>
    User.create({
      company_id: company,
      identity_id: idn._id,
      email: idn.email,
      full_name: idn.full_name,
      password_hash: 'legacy-unused',
      role: roleName as any,
      lifecycle_state: 'active',
      is_active: true,
    });

  [superAdminA, itAdminA, employeeA, employeeB] = await Promise.all([
    makeUser(superAdminIdnA, companyA, 'Super Admin'),
    makeUser(itAdminIdnA, companyA, 'IT Admin'),
    makeUser(employeeIdnA, companyA, 'Employee'),
    makeUser(employeeIdnB, companyB, 'Employee'),
  ]);

  await UserRole.insertMany([
    { user_id: superAdminA._id, role_id: roleSuperAdminA._id, company_id: companyA, assigned_by: superAdminA._id },
    { user_id: itAdminA._id, role_id: roleItAdminA._id, company_id: companyA, assigned_by: superAdminA._id },
    { user_id: employeeA._id, role_id: roleEmployeeA._id, company_id: companyA, assigned_by: superAdminA._id },
    { user_id: employeeB._id, role_id: roleEmployeeB._id, company_id: companyB, assigned_by: employeeB._id },
  ]);
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  if (mongoose.connection.db) {
    await mongoose.connection.db.collection('auditevents').deleteMany({});
  }
});

async function mintToken(user: IUser, companyId: Types.ObjectId): Promise<{ token: string; sid: string }> {
  const sid = `sid_${crypto.randomBytes(8).toString('hex')}`;
  await Session.create({
    _id: sid,
    identity_id: user.identity_id,
    member_id: user._id,
    company_id: companyId,
    realm: 'tenant',
    created_at: new Date(),
    last_seen_at: new Date(),
    idle_expires_at: new Date(Date.now() + 3600e3),
    absolute_expires_at: new Date(Date.now() + 3600e3),
    amr: ['pwd', 'otp'],
    user_agent: 'TestBrowser/1.0',
    ip: '127.0.0.1',
  });

  const keys = await loadRealmKeys('tenant');
  const tenantPrivateJwk = keys.privateJwks.keys[0];
  const tenantKey = await jose.importJWK(tenantPrivateJwk, 'RS256');

  const token = await new jose.SignJWT({
    token_use: 'access',
    org: String(companyId),
    sid,
    email: user.email,
  })
    .setProtectedHeader({ alg: 'RS256', kid: tenantPrivateJwk.kid, typ: 'at+jwt' })
    .setIssuer(getIdentityConfig().tenantIssuer)
    .setAudience('urn:karbexa:admin')
    .setSubject(String(user._id))
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(tenantKey);

  return { token, sid };
}

test('A3-4: unauthenticated request to POST /people/:id/mfa-reset = 401', async () => {
  const res = await fetch(`${baseUrl}/api/v1/people/${employeeA._id}/mfa-reset`, { method: 'POST' });
  assert.equal(res.status, 401);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'NO_TOKEN');
});

test('A3-4: unauthorized role (Employee) cannot reset MFA = 403', async () => {
  const { token } = await mintToken(employeeA, companyA);
  const res = await fetch(`${baseUrl}/api/v1/people/${employeeA._id}/mfa-reset`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'INSUFFICIENT_ROLE');
});

test('A3-4: cross-tenant isolation: Org A admin cannot reset Org B member = 404', async () => {
  const { token } = await mintToken(superAdminA, companyA);
  const res = await fetch(`${baseUrl}/api/v1/people/${employeeB._id}/mfa-reset`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'NOT_FOUND');
});

test('A3-4: hierarchy guard: IT Admin cannot reset higher-ranked Super Admin = 403', async () => {
  const { token } = await mintToken(itAdminA, companyA);
  const res = await fetch(`${baseUrl}/api/v1/people/${superAdminA._id}/mfa-reset`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'ROLE_HIERARCHY_VIOLATION');
});

test('A3-4: IT Admin successfully resets MFA of lower-ranked Employee', async () => {
  const { token: itAdminToken } = await mintToken(itAdminA, companyA);
  const { token: employeeToken, sid: employeeSid } = await mintToken(employeeA, companyA);

  // Before reset: employee token works
  const preCheck = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(preCheck.status, 200);

  // Reset employee MFA
  const res = await fetch(`${baseUrl}/api/v1/people/${employeeA._id}/mfa-reset`, {
    method: 'POST',
    headers: { authorization: `Bearer ${itAdminToken}` },
  });
  assert.equal(res.status, 200);
  const data = (await res.json()) as { success: boolean; data: { user_id: string; sessions_revoked: number } };
  assert.equal(data.success, true);
  assert.equal(data.data.user_id, employeeA._id.toString());
  assert.ok(data.data.sessions_revoked >= 1);

  // Verify identity MFA state in DB: TOTP cleared, recovery codes cleared
  const updatedIdn = await Identity.findById(employeeA.identity_id);
  assert.equal(updatedIdn?.mfa.totp_enabled, false);
  assert.equal(updatedIdn?.mfa.totp_secret_enc, undefined);
  assert.equal(updatedIdn?.mfa.recovery_codes_hash.length, 0);

  // Verify session revocation: employee's active session is now revoked
  const postCheck = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(postCheck.status, 401);
  const postBody = (await postCheck.json()) as { code: string };
  assert.equal(postBody.code, 'SESSION_REVOKED');

  // Verify audit log recorded
  const audit = await AuditEvent.findOne({ action: 'people.mfa_reset', company_id: companyA });
  assert.ok(audit, 'people.mfa_reset audit event must be recorded');
  assert.equal(audit.object_id, employeeA._id.toString());
});

test('A3-4: effect at next login: member is forced into TOTP enrolment', async () => {
  // Try login flow with the reset member
  const TENANT = `${baseUrl}/realms/tenant`;
  const REDIRECT = `${getIdentityConfig().adminSpaOrigin}/auth/callback`;
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

  // 1. Authorize
  const authRes = await fetch(`${TENANT}/oauth/authorize?${new URLSearchParams({
    client_id: 'karbexa-admin-spa',
    response_type: 'code',
    redirect_uri: REDIRECT,
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'st-mfa-reset',
  })}`, { redirect: 'manual' });
  assert.equal(authRes.status, 303);
  const loc = authRes.headers.get('location') || '';
  const uid = /\/interaction\/([^/?#]+)/.exec(loc)?.[1];
  assert.ok(uid, 'Must redirect to interaction with uid');

  // Parse cookies from authorize response
  const cookies = authRes.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

  // 2. Submit password for the reset employee
  const loginRes = await fetch(`${TENANT}/interaction/${uid}/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: cookies,
    },
    body: new URLSearchParams({ email: employeeA.email, password: DEFAULT_PASSWORD }).toString(),
    redirect: 'manual',
  });
  assert.equal(loginRes.status, 303);

  // 3. Render next step
  const nextRes = await fetch(`${TENANT}/interaction/${uid}`, {
    headers: { cookie: cookies },
  });
  assert.equal(nextRes.status, 200);
  const html = await nextRes.text();

  // Acceptance check: MUST render enrolment ("Set up two-step verification"), NOT standard verify!
  assert.match(html, /Set up two-step verification/);
  assert.match(html, /action="[^"]*\/enrol"/);
  assert.doesNotMatch(html, /action="[^"]*\/totp"/);
});
