// server/src/scripts/walk-server.ts — Plan 7.5: a real backend for the browser walk (client/e2e-real/walk.mjs).
//   npm run walk:server
// In-memory Mongo (nothing shared, no Atlas), the full app on port 5000, a platform operator and one organisation with
// an active Super Admin and some members. Both sign in through the real hosted pages with a password and a TOTP code.
// Writes the sign-in details to WALK_CREDS (default D:/karbexa-test-tmp/walk/creds.json), prints READY, and runs until stopped.
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import * as jose from 'jose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { generateSecret } from 'otplib';

const SPA = process.env.WALK_SPA_ORIGIN || 'http://127.0.0.1:4173';
const PORT = Number(process.env.WALK_PORT || 5000);

async function main() {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const gen = async () => jose.exportJWK((await jose.generateKeyPair('RS256', { extractable: true })).privateKey);
  const operatorKey = { ...(await gen()), kid: 'operator-walk' };
  Object.assign(process.env, {
    NODE_ENV: 'development', MONGODB_URI: mongo.getUri(), DB_NAME: 'walk',
    ID_ISSUER_ORIGIN: `http://id.karbexa.localhost:${PORT}`, ADMIN_SPA_ORIGIN: SPA, OPERATOR_SPA_ORIGIN: SPA, PRODUCTS_SPA_ORIGIN: SPA, CLIENT_URL: SPA,
    TRUST_PROXY: '0', AUTH_RATE_LIMIT: '100000', GLOBAL_RATE_LIMIT: '100000', MOCK_EMAIL: 'true',
    ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    OIDC_COOKIE_KEYS: crypto.randomBytes(32).toString('base64url'),
    IDENTITY_TENANT_KEY: JSON.stringify({ ...(await gen()), kid: 'tenant-walk' }),
    IDENTITY_SERVICES_KEY: JSON.stringify({ ...(await gen()), kid: 'services-walk' }),
    IDENTITY_OPERATOR_KEY: JSON.stringify(operatorKey),
  });
  delete process.env.ENTRA_CLIENT_ID;

  const { connectDB } = await import('../config/db');
  await connectDB();
  const { createServer } = await import('../app');
  const app = await createServer();
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', () => r()));
  const M = await import('../models');
  const { seedProductRegistry } = await import('../lib/productCatalog');
  const { encrypt } = await import('../lib/cryptoService');
  await seedProductRegistry();

  const OP_PASSWORD = 'Walk-Operator-Passw0rd!x';
  const opSecret = generateSecret();
  const op = await M.OperatorAccount.create({
    email: 'walk.op@karbexa.test', full_name: 'Walk Operator', password_hash: await bcrypt.hash(OP_PASSWORD, 12), roles: ['platform_admin'], status: 'active',
    mfa: { enabled: true, secret_enc: encrypt(opSecret), verified_at: new Date() },
  } as any);
  const opTok = await new jose.SignJWT({ token_use: 'access' })
    .setProtectedHeader({ alg: 'RS256', kid: 'operator-walk', typ: 'at+jwt' })
    .setIssuer(`http://id.karbexa.localhost:${PORT}/realms/operator`).setAudience('urn:karbexa:operator').setSubject(String(op._id)).setIssuedAt().setExpirationTime('6h')
    .sign(await jose.importJWK(operatorKey, 'RS256'));
  const opApi = (p: string, body: unknown) => fetch(`http://127.0.0.1:${PORT}/operator/v1${p}`, {
    method: 'POST', headers: { authorization: `Bearer ${opTok}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => r.json() as Promise<any>);

  // One organisation through the real provisioning route (roles, permissions, security policy, entitlements).
  const prov = await opApi('/orgs', { name: 'Walk Co', slug: 'walkco', plan_key: 'professional', first_admin: { email: 'admin@walkco.test', full_name: 'Walk Admin' } });
  const cid = new Types.ObjectId(prov.data.id as string);
  await opApi('/orgs', { name: 'Second Co', slug: 'secondco', plan_key: 'starter', first_admin: { email: 'admin@secondco.test', full_name: 'Second Admin' } });

  const PASSWORD = 'Walk-Admin-Passw0rd!x';
  const secret = generateSecret();
  const identity = await M.Identity.create({
    email: 'admin@walkco.test', full_name: 'Walk Admin', password_hash: await bcrypt.hash(PASSWORD, 12), password_changed_at: new Date(), email_verified_at: new Date(),
    mfa: { totp_secret_enc: encrypt(secret), totp_enabled: true, recovery_codes_hash: [], email_otp_enabled: false }, status: 'active',
  } as any);
  await M.User.updateOne({ company_id: cid, email: 'admin@walkco.test' }, { $set: { identity_id: identity._id, lifecycle_state: 'active', is_active: true } });

  // A few members, departments and groups so lists have rows.
  const depts = await M.Department.insertMany(['Engineering', 'Sales', 'Support'].map((n) => ({ company_id: cid, name: n, slug: n.toLowerCase(), type: 'department', is_active: true })));
  const members = Array.from({ length: 24 }, (_, i) => ({
    company_id: cid, full_name: `Member ${i + 1}`, email: `member${i + 1}@walkco.test`, password_hash: 'legacy-unused', employee_id: `W-${i + 1}`, role: 'Employee',
    lifecycle_state: i % 8 === 0 ? 'invited' : 'active', is_active: i % 8 !== 0, department_id: depts[i % 3]._id,
  }));
  await M.User.insertMany(members);
  const admin = await M.User.findOne({ company_id: cid, email: 'admin@walkco.test' });
  await M.Group.insertMany([{ company_id: cid, name: 'Everyone', type: 'static', is_active: true, created_by: admin?._id }, { company_id: cid, name: 'Leads', type: 'static', is_active: true, created_by: admin?._id }]);

  const out = process.env.WALK_CREDS || 'D:/karbexa-test-tmp/walk/creds.json';
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({
    operator: { email: 'walk.op@karbexa.test', password: OP_PASSWORD, totp_secret: opSecret },
    admin: { email: 'admin@walkco.test', password: PASSWORD, totp_secret: secret },
    org_id: String(cid),
  }, null, 1));
  console.log(`READY on http://127.0.0.1:${PORT}`);
  const stop = async () => { server.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
main().catch((e) => { console.error('WALK SERVER CRASH', e); process.exit(1); });
