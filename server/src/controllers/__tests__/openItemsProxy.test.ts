// server/src/controllers/__tests__/openItemsProxy.test.ts
// Tests for Open-items proxy: GET /api/v1/people/:id/product-open-items (07 §6, contract §2.1, A3-5)
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

import { createServer } from '../../app';
import { Identity, IIdentity } from '../../models/Identity.model';
import { User, IUser } from '../../models/User.model';
import { Company } from '../../models/Company.model';
import { Role } from '../../models/Role.model';
import { UserRole } from '../../models/UserRole.model';
import { Session } from '../../models/Session.model';
import { loadRealmKeys } from '../../identity/keys';
import { getIdentityConfig } from '../../identity/config';
import { resetProductsInternalToken } from '../../platform/productsInternalToken';
import * as openItemsModule from '../../platform/openItems';

let mongo: MongoMemoryServer;
let server: http.Server;
let baseUrl: string;

const companyA = new Types.ObjectId();
const companyB = new Types.ObjectId();

let hrAdminA: IUser;
let employeeA: IUser;
let employeeB: IUser;

let hrAdminIdnA: IIdentity;
let employeeIdnA: IIdentity;
let employeeIdnB: IIdentity;

const DEFAULT_PASSWORD = 'Test-Passw0rd!123';

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'open_items_proxy_test' });

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

  const [roleHrAdminA, roleEmployeeA, roleEmployeeB] = await Promise.all([
    Role.create({ company_id: companyA, name: 'HR Admin', type: 'system', description: 'HR Admin' }),
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
      mfa: { totp_enabled: false },
    });

  [hrAdminIdnA, employeeIdnA, employeeIdnB] = await Promise.all([
    makeIdentity('hradmin@org-a.test', 'HR Admin A'),
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
      employment_type: 'full_time',
      authz_ver: 1,
    });

  [hrAdminA, employeeA, employeeB] = await Promise.all([
    makeUser(hrAdminIdnA, companyA, 'HR Admin'),
    makeUser(employeeIdnA, companyA, 'Employee'),
    makeUser(employeeIdnB, companyB, 'Employee'),
  ]);

  await UserRole.insertMany([
    { user_id: hrAdminA._id, role_id: roleHrAdminA._id, company_id: companyA, assigned_by: hrAdminA._id },
    { user_id: employeeA._id, role_id: roleEmployeeA._id, company_id: companyA, assigned_by: hrAdminA._id },
    { user_id: employeeB._id, role_id: roleEmployeeB._id, company_id: companyB, assigned_by: employeeB._id },
  ]);
});

after(async () => {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  resetProductsInternalToken();
  delete process.env.PRODUCTS_INTERNAL_URL;
  delete process.env.PLATFORM_SUBSCRIPTIONS;
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
    amr: ['pwd'],
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

test('A3-5: unauthenticated request to GET /people/:id/product-open-items = 401', async () => {
  const res = await fetch(`${baseUrl}/api/v1/people/${employeeA._id}/product-open-items`);
  assert.equal(res.status, 401);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'NO_TOKEN');
});

test('A3-5: non-PEOPLE_MANAGERS role (Employee) = 403 INSUFFICIENT_ROLE', async () => {
  const { token } = await mintToken(employeeA, companyA);
  const res = await fetch(`${baseUrl}/api/v1/people/${employeeA._id}/product-open-items`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'INSUFFICIENT_ROLE');
});

test('A3-5: cross-tenant lookup (org A admin querying org B user) = 404 NOT_FOUND', async () => {
  const { token } = await mintToken(hrAdminA, companyA);
  const res = await fetch(`${baseUrl}/api/v1/people/${employeeB._id}/product-open-items`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string; success: boolean };
  assert.equal(body.code, 'NOT_FOUND');
  assert.equal(body.success, false);
});

test('A3-5: invalid user ID format = 400 VALIDATION_ERROR', async () => {
  const { token } = await mintToken(hrAdminA, companyA);
  const res = await fetch(`${baseUrl}/api/v1/people/not-an-objectid/product-open-items`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('A3-5: successful open items proxy forwards products counts with correct headers', async () => {
  process.env.PRODUCTS_INTERNAL_URL = 'http://127.0.0.1:4000';

  const mockProducts = {
    people: { pending_leave_requests: 1, pending_approvals_as_manager: 2 },
    projects: { open_assigned_tasks: 3, owned_projects: 0 },
    sign: { agreements_as_sender_pending: 1, agreements_awaiting_signature: 0 },
    desk: { assigned_open_tickets: 4 },
  };

  let capturedUrl = '';
  let capturedHeaders: Record<string, string> = {};

  const mockFetch = async (input: any, init?: any): Promise<any> => {
    capturedUrl = String(input);
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          member_id: employeeA._id.toString(),
          org_id: companyA.toString(),
          products: mockProducts,
        },
      }),
    };
  };

  const originalFetchMemberOpenItems = openItemsModule.fetchMemberOpenItems;
  (openItemsModule as any).fetchMemberOpenItems = (orgId: string, memberId: string) => {
    return originalFetchMemberOpenItems(orgId, memberId, {
      fetchImpl: mockFetch as any,
      token: 'mock-internal-service-token-xyz',
    });
  };

  try {
    const { token } = await mintToken(hrAdminA, companyA);
    const res = await fetch(`${baseUrl}/api/v1/people/${employeeA._id}/product-open-items`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { success: boolean; data: { products: any } };
    assert.equal(body.success, true);
    assert.deepEqual(body.data.products, mockProducts);

    assert.equal(
      capturedUrl,
      `http://127.0.0.1:4000/api/v1/internal/members/${employeeA._id}/open-items?org_id=${companyA}`
    );
    assert.equal(capturedHeaders.Authorization, 'Bearer mock-internal-service-token-xyz');
    assert.equal(capturedHeaders.Accept, 'application/json');
  } finally {
    (openItemsModule as any).fetchMemberOpenItems = originalFetchMemberOpenItems;
  }
});

test('A3-5: monolith failure (500) returns 503 PRODUCTS_UNAVAILABLE', async () => {
  process.env.PRODUCTS_INTERNAL_URL = 'http://127.0.0.1:4000';

  const mockFetch = async (): Promise<any> => {
    return {
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        error: 'Monolith DB error',
        code: 'DB_ERROR',
      }),
    };
  };

  const originalFetchMemberOpenItems = openItemsModule.fetchMemberOpenItems;
  (openItemsModule as any).fetchMemberOpenItems = (orgId: string, memberId: string) => {
    return originalFetchMemberOpenItems(orgId, memberId, {
      fetchImpl: mockFetch as any,
      token: 'mock-token',
    });
  };

  try {
    const { token } = await mintToken(hrAdminA, companyA);
    const res = await fetch(`${baseUrl}/api/v1/people/${employeeA._id}/product-open-items`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 503);
    const body = (await res.json()) as { success: boolean; code: string };
    assert.equal(body.success, false);
    assert.equal(body.code, 'PRODUCTS_UNAVAILABLE');
  } finally {
    (openItemsModule as any).fetchMemberOpenItems = originalFetchMemberOpenItems;
  }
});

test('A3-5: monolith unreachable / network timeout returns 503 PRODUCTS_UNAVAILABLE', async () => {
  process.env.PRODUCTS_INTERNAL_URL = 'http://127.0.0.1:4000';

  const mockFetch = async (): Promise<any> => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:4000');
  };

  const originalFetchMemberOpenItems = openItemsModule.fetchMemberOpenItems;
  (openItemsModule as any).fetchMemberOpenItems = (orgId: string, memberId: string) => {
    return originalFetchMemberOpenItems(orgId, memberId, {
      fetchImpl: mockFetch as any,
      token: 'mock-token',
    });
  };

  try {
    const { token } = await mintToken(hrAdminA, companyA);
    const res = await fetch(`${baseUrl}/api/v1/people/${employeeA._id}/product-open-items`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 503);
    const body = (await res.json()) as { success: boolean; code: string };
    assert.equal(body.success, false);
    assert.equal(body.code, 'PRODUCTS_UNAVAILABLE');
  } finally {
    (openItemsModule as any).fetchMemberOpenItems = originalFetchMemberOpenItems;
  }
});

test('A3-5: monolith base URL extracted from PLATFORM_SUBSCRIPTIONS', async () => {
  process.env.PLATFORM_SUBSCRIPTIONS = JSON.stringify([
    {
      name: 'karbexa-products-backend',
      url: 'http://127.0.0.1:8999/api/v1/platform/nudge',
      secret_env: 'PLATFORM_SUB_SECRET_P',
    },
  ]);

  let capturedUrl = '';
  const mockFetch = async (input: any): Promise<any> => {
    capturedUrl = String(input);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { products: {} },
      }),
    };
  };

  const originalFetchMemberOpenItems = openItemsModule.fetchMemberOpenItems;
  (openItemsModule as any).fetchMemberOpenItems = (orgId: string, memberId: string) => {
    return originalFetchMemberOpenItems(orgId, memberId, {
      fetchImpl: mockFetch as any,
      token: 'mock-token',
    });
  };

  try {
    const { token } = await mintToken(hrAdminA, companyA);
    const res = await fetch(`${baseUrl}/api/v1/people/${employeeA._id}/product-open-items`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    assert.match(capturedUrl, /^http:\/\/127\.0\.0\.1:8999\//);
  } finally {
    (openItemsModule as any).fetchMemberOpenItems = originalFetchMemberOpenItems;
  }
});
