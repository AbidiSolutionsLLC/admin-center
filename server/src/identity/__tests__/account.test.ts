// server/src/identity/__tests__/account.test.ts
// Unit and integration tests for Account Page: /realms/tenant/account (03 §4.4, D-8).
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
import { generateSecret, generate as generateTotp } from 'otplib';

import { createServer } from '../../app';
import { Identity, IIdentity } from '../../models/Identity.model';
import { User, IUser } from '../../models/User.model';
import { Company } from '../../models/Company.model';
import { Role } from '../../models/Role.model';
import { UserRole } from '../../models/UserRole.model';
import { Session } from '../../models/Session.model';
import { loadRealmKeys } from '../../identity/keys';
import { getIdentityConfig } from '../../identity/config';
import { encrypt } from '../../lib/cryptoService';
import { normalizeRecoveryCode, hashRecoveryCode } from '../recoveryCodes';

let mongo: MongoMemoryServer;
let server: http.Server;
let baseUrl: string;

const companyId = new Types.ObjectId();
let testUser: IUser;
let testIdentity: IIdentity;
const PASSWORD = 'Initial-Passw0rd!123';
let totpSecret: string;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'tenant_account_test' });

  const app = await createServer();
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;

  await Company.create({
    _id: companyId,
    name: 'Account Test Co',
    slug: 'account-test-co',
    status: 'active',
    is_active: true,
  });

  const role = await Role.create({
    company_id: companyId,
    name: 'Super Admin',
    type: 'system',
    description: 'Full access',
  });

  totpSecret = generateSecret();
  testIdentity = await Identity.create({
    email: 'user@account.test',
    full_name: 'Account Test User',
    password_hash: await bcrypt.hash(PASSWORD, 12),
    password_changed_at: new Date(),
    email_verified_at: new Date(),
    mfa: {
      totp_secret_enc: encrypt(totpSecret),
      totp_enabled: true,
      recovery_codes_hash: [],
      email_otp_enabled: false,
    },
    status: 'active',
  });

  testUser = await User.create({
    company_id: companyId,
    identity_id: testIdentity._id,
    email: testIdentity.email,
    full_name: testIdentity.full_name,
    password_hash: 'legacy-hash',
    role: 'Super Admin',
    lifecycle_state: 'active',
    is_active: true,
  });

  await UserRole.create({
    user_id: testUser._id,
    role_id: role._id,
    company_id: companyId,
    assigned_by: testUser._id,
  });
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.disconnect();
  await mongo.stop();
});

async function mintTenantToken(user: IUser, sid: string, audience = 'urn:karbexa:admin'): Promise<string> {
  const keys = await loadRealmKeys('tenant');
  const tenantPrivateJwk = keys.privateJwks.keys[0];
  const tenantKey = await jose.importJWK(tenantPrivateJwk, 'RS256');

  return new jose.SignJWT({
    token_use: 'access',
    org: String(user.company_id),
    sid,
    email: user.email,
  })
    .setProtectedHeader({ alg: 'RS256', kid: tenantPrivateJwk.kid, typ: 'at+jwt' })
    .setIssuer(getIdentityConfig().tenantIssuer)
    .setAudience(audience)
    .setSubject(String(user._id))
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(tenantKey);
}

async function createTestSession(user: IUser, identity: IIdentity): Promise<{ sid: string; token: string }> {
  const sid = `sid_${crypto.randomBytes(12).toString('hex')}`;
  await Session.create({
    _id: sid,
    identity_id: identity._id,
    member_id: user._id,
    company_id: user.company_id,
    realm: 'tenant',
    created_at: new Date(),
    last_seen_at: new Date(),
    idle_expires_at: new Date(Date.now() + 3600e3),
    absolute_expires_at: new Date(Date.now() + 3600e3),
    amr: ['pwd', 'otp'],
    user_agent: 'TestBrowser/1.0',
    ip: '127.0.0.1',
  });
  const token = await mintTenantToken(user, sid);
  return { sid, token };
}

function extractCsrf(html: string): string {
  const match = /name="csrf" value="([^"]+)"/.exec(html);
  assert.ok(match, 'CSRF token input must be present in HTML');
  return match[1];
}

test('A3-3: unauthenticated request to /realms/tenant/account redirects to login', async () => {
  const res = await fetch(`${baseUrl}/realms/tenant/account`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  const location = res.headers.get('location') || '';
  assert.match(location, /\/login/);
});

test('A3-3: authenticated GET /realms/tenant/account renders with nonce-CSP and security cards', async () => {
  const { token } = await createTestSession(testUser, testIdentity);
  const res = await fetch(`${baseUrl}/realms/tenant/account`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const csp = res.headers.get('content-security-policy') || '';
  assert.match(csp, /script-src 'nonce-/);
  assert.match(csp, /style-src 'nonce-/);

  const html = await res.text();
  assert.match(html, /Account &amp; Security/);
  assert.match(html, /Change Password/);
  assert.match(html, /Two-Step Verification/);
  assert.match(html, /Recovery Codes/);
  assert.match(html, /Active Sessions/);
  const csrf = extractCsrf(html);
  assert.ok(csrf.length > 20);
});

test('A3-3: POST /password rejects missing or invalid CSRF', async () => {
  const { token } = await createTestSession(testUser, testIdentity);
  const res = await fetch(`${baseUrl}/realms/tenant/account/password`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      current_password: PASSWORD,
      new_password: 'New-Secure-Password!999',
      confirm_password: 'New-Secure-Password!999',
      csrf: 'invalid.csrf.token',
    }).toString(),
  });
  assert.equal(res.status, 403);
  const html = await res.text();
  assert.match(html, /Invalid or missing CSRF token/);
});

test('A3-3: POST /password rejects incorrect current password', async () => {
  const { sid, token } = await createTestSession(testUser, testIdentity);
  const getRes = await fetch(`${baseUrl}/realms/tenant/account`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const csrf = extractCsrf(await getRes.text());

  const res = await fetch(`${baseUrl}/realms/tenant/account/password`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      current_password: 'wrong-password',
      new_password: 'New-Secure-Password!999',
      confirm_password: 'New-Secure-Password!999',
      csrf,
    }).toString(),
  });
  assert.equal(res.status, 400);
  const html = await res.text();
  assert.match(html, /Current password is incorrect/);
});

test('A3-3: POST /password successfully updates password and revokes other sessions', async () => {
  // Create current session and another session for the same user
  const { sid: currentSid, token: currentToken } = await createTestSession(testUser, testIdentity);
  const { sid: otherSid, token: otherToken } = await createTestSession(testUser, testIdentity);

  // Before change, other session works with requireAuth
  const preCheck = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { authorization: `Bearer ${otherToken}` },
  });
  assert.equal(preCheck.status, 200);

  const getRes = await fetch(`${baseUrl}/realms/tenant/account`, {
    headers: { authorization: `Bearer ${currentToken}` },
  });
  const csrf = extractCsrf(await getRes.text());

  const NEW_PASSWORD = 'New-Valid-Passw0rd!456';
  const res = await fetch(`${baseUrl}/realms/tenant/account/password`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${currentToken}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      current_password: PASSWORD,
      new_password: NEW_PASSWORD,
      confirm_password: NEW_PASSWORD,
      csrf,
    }).toString(),
  });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Password changed successfully/);

  // Identity password hash was updated
  const updatedIdn = await Identity.findById(testIdentity._id);
  assert.ok(updatedIdn && (await bcrypt.compare(NEW_PASSWORD, updatedIdn.password_hash!)));

  // Current session still works
  const currentCheck = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { authorization: `Bearer ${currentToken}` },
  });
  assert.equal(currentCheck.status, 200);

  // Other session was revoked!
  const otherSessionDoc = await Session.findById(otherSid);
  assert.ok(otherSessionDoc?.revoked_at, 'Other session must be revoked');
  assert.equal(otherSessionDoc.revoked_reason, 'password_change');

  const otherCheck = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { authorization: `Bearer ${otherToken}` },
  });
  assert.equal(otherCheck.status, 401);
  const body = (await otherCheck.json()) as { code: string };
  assert.equal(body.code, 'SESSION_REVOKED');

  // Restore password for other tests
  updatedIdn.password_hash = await bcrypt.hash(PASSWORD, 12);
  await updatedIdn.save();
});

test('A3-3 (review M-3): a products-audience token from the same tenant issuer cannot open the account page', async () => {
  const { sid } = await createTestSession(testUser, testIdentity);
  const productsToken = await mintTenantToken(testUser, sid, 'urn:karbexa:products');
  const prior = JSON.stringify((await Identity.findById(testIdentity._id))?.mfa?.recovery_codes_hash || []);
  const res = await fetch(`${baseUrl}/realms/tenant/account`, {
    headers: { authorization: `Bearer ${productsToken}` },
    redirect: 'manual',
  });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location') || '', /\/login/);

  const post = await fetch(`${baseUrl}/realms/tenant/account/recovery-codes`, {
    method: 'POST',
    headers: { authorization: `Bearer ${productsToken}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'csrf=x',
    redirect: 'manual',
  });
  assert.notEqual(post.status, 200);
  const latest = JSON.stringify((await Identity.findById(testIdentity._id))?.mfa?.recovery_codes_hash || []);
  assert.equal(latest, prior);
});

test('A3-3: POST /recovery-codes generates 10 single-use recovery codes and stores hashes', async () => {
  const { token } = await createTestSession(testUser, testIdentity);
  const getRes = await fetch(`${baseUrl}/realms/tenant/account`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const csrf = extractCsrf(await getRes.text());

  const res = await fetch(`${baseUrl}/realms/tenant/account/recovery-codes`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ csrf }).toString(),
  });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Save these 10 recovery codes now/);

  const updatedIdn = await Identity.findById(testIdentity._id);
  assert.equal(updatedIdn?.mfa.recovery_codes_hash.length, 10);
});

test('A3-3: TOTP re-enrolment requires current TOTP or recovery code', async () => {
  const { token } = await createTestSession(testUser, testIdentity);
  const getRes = await fetch(`${baseUrl}/realms/tenant/account`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const csrf = extractCsrf(await getRes.text());

  // Negative: invalid verification code
  const badRes = await fetch(`${baseUrl}/realms/tenant/account/totp/initiate`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ verification_code: '000000', csrf }).toString(),
  });
  assert.equal(badRes.status, 400);
  assert.match(await badRes.text(), /Current authenticator code or recovery code is not valid/);

  // Positive: valid current TOTP code initiates re-enrolment
  const validCode = await generateTotp({ secret: totpSecret });
  const okRes = await fetch(`${baseUrl}/realms/tenant/account/totp/initiate`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ verification_code: validCode, csrf }).toString(),
  });
  assert.equal(okRes.status, 200);
  const okHtml = await okRes.text();
  assert.match(okHtml, /Two-Step Verification \(Confirm New Key\)/);
  assert.match(okHtml, /Confirm and activate/);
});

test('A3-3: recovery-code single use: works once for re-enrolment, second use is rejected', async () => {
  const { token } = await createTestSession(testUser, testIdentity);

  // Seed two recovery codes directly
  const code1 = 'ABCD1-EFGH2';
  const code2 = 'IJKL3-MNOP4';
  const idn = await Identity.findById(testIdentity._id);
  idn!.mfa.recovery_codes_hash = [hashRecoveryCode(code1), hashRecoveryCode(code2)];
  await idn!.save();

  const getRes = await fetch(`${baseUrl}/realms/tenant/account`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const csrf = extractCsrf(await getRes.text());

  // Use code1 to initiate re-enrolment
  const res1 = await fetch(`${baseUrl}/realms/tenant/account/totp/initiate`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ verification_code: code1, csrf }).toString(),
  });
  assert.equal(res1.status, 200);
  assert.match(await res1.text(), /Confirm and activate/);

  // Verify code1 was consumed from database (only 1 code remains)
  const afterIdn = await Identity.findById(testIdentity._id);
  assert.equal(afterIdn?.mfa.recovery_codes_hash.length, 1);
  assert.equal(afterIdn?.mfa.recovery_codes_hash[0], hashRecoveryCode(code2));

  // Second use of code1 MUST fail!
  const res2 = await fetch(`${baseUrl}/realms/tenant/account/totp/initiate`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ verification_code: code1, csrf }).toString(),
  });
  assert.equal(res2.status, 400);
  assert.match(await res2.text(), /Current authenticator code or recovery code is not valid/);
});

test('A3-3: session revoked from account page is refused by requireAuth and appears in /platform/v1/sessions/revocations', async () => {
  const { sid: currentSid, token: currentToken } = await createTestSession(testUser, testIdentity);
  const { sid: targetSid, token: targetToken } = await createTestSession(testUser, testIdentity);

  // Target session works before revocation
  const preCheck = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { authorization: `Bearer ${targetToken}` },
  });
  assert.equal(preCheck.status, 200);

  const getRes = await fetch(`${baseUrl}/realms/tenant/account`, {
    headers: { authorization: `Bearer ${currentToken}` },
  });
  const csrf = extractCsrf(await getRes.text());

  // Revoke target session via POST /sessions/revoke
  const res = await fetch(`${baseUrl}/realms/tenant/account/sessions/revoke`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${currentToken}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ session_id: targetSid, csrf }).toString(),
  });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Session signed out successfully/);

  // Target session is refused by requireAuth (401 SESSION_REVOKED)
  const postCheck = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { authorization: `Bearer ${targetToken}` },
  });
  assert.equal(postCheck.status, 401);
  const body = (await postCheck.json()) as { code: string };
  assert.equal(body.code, 'SESSION_REVOKED');

  // Target session appears in /platform/v1/sessions/revocations
  const serviceKeys = await loadRealmKeys('services');
  const servicePrivateJwk = serviceKeys.privateJwks.keys[0];
  const serviceKey = await jose.importJWK(servicePrivateJwk, 'RS256');

  const serviceToken = await new jose.SignJWT({
    token_use: 'service',
    scope: 'platform.sessions.read',
  })
    .setProtectedHeader({ alg: 'RS256', kid: servicePrivateJwk.kid, typ: 'at+jwt' })
    .setIssuer(getIdentityConfig().servicesIssuer)
    .setAudience('urn:karbexa:platform-api')
    .setSubject('karbexa-products-backend')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(serviceKey);

  const revRes = await fetch(`${baseUrl}/platform/v1/sessions/revocations`, {
    headers: { authorization: `Bearer ${serviceToken}` },
  });
  assert.equal(revRes.status, 200);
  const revocations = (await revRes.json()) as { sid: string; org_id: string }[];
  assert.ok(
    revocations.some((r) => r.sid === targetSid && String(r.org_id) === String(companyId)),
    `Revocations must include ${targetSid}`,
  );
});

test('A3-3: POST /sessions/revoke-others revokes all other sessions leaving current intact', async () => {
  const { sid: currentSid, token: currentToken } = await createTestSession(testUser, testIdentity);
  const { sid: extra1, token: token1 } = await createTestSession(testUser, testIdentity);
  const { sid: extra2, token: token2 } = await createTestSession(testUser, testIdentity);

  const getRes = await fetch(`${baseUrl}/realms/tenant/account`, {
    headers: { authorization: `Bearer ${currentToken}` },
  });
  const csrf = extractCsrf(await getRes.text());

  const res = await fetch(`${baseUrl}/realms/tenant/account/sessions/revoke-others`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${currentToken}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ csrf }).toString(),
  });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Signed out of \d+ other session/);

  // Extra sessions are revoked
  const check1 = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { authorization: `Bearer ${token1}` } });
  const check2 = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { authorization: `Bearer ${token2}` } });
  assert.equal(check1.status, 401);
  assert.equal(check2.status, 401);

  // Current session is still active
  const checkCurrent = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { authorization: `Bearer ${currentToken}` } });
  assert.equal(checkCurrent.status, 200);
});

test('Plan 0.7g: the account page opens for onboarding, probation and on_leave members, not for terminated ones', async () => {
  try {
    for (const state of ['onboarding', 'probation', 'on_leave'] as const) {
      await User.updateOne({ _id: testUser._id }, { lifecycle_state: state });
      const { token } = await createTestSession(testUser, testIdentity);
      const res = await fetch(`${baseUrl}/realms/tenant/account`, { headers: { authorization: `Bearer ${token}` }, redirect: 'manual' });
      assert.equal(res.status, 200, `state ${state}`);
    }
    await User.updateOne({ _id: testUser._id }, { lifecycle_state: 'terminated' });
    const { token } = await createTestSession(testUser, testIdentity);
    const res = await fetch(`${baseUrl}/realms/tenant/account`, { headers: { authorization: `Bearer ${token}` }, redirect: 'manual' });
    assert.notEqual(res.status, 200);
  } finally {
    await User.updateOne({ _id: testUser._id }, { lifecycle_state: 'active' });
  }
});
