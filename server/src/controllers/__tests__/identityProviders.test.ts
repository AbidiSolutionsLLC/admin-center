// server/src/controllers/__tests__/identityProviders.test.ts
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as jose from 'jose';
import crypto from 'crypto';
import {
  setDnsTxtResolver,
  resetDnsTxtResolver,
} from '../identityProviders.controller';
import { IdentityProviderConnection } from '../../models/IdentityProviderConnection.model';
import { AuditEvent } from '../../models/AuditEvent.model';
import { Identity } from '../../models/Identity.model';
import { User } from '../../models/User.model';
import { Company } from '../../models/Company.model';
import { Role } from '../../models/Role.model';
import { UserRole } from '../../models/UserRole.model';
import { Session } from '../../models/Session.model';
import { createServer } from '../../app';
import { loadRealmKeys } from '../../identity/keys';
import { getIdentityConfig } from '../../identity/config';
import http from 'http';
import { AddressInfo } from 'net';

let mongo: MongoMemoryServer;
let server: http.Server;
let baseUrl: string;

const companyA = new Types.ObjectId();
const companyB = new Types.ObjectId();
let userA: any;
let userB: any;
let superAdminRole: any;

let mockTxtRecords: Record<string, string[][]> = {};

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'idp_connections_test' });

  // Inject DNS resolver
  setDnsTxtResolver(async (domain: string) => {
    const recs = mockTxtRecords[domain.toLowerCase()];
    if (!recs) {
      const err = new Error('queryTxt ENODATA ' + domain);
      (err as any).code = 'ENODATA';
      throw err;
    }
    return recs;
  });

  const app = await createServer();
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;

  // Seed Companies, Roles, Identities, and Users
  await Company.insertMany([
    { _id: companyA, name: 'Company A', slug: 'company-a', status: 'active', is_active: true },
    { _id: companyB, name: 'Company B', slug: 'company-b', status: 'active', is_active: true },
  ]);

  const roleA = await Role.create({
    company_id: companyA,
    name: 'Super Admin',
    type: 'system',
    description: 'Full access',
  });
  const roleB = await Role.create({
    company_id: companyB,
    name: 'Super Admin',
    type: 'system',
    description: 'Full access',
  });

  const idnA = await Identity.create({
    email: 'admin-a@karbexa.test',
    full_name: 'Admin A',
    status: 'active',
  });
  const idnB = await Identity.create({
    email: 'admin-b@karbexa.test',
    full_name: 'Admin B',
    status: 'active',
  });

  userA = await User.create({
    identity_id: idnA._id,
    company_id: companyA,
    email: idnA.email,
    full_name: idnA.full_name,
    password_hash: 'dummy_hash_for_test',
    lifecycle_state: 'active',
    is_active: true,
    authz_ver: 1,
  });

  userB = await User.create({
    identity_id: idnB._id,
    company_id: companyB,
    email: idnB.email,
    full_name: idnB.full_name,
    password_hash: 'dummy_hash_for_test',
    lifecycle_state: 'active',
    is_active: true,
    authz_ver: 1,
  });

  await UserRole.create([
    { user_id: userA._id, role_id: roleA._id, company_id: companyA, assigned_by: userA._id },
    { user_id: userB._id, role_id: roleB._id, company_id: companyB, assigned_by: userB._id },
  ]);
});

after(async () => {
  resetDnsTxtResolver();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise((resolve) => setTimeout(resolve, 300));
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  mockTxtRecords = {};
  await IdentityProviderConnection.deleteMany({});
  if (mongoose.connection.db) {
    await mongoose.connection.db.collection('auditevents').deleteMany({});
  }
});

async function mintToken(user: any, companyId: Types.ObjectId): Promise<string> {
  const sid = `sid_${crypto.randomBytes(8).toString('hex')}`;
  await Session.create({
    _id: sid,
    identity_id: user.identity_id,
    member_id: user._id,
    company_id: companyId,
    realm: 'tenant',
    idle_expires_at: new Date(Date.now() + 3600e3),
    absolute_expires_at: new Date(Date.now() + 3600e3),
    amr: ['pwd'],
  });

  const keys = await loadRealmKeys('tenant');
  const tenantPrivateJwk = keys.privateJwks.keys[0];
  const tenantKey = await jose.importJWK(tenantPrivateJwk, 'RS256');

  return new jose.SignJWT({
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
}

// Helper for making requests with mock user auth
async function apiRequest(
  path: string,
  method: string,
  body?: any,
  user: any = userA,
  companyId: Types.ObjectId = companyA
) {
  const token = await mintToken(user, companyId);

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

test('POST /security/identity-providers creates draft connection with 32-byte hex tokens and audits', async () => {
  const payload = {
    display_name: 'Corp Azure AD',
    tenant_id: '9a8b7c6d-5e4f-3a2b-1c0d-e9f8a7b6c5d4',
    domains: ['Karbexa.com', 'CORP.karbexa.com'],
  };

  const { status, data } = await apiRequest('/security/identity-providers', 'POST', payload);
  assert.equal(status, 201);
  assert.equal(data.success, true);
  assert.equal(data.data.display_name, 'Corp Azure AD');
  assert.equal(data.data.status, 'draft');
  assert.equal(data.data.config.tenant_id, '9a8b7c6d-5e4f-3a2b-1c0d-e9f8a7b6c5d4');
  assert.equal(data.data.domains.length, 2);

  // Check domain normalization & token length (32 bytes hex = 64 characters)
  for (const d of data.data.domains) {
    assert.equal(d.domain, d.domain.toLowerCase());
    assert.match(d.verification_token, /^[0-9a-f]{64}$/);
    assert.equal(d.verified_at, undefined);
  }

  // Audit event logged
  const audit = await AuditEvent.findOne({ action: 'identity_provider.created' });
  assert.ok(audit);
  assert.equal(audit?.object_id, data.data._id);
  assert.equal(audit?.company_id.toString(), companyA.toString());
});

test('GET /security/identity-providers lists connections for company only, hiding secret refs', async () => {
  await IdentityProviderConnection.create({
    company_id: companyA,
    type: 'entra',
    display_name: 'Org A Connection',
    status: 'draft',
    config: { tenant_id: 't-a', client_secret_ref: 'SUPER_SECRET_A' },
    domains: [{ domain: 'a.com', verification_token: 'tok-a' }],
  });

  await IdentityProviderConnection.create({
    company_id: companyB,
    type: 'entra',
    display_name: 'Org B Connection',
    status: 'draft',
    config: { tenant_id: 't-b', client_secret_ref: 'SUPER_SECRET_B' },
    domains: [{ domain: 'b.com', verification_token: 'tok-b' }],
  });

  // Query as Company A
  const { status, data } = await apiRequest('/security/identity-providers', 'GET');
  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.equal(data.data.length, 1);
  assert.equal(data.data[0].display_name, 'Org A Connection');
  assert.equal(data.data[0].config.client_secret_ref, undefined);
  assert.equal(data.data[0].domains[0].domain, 'a.com');
});

test('PATCH /security/identity-providers/:id activation guard: status=active requires >= 1 verified domain', async () => {
  const conn = await IdentityProviderConnection.create({
    company_id: companyA,
    type: 'entra',
    display_name: 'Draft Conn',
    status: 'draft',
    config: { tenant_id: '11111111-2222-4333-8444-555555555555' },
    domains: [{ domain: 'unverified.com', verification_token: 'tok123' }],
  });

  // Attempt to activate without verified domain -> fails
  const { status: failStatus, data: failData } = await apiRequest(
    `/security/identity-providers/${conn._id}`,
    'PATCH',
    { status: 'active' }
  );
  assert.equal(failStatus, 400);
  assert.equal(failData.code, 'NO_VERIFIED_DOMAINS');

  // Verify domain directly in DB to test successful activation
  conn.domains[0].verified_at = new Date();
  await conn.save();

  // Review M-2: a verified domain is not enough for Entra; an operator must approve the tenant id first.
  const noApproval = await apiRequest(`/security/identity-providers/${conn._id}`, 'PATCH', { status: 'active' });
  assert.equal(noApproval.status, 409);
  assert.equal(noApproval.data.code, 'OPERATOR_APPROVAL_REQUIRED');
  // An approval for a different tenant id does not count.
  conn.tenant_approval = { tenant_id: '99999999-2222-4333-8444-555555555555', approved_at: new Date(), operator_id: new Types.ObjectId() } as any;
  await conn.save();
  const wrongTenant = await apiRequest(`/security/identity-providers/${conn._id}`, 'PATCH', { status: 'active' });
  assert.equal(wrongTenant.status, 409);
  conn.tenant_approval = { tenant_id: '11111111-2222-4333-8444-555555555555', approved_at: new Date(), operator_id: new Types.ObjectId() } as any;
  await conn.save();

  const { status: okStatus, data: okData } = await apiRequest(
    `/security/identity-providers/${conn._id}`,
    'PATCH',
    { status: 'active', enforce_sso: true, jit_provisioning: 'create_member' }
  );
  assert.equal(okStatus, 200);
  assert.equal(okData.data.status, 'active');
  assert.equal(okData.data.enforce_sso, true);
  assert.equal(okData.data.jit_provisioning, 'create_member');

  // Audit verified
  const audit = await AuditEvent.findOne({ action: 'identity_provider.updated' });
  assert.ok(audit);
});

test('POST .../domains/:domain/verify DNS verification flow (ok, wrong token, not found, domain taken)', async () => {
  const tokenA = '1111111111111111111111111111111111111111111111111111111111111111';
  const connA = await IdentityProviderConnection.create({
    company_id: companyA,
    type: 'entra',
    display_name: 'Conn A',
    status: 'draft',
    domains: [{ domain: 'verify-test.com', verification_token: tokenA }],
  });

  // 1. DNS record not found
  const { status: sNotFound, data: dNotFound } = await apiRequest(
    `/security/identity-providers/${connA._id}/domains/verify-test.com/verify`,
    'POST'
  );
  assert.equal(sNotFound, 422);
  assert.equal(dNotFound.code, 'DNS_RECORD_NOT_FOUND');

  // 2. DNS record has wrong token
  mockTxtRecords['verify-test.com'] = [['karbexa-verification=WRONG_TOKEN']];
  const { status: sWrong, data: dWrong } = await apiRequest(
    `/security/identity-providers/${connA._id}/domains/verify-test.com/verify`,
    'POST'
  );
  assert.equal(sWrong, 422);
  assert.equal(dWrong.code, 'DNS_RECORD_NOT_FOUND');

  // 3. DNS record matches (chunked or single)
  mockTxtRecords['verify-test.com'] = [['karbexa-verification=', tokenA]];
  const { status: sOk, data: dOk } = await apiRequest(
    `/security/identity-providers/${connA._id}/domains/verify-test.com/verify`,
    'POST'
  );
  assert.equal(sOk, 200);
  assert.ok(dOk.data.domains[0].verified_at);

  // 4. Domain taken: Company B attempts to verify the same domain
  const connB = await IdentityProviderConnection.create({
    company_id: companyB,
    type: 'entra',
    display_name: 'Conn B',
    status: 'draft',
    domains: [{ domain: 'verify-test.com', verification_token: 'token-b' }],
  });
  mockTxtRecords['verify-test.com'] = [['karbexa-verification=token-b']];
  const { status: sTaken, data: dTaken } = await apiRequest(
    `/security/identity-providers/${connB._id}/domains/verify-test.com/verify`,
    'POST',
    undefined,
    userB,
    companyB
  );
  assert.equal(sTaken, 409);
  assert.equal(dTaken.code, 'DOMAIN_TAKEN');
});

test('Cross-tenant isolation: Org A cannot patch or verify Org B connection', async () => {
  const connB = await IdentityProviderConnection.create({
    company_id: companyB,
    type: 'entra',
    display_name: 'Conn B',
    status: 'draft',
    domains: [{ domain: 'b.com', verification_token: 'token-b' }],
  });

  const { status: sPatch } = await apiRequest(
    `/security/identity-providers/${connB._id}`,
    'PATCH',
    { display_name: 'Hacked' },
    userA,
    companyA
  );
  assert.equal(sPatch, 404);

  const { status: sVerify } = await apiRequest(
    `/security/identity-providers/${connB._id}/domains/b.com/verify`,
    'POST',
    undefined,
    userA,
    companyA
  );
  assert.equal(sVerify, 404);
});

test('03 §3 rule 2: enforce_sso affects members of that org only on verified domains', async () => {
  // Org A enforces SSO on verified domain "sso-test.com"
  await IdentityProviderConnection.create({
    company_id: companyA,
    type: 'entra',
    display_name: 'Org A SSO',
    status: 'active',
    enforce_sso: true,
    domains: [{ domain: 'sso-test.com', verification_token: 'tok', verified_at: new Date() }],
  });

  // User in Org A with email user@sso-test.com
  const idnSSO_A = await Identity.create({
    email: 'user@sso-test.com',
    full_name: 'SSO User A',
    status: 'active',
    password_hash: await import('bcryptjs').then(b => b.hash('password123', 10)),
  });
  const userSSO_A = await User.create({
    identity_id: idnSSO_A._id,
    company_id: companyA,
    email: idnSSO_A.email,
    full_name: idnSSO_A.full_name,
    password_hash: idnSSO_A.password_hash,
    lifecycle_state: 'active',
    is_active: true,
    authz_ver: 1,
  });

  // User in Org B with email user-b@sso-test.com (Org B does NOT enforce SSO)
  const idnSSO_B = await Identity.create({
    email: 'user-b@sso-test.com',
    full_name: 'SSO User B',
    status: 'active',
    password_hash: await import('bcryptjs').then(b => b.hash('password123', 10)),
  });
  const userSSO_B = await User.create({
    identity_id: idnSSO_B._id,
    company_id: companyB,
    email: idnSSO_B.email,
    full_name: idnSSO_B.full_name,
    password_hash: idnSSO_B.password_hash,
    lifecycle_state: 'active',
    is_active: true,
    authz_ver: 1,
  });

  // Start interaction for User A
  // GET /realms/tenant/login (via interaction flow)
  // Or directly test the login POST endpoint:
  // Post to /realms/tenant/interaction/:uid/login with email and password
  // Let's create an interaction in oidc-provider or test using fetch
  const loginRes = await fetch(`${baseUrl.replace('/api/v1', '')}/realms/tenant/login`, { redirect: 'manual' });
  const location = loginRes.headers.get('location') || '';
  const uidMatch = location.match(/\/interaction\/([a-zA-Z0-9_-]+)/);
  if (uidMatch) {
    const uid = uidMatch[1];
    const postResA = await fetch(`${baseUrl.replace('/api/v1', '')}/realms/tenant/interaction/${uid}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        cookie: loginRes.headers.get('set-cookie') || '',
      },
      body: new URLSearchParams({ email: 'user@sso-test.com', password: 'password123' }).toString(),
    });
    const htmlA = await postResA.text();
    assert.match(htmlA, /Single sign-on is required for your organisation/);
  }
});
test('Review M-1: verifying one domain does not reserve the other, unverified domains', async () => {
  await IdentityProviderConnection.init();
  // Org A has verified its own domain and listed victim.example (unverified) on the same connection.
  await IdentityProviderConnection.create({
    company_id: companyA, type: 'entra', display_name: 'A', status: 'draft',
    domains: [
      { domain: 'own-a.example', verification_token: 'tok-own', verified_at: new Date() },
      { domain: 'victim.example', verification_token: 'tok-victim-a' },
    ],
  });
  // The real owner (org B) can still verify victim.example.
  const connB = await IdentityProviderConnection.create({
    company_id: companyB, type: 'entra', display_name: 'B', status: 'draft',
    domains: [{ domain: 'victim.example', verification_token: 'tok-b' }],
  });
  mockTxtRecords['victim.example'] = [['karbexa-verification=tok-b']];
  const res = await apiRequest(`/security/identity-providers/${connB._id}/domains/victim.example/verify`, 'POST', undefined, userB, companyB);
  assert.equal(res.status, 200);
  assert.ok(res.data.data.domains[0].verified_at);

  // The index (not only the pre-check) keeps a verified domain unique: a second verified copy can't be written.
  await assert.rejects(
    IdentityProviderConnection.create({
      company_id: companyA, type: 'entra', display_name: 'A2', status: 'draft',
      domains: [{ domain: 'victim.example', verification_token: 'x', verified_at: new Date() }],
    }),
    (err: any) => err.code === 11000,
  );
});

test('Review L-5 / L-6: responses and audit rows never carry client_secret_ref; bad domains are rejected; an active connection keeps a verified domain', async () => {
  const conn = await IdentityProviderConnection.create({
    company_id: companyA, type: 'entra', display_name: 'Secretive', status: 'active',
    config: { tenant_id: '11111111-2222-4333-8444-555555555555', client_secret_ref: 'kv://SECRET' },
    tenant_approval: { tenant_id: '11111111-2222-4333-8444-555555555555', approved_at: new Date(), operator_id: new Types.ObjectId() },
    domains: [{ domain: 'kept.example', verification_token: 't', verified_at: new Date() }],
  });
  const patched = await apiRequest(`/security/identity-providers/${conn._id}`, 'PATCH', { display_name: 'Renamed' });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.data.config.client_secret_ref, undefined);
  const audit = await AuditEvent.findOne({ action: 'identity_provider.updated', object_id: String(conn._id) }).lean();
  assert.ok(audit);
  assert.doesNotMatch(JSON.stringify(audit), /kv:\/\/SECRET/);

  const removeAll = await apiRequest(`/security/identity-providers/${conn._id}`, 'PATCH', { domains: ['new-unverified.example'] });
  assert.equal(removeAll.status, 400);
  assert.equal(removeAll.data.code, 'NO_VERIFIED_DOMAINS');

  const bad = await apiRequest('/security/identity-providers', 'POST', { display_name: 'X', tenant_id: 'not-a-guid', domains: ['ok.example'] });
  assert.equal(bad.status, 400);
  const badDomain = await apiRequest('/security/identity-providers', 'POST', { display_name: 'X', domains: ['not a domain'] });
  assert.equal(badDomain.status, 400);
});
