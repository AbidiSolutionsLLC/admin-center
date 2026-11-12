// server/src/controllers/__tests__/streamTickets.test.ts
// Tests for Audit SSE Stream Tickets: POST /api/v1/stream-tickets and GET /api/v1/audit-logs/stream?ticket= (05 §3, A3-6)
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
process.env.OIDC_COOKIE_KEYS = process.env.OIDC_COOKIE_KEYS || crypto.randomBytes(32).toString('base64url');
process.env.ALLOW_STANDALONE_MONGO = 'true';
process.env.STREAM_RECHECK_MS = '50'; // fast re-check for test speed

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
import { StreamTicket } from '../../models/StreamTicket.model';
import { loadRealmKeys } from '../../identity/keys';
import { getIdentityConfig } from '../../identity/config';
import { sha256hex } from '../../platform/streamTickets';

let mongo: MongoMemoryServer;
let server: http.Server;
let baseUrl: string;

const companyA = new Types.ObjectId();
const companyB = new Types.ObjectId();

let itAdminA: IUser;
let employeeA: IUser;
let itAdminB: IUser;

let itAdminIdnA: IIdentity;
let employeeIdnA: IIdentity;
let itAdminIdnB: IIdentity;

const DEFAULT_PASSWORD = 'Test-Passw0rd!123';

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'stream_tickets_test' });

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

  const [roleItAdminA, roleEmployeeA, roleItAdminB] = await Promise.all([
    Role.create({ company_id: companyA, name: 'IT Admin', type: 'system', description: 'IT Admin' }),
    Role.create({ company_id: companyA, name: 'Employee', type: 'system', description: 'Employee' }),
    Role.create({ company_id: companyB, name: 'IT Admin', type: 'system', description: 'IT Admin' }),
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

  [itAdminIdnA, employeeIdnA, itAdminIdnB] = await Promise.all([
    makeIdentity('itadmin@org-a.test', 'IT Admin A'),
    makeIdentity('employee@org-a.test', 'Employee A'),
    makeIdentity('itadmin@org-b.test', 'IT Admin B'),
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

  [itAdminA, employeeA, itAdminB] = await Promise.all([
    makeUser(itAdminIdnA, companyA, 'IT Admin'),
    makeUser(employeeIdnA, companyA, 'Employee'),
    makeUser(itAdminIdnB, companyB, 'IT Admin'),
  ]);

  await UserRole.insertMany([
    { user_id: itAdminA._id, role_id: roleItAdminA._id, company_id: companyA, assigned_by: itAdminA._id },
    { user_id: employeeA._id, role_id: roleEmployeeA._id, company_id: companyA, assigned_by: itAdminA._id },
    { user_id: itAdminB._id, role_id: roleItAdminB._id, company_id: companyB, assigned_by: itAdminB._id },
  ]);
});

after(async () => {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await StreamTicket.deleteMany({});
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

test('A3-6: POST /api/v1/stream-tickets requires authentication (401 without token)', async () => {
  const res = await fetch(`${baseUrl}/api/v1/stream-tickets`, { method: 'POST' });
  assert.equal(res.status, 401);
});

test('A3-6: POST /api/v1/stream-tickets issues single-use 60s ticket and stores sha256', async () => {
  const { token, sid } = await mintToken(itAdminA, companyA);

  const res = await fetch(`${baseUrl}/api/v1/stream-tickets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');

  const body = (await res.json()) as { success: boolean; data: { ticket: string; expires_in: number } };
  assert.equal(body.success, true);
  assert.ok(typeof body.data.ticket === 'string' && body.data.ticket.length > 20);
  assert.equal(body.data.expires_in, 60);

  // Verify only SHA-256 hash was stored, bound to member/company/sid
  const rawTicket = body.data.ticket;
  const hash = sha256hex(rawTicket);
  const row = await StreamTicket.findOne({ ticketHash: hash });
  assert.ok(row);
  assert.equal(row.member.toString(), itAdminA._id.toString());
  assert.equal(row.company.toString(), companyA.toString());
  assert.equal(row.sid, sid);
});

test('A3-6: GET /api/v1/audit-logs/stream?ticket= consumes ticket atomically; reuse returns 401', async () => {
  const { token } = await mintToken(itAdminA, companyA);

  const issueRes = await fetch(`${baseUrl}/api/v1/stream-tickets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const { data } = (await issueRes.json()) as { data: { ticket: string } };
  const ticket = data.ticket;

  // First consumption: establishes stream
  const controller = new AbortController();
  const streamRes = await fetch(`${baseUrl}/api/v1/audit-logs/stream?ticket=${ticket}`, {
    signal: controller.signal,
  });

  assert.equal(streamRes.status, 200);
  assert.equal(streamRes.headers.get('content-type'), 'text/event-stream');

  // Second consumption with the same ticket: MUST fail with 401 INVALID_STREAM_TICKET
  const reuseRes = await fetch(`${baseUrl}/api/v1/audit-logs/stream?ticket=${ticket}`);
  assert.equal(reuseRes.status, 401);
  const reuseBody = (await reuseRes.json()) as { code: string };
  assert.equal(reuseBody.code, 'INVALID_STREAM_TICKET');

  controller.abort();
});

test('A3-6: GET /api/v1/audit-logs/stream?ticket= with expired ticket returns 401', async () => {
  const { sid } = await mintToken(itAdminA, companyA);
  const ticket = 'expired_ticket_12345';
  await StreamTicket.create({
    ticketHash: sha256hex(ticket),
    member: itAdminA._id,
    company: companyA,
    sid,
    expiresAt: new Date(Date.now() - 1000), // already expired
  });

  const res = await fetch(`${baseUrl}/api/v1/audit-logs/stream?ticket=${ticket}`);
  assert.equal(res.status, 401);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'INVALID_STREAM_TICKET');
});

test('A3-6: ticket bound to non-admin role returns 403 INSUFFICIENT_ROLE', async () => {
  const { token } = await mintToken(employeeA, companyA);

  const issueRes = await fetch(`${baseUrl}/api/v1/stream-tickets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const { data } = (await issueRes.json()) as { data: { ticket: string } };

  const res = await fetch(`${baseUrl}/api/v1/audit-logs/stream?ticket=${data.ticket}`);
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'INSUFFICIENT_ROLE');
});

test('A3-6: revoked session ends active stream with event: revoked', async () => {
  const { token, sid } = await mintToken(itAdminA, companyA);

  const issueRes = await fetch(`${baseUrl}/api/v1/stream-tickets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const { data } = (await issueRes.json()) as { data: { ticket: string } };

  const controller = new AbortController();
  const streamRes = await fetch(`${baseUrl}/api/v1/audit-logs/stream?ticket=${data.ticket}`, {
    signal: controller.signal,
  });

  assert.equal(streamRes.status, 200);

  const reader = streamRes.body?.getReader();
  assert.ok(reader);

  const decoder = new TextDecoder();
  let receivedChunks = '';

  // Read initial chunk (CONNECTED)
  const firstChunk = await reader.read();
  receivedChunks += decoder.decode(firstChunk.value || new Uint8Array());
  assert.ok(receivedChunks.includes('CONNECTED'));

  // Mark session revoked in database
  await Session.updateOne({ _id: sid }, { $set: { revoked_at: new Date() } });

  // Read until stream ends or revoked event is received
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedChunks += decoder.decode(value);
    if (receivedChunks.includes('event: revoked')) {
      break;
    }
  }

  assert.ok(receivedChunks.includes('event: revoked'), 'Stream must emit event: revoked on session termination');
  controller.abort();
});

test('A3-6: header-auth fallback still works for authorized requests without ticket', async () => {
  const { token } = await mintToken(itAdminA, companyA);

  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/api/v1/audit-logs/stream`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  controller.abort();
});
