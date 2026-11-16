// server/src/scripts/__tests__/sendClaimEmails.test.ts
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  runSendClaimEmails,
  PLACEHOLDER_PASSWORD_HASH,
  isUsablePassword,
  parseArgs,
} from '../send-claim-emails';
import { User } from '../../models/User.model';
import { Identity } from '../../models/Identity.model';
import { Company } from '../../models/Company.model';
import { Invitation } from '../../models/Invitation.model';
import { createServer } from '../../app';
import { getIdentityConfig } from '../../identity/config';
import http from 'http';
import { AddressInfo } from 'net';

let mongo: MongoMemoryServer;
let server: http.Server;
let baseUrl: string;

const companyId = new Types.ObjectId();
let sentClaims: Array<{ email: string; claim_link: string }> = [];
let sentWelcomes: Array<{ email: string; invite_link?: string }> = [];

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'claim_emails_test' });

  const app = await createServer();
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;

  await Company.create({
    _id: companyId,
    name: 'Claim Corp',
    slug: 'claim-corp',
    status: 'active',
    is_active: true,
  });
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise((resolve) => setTimeout(resolve, 300));
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  sentClaims = [];
  sentWelcomes = [];
  await User.deleteMany({});
  await Identity.deleteMany({});
  await Invitation.deleteMany({});
});

const mockClaimSender = async (params: any) => {
  sentClaims.push({ email: params.email, claim_link: params.claim_link });
};

const mockWelcomeSender = async (params: any) => {
  sentWelcomes.push({ email: params.email, invite_link: params.invite_link });
};

test('parseArgs parses CLI arguments properly', () => {
  const r1 = parseArgs(['--org-id=6650a1b2c3d4e5f6a7b8c9d0', '--real', '--resend']);
  assert.equal(r1.orgId, '6650a1b2c3d4e5f6a7b8c9d0');
  assert.equal(r1.dryRun, false);
  assert.equal(r1.resend, true);

  const r2 = parseArgs(['--dry-run', '--org-id', '6650a1b2c3d4e5f6a7b8c9d1']);
  assert.equal(r2.orgId, '6650a1b2c3d4e5f6a7b8c9d1');
  assert.equal(r2.dryRun, true);
  assert.equal(r2.resend, false);
});

test('isUsablePassword identifies placeholder hashes vs real passwords', async () => {
  assert.equal(isUsablePassword(null), false);
  assert.equal(isUsablePassword(''), false);
  assert.equal(isUsablePassword(PLACEHOLDER_PASSWORD_HASH), false);
  assert.equal(isUsablePassword('$2b$12$unmigrated_seeded_password_placeholder'), false);

  const realHash = await bcrypt.hash('RealSecret123!', 10);
  assert.equal(isUsablePassword(realHash), true);
});

test('Target selection: active placeholder vs invited vs federated vs real password', async () => {
  const realHash = await bcrypt.hash('RealPass123!', 10);

  // 1. Target 1: Active with placeholder hash (no federation) -> claim target
  const idn1 = await Identity.create({
    email: 'claim.target@test.com',
    full_name: 'Claim Target',
    status: 'active',
    password_hash: PLACEHOLDER_PASSWORD_HASH,
    federated_links: [],
  });
  await User.create({
    company_id: companyId,
    identity_id: idn1._id,
    email: idn1.email,
    full_name: idn1.full_name,
    lifecycle_state: 'active',
    is_active: true,
    password_hash: PLACEHOLDER_PASSWORD_HASH,
  });

  // 2. Target 2: Invited user -> invite target
  const idn2 = await Identity.create({
    email: 'invited.target@test.com',
    full_name: 'Invited Target',
    status: 'active',
    password_hash: null,
    federated_links: [],
  });
  await User.create({
    company_id: companyId,
    identity_id: idn2._id,
    email: idn2.email,
    full_name: idn2.full_name,
    lifecycle_state: 'invited',
    is_active: false,
    password_hash: 'x',
  });

  // 3. Skipped: Entra-linked user
  const idn3 = await Identity.create({
    email: 'entra.user@test.com',
    full_name: 'Entra User',
    status: 'active',
    federated_links: [{
      connection_id: new Types.ObjectId(),
      issuer: 'https://login.microsoftonline.com/tenant/v2.0',
      subject: 'entra-oid-1',
      linked_at: new Date(),
    }],
  });
  await User.create({
    company_id: companyId,
    identity_id: idn3._id,
    email: idn3.email,
    full_name: idn3.full_name,
    lifecycle_state: 'active',
    is_active: true,
    password_hash: PLACEHOLDER_PASSWORD_HASH,
  });

  // 4. Skipped: Active with real password
  const idn4 = await Identity.create({
    email: 'real.pass@test.com',
    full_name: 'Real Pass User',
    status: 'active',
    password_hash: realHash,
    federated_links: [],
  });
  await User.create({
    company_id: companyId,
    identity_id: idn4._id,
    email: idn4.email,
    full_name: idn4.full_name,
    lifecycle_state: 'active',
    is_active: true,
    password_hash: realHash,
  });

  // 5. Skipped: Inactive/deactivated user
  const idn5 = await Identity.create({
    email: 'deactivated.user@test.com',
    full_name: 'Deactivated User',
    status: 'active',
    password_hash: PLACEHOLDER_PASSWORD_HASH,
  });
  await User.create({
    company_id: companyId,
    identity_id: idn5._id,
    email: idn5.email,
    full_name: idn5.full_name,
    lifecycle_state: 'deactivated',
    is_active: false,
    password_hash: PLACEHOLDER_PASSWORD_HASH,
  });

  // Dry run
  const dryStats = await runSendClaimEmails({
    orgId: companyId.toString(),
    dryRun: true,
    claimEmailSender: mockClaimSender,
    welcomeEmailSender: mockWelcomeSender,
  });

  assert.equal(dryStats.scanned, 5);
  assert.equal(dryStats.claimTargets, 1);
  assert.equal(dryStats.inviteTargets, 1);
  assert.equal(dryStats.skippedFederated, 1);
  assert.equal(dryStats.skippedHasPassword, 1);
  assert.equal(dryStats.skippedInactive, 1);
  assert.equal(dryStats.emailsSent, 0);
  assert.equal(await Invitation.countDocuments({}), 0);
  assert.equal(sentClaims.length, 0);
  assert.equal(sentWelcomes.length, 0);

  // Real run
  const realStats = await runSendClaimEmails({
    orgId: companyId.toString(),
    dryRun: false,
    claimEmailSender: mockClaimSender,
    welcomeEmailSender: mockWelcomeSender,
  });

  assert.equal(realStats.emailsSent, 2);
  assert.equal(await Invitation.countDocuments({}), 2);
  assert.equal(sentClaims.length, 1);
  assert.equal(sentClaims[0].email, 'claim.target@test.com');
  assert.match(sentClaims[0].claim_link, /\/onboarding\?token=[0-9a-f]{64}&email=claim\.target%40test\.com/);
  assert.equal(sentWelcomes.length, 1);
  assert.equal(sentWelcomes[0].email, 'invited.target@test.com');
  assert.match(sentWelcomes[0].invite_link!, /\/onboarding\?token=[0-9a-f]{64}&email=invited\.target%40test\.com/);

  // Idempotency: re-running without --resend sends 0 and creates 0 new tokens
  sentClaims = [];
  sentWelcomes = [];
  const secondStats = await runSendClaimEmails({
    orgId: companyId.toString(),
    dryRun: false,
    resend: false,
    claimEmailSender: mockClaimSender,
    welcomeEmailSender: mockWelcomeSender,
  });
  assert.equal(secondStats.emailsSent, 0);
  assert.equal(secondStats.skippedHasActiveToken, 2);
  assert.equal(await Invitation.countDocuments({}), 2);
  assert.equal(sentClaims.length, 0);
  assert.equal(sentWelcomes.length, 0);

  // Resend: re-running with --resend creates fresh tokens and sends emails
  const resendStats = await runSendClaimEmails({
    orgId: companyId.toString(),
    dryRun: false,
    resend: true,
    claimEmailSender: mockClaimSender,
    welcomeEmailSender: mockWelcomeSender,
  });
  assert.equal(resendStats.emailsSent, 2);
  assert.equal(sentClaims.length, 1);
  assert.equal(sentWelcomes.length, 1);
});

test('Generated claim token works once with /api/v1/auth/setup-password and requires TOTP', async () => {
  const idn = await Identity.create({
    email: 'claim.flow@test.com',
    full_name: 'Flow User',
    status: 'active',
    password_hash: PLACEHOLDER_PASSWORD_HASH,
    mfa: { totp_enabled: false },
  });
  const user = await User.create({
    company_id: companyId,
    identity_id: idn._id,
    email: idn.email,
    full_name: idn.full_name,
    lifecycle_state: 'active',
    is_active: true,
    password_hash: PLACEHOLDER_PASSWORD_HASH,
  });

  await runSendClaimEmails({
    orgId: companyId.toString(),
    dryRun: false,
    claimEmailSender: mockClaimSender,
    welcomeEmailSender: mockWelcomeSender,
  });

  assert.equal(sentClaims.length, 1);
  const tokenMatch = sentClaims[0].claim_link.match(/token=([0-9a-f]{64})/);
  assert.ok(tokenMatch);
  const rawToken = tokenMatch[1];

  // 1. Consume token with /api/v1/auth/setup-password
  const setupRes = await fetch(`${baseUrl}/auth/setup-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'claim.flow@test.com',
      token: rawToken,
      newPassword: 'MyStrongNewPassword123!',
    }),
  });
  const setupJson = await setupRes.json() as any;
  assert.equal(setupRes.status, 200);
  assert.equal(setupJson.success, true);

  // Identity now has updated password
  const updatedIdn = await Identity.findById(idn._id);
  assert.ok(updatedIdn?.password_hash);
  assert.notEqual(updatedIdn?.password_hash, PLACEHOLDER_PASSWORD_HASH);
  assert.ok(await bcrypt.compare('MyStrongNewPassword123!', updatedIdn!.password_hash!));

  // TOTP is NOT enrolled yet (03 §4.3: TOTP enrolment is required on first login)
  assert.equal(updatedIdn?.mfa?.totp_secret_enc, undefined);

  // 2. Token cannot be reused (single-use)
  const reuseRes = await fetch(`${baseUrl}/auth/setup-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'claim.flow@test.com',
      token: rawToken,
      newPassword: 'AnotherPassword123!',
    }),
  });
  const reuseJson = await reuseRes.json() as any;
  assert.equal(reuseRes.status, 409);
  assert.equal(reuseJson.code, 'INVITE_ALREADY_USED');
});

test('Password login attempt for placeholder-hash identity returns 401 and never throws', async () => {
  const idn = await Identity.create({
    email: 'placeholder.login@test.com',
    full_name: 'Placeholder User',
    status: 'active',
    password_hash: PLACEHOLDER_PASSWORD_HASH,
  });
  await User.create({
    company_id: companyId,
    identity_id: idn._id,
    email: idn.email,
    full_name: idn.full_name,
    lifecycle_state: 'active',
    is_active: true,
    password_hash: PLACEHOLDER_PASSWORD_HASH,
  });

  const jar = new Map<string, string>();
  async function jarFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    const res = await fetch(url, { ...init, headers, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const value = kv.slice(i + 1).trim();
      if (value) jar.set(kv.slice(0, i).trim(), value); else jar.delete(kv.slice(0, i).trim());
    }
    return res;
  }

  const TENANT = `${baseUrl.replace('/api/v1', '')}/realms/tenant`;
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const cfg = getIdentityConfig();
  const authUrl = `${TENANT}/oauth/authorize?${new URLSearchParams({
    client_id: 'karbexa-admin-spa',
    response_type: 'code',
    redirect_uri: `${cfg.adminSpaOrigin}/auth/callback`,
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'st-test',
    nonce: 'n-test',
    resource: 'urn:karbexa:admin',
  })}`;

  const res = await jarFetch(authUrl);
  const interactionLoc = res.headers.get('location') || '';
  const uid = /\/interaction\/([^/?#]+)/.exec(interactionLoc)?.[1];
  assert.ok(uid);

  const postRes = await jarFetch(`${TENANT}/interaction/${uid}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'placeholder.login@test.com', password: 'SomeAttemptedPassword!' }).toString(),
  });

  // Must return normal 401 response and never 500 crash
  assert.equal(postRes.status, 401);
  const html = await postRes.text();
  assert.match(html, /Incorrect email or password/);
});
