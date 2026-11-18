// server/src/scripts/seed-demo.ts — Plan 04 C8: one demo organisation, built through the real API.
//
//   npm run seed:demo               against the database in server/.env (refused when NODE_ENV=production)
//   npm run seed:demo -- --memory   against a throwaway in-memory database (tests this script; nothing is kept)
//
// Every write goes through the same routes the web apps use (operator provisioning, invite, the member's own
// set-password, departments, groups, app assignments), so audit entries and platform events are produced exactly as
// in real use and the products worker learns about every member. Nothing is inserted behind the API's back.
// Idempotent: if the demo organisation exists it prints the accounts and stops. To start over, reset the local
// databases (docs/DATABASE.md) and run `node scripts/dev.mjs --seed --demo`.
// Accounts and the shared demo password are printed and written to server/.local/demo-accounts.json (git-ignored).
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import mongoose, { Types } from 'mongoose';
import * as jose from 'jose';

const MEMORY = process.argv.includes('--memory');
const SLUG = 'acme-demo';
// No fixed default: this repo is public, so a committed password would be known to everyone. Random per run unless set.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || `Demo-${crypto.randomBytes(9).toString('base64url')}9!`;
const DOMAIN = 'acme-demo.test';
const OUT = path.resolve(__dirname, '..', '..', '.local', 'demo-accounts.json');

type Person = { key: string; name: string; dept: string; role: 'Super Admin' | 'HR Admin' | 'IT Admin' | 'Manager' | 'Employee'; manager?: string };
// The first admin is created by provisioning; everyone else is invited by that admin.
const FIRST_ADMIN = { key: 'admin', name: 'Amira Khan', email: `amira.khan@${DOMAIN}` };
const PEOPLE: Person[] = [
  { key: 'hr', name: 'Hassan Ali', dept: 'People & Culture', role: 'HR Admin' },
  { key: 'it', name: 'Irene Chen', dept: 'Support', role: 'IT Admin' },
  { key: 'eng_mgr', name: 'Omar Farooq', dept: 'Engineering', role: 'Manager' },
  { key: 'sales_mgr', name: 'Sara Malik', dept: 'Sales', role: 'Manager' },
  { key: 'support_lead', name: 'Daniel Brooks', dept: 'Support', role: 'Manager' },
  { key: 'dev1', name: 'Bilal Ahmed', dept: 'Engineering', role: 'Employee', manager: 'eng_mgr' },
  { key: 'dev2', name: 'Lina Haddad', dept: 'Engineering', role: 'Employee', manager: 'eng_mgr' },
  { key: 'dev3', name: 'Noah Wilson', dept: 'Engineering', role: 'Employee', manager: 'eng_mgr' },
  { key: 'designer', name: 'Maya Patel', dept: 'Engineering', role: 'Employee', manager: 'eng_mgr' },
  { key: 'sales1', name: 'Tariq Hussain', dept: 'Sales', role: 'Employee', manager: 'sales_mgr' },
  { key: 'sales2', name: 'Emma Johnson', dept: 'Sales', role: 'Employee', manager: 'sales_mgr' },
  { key: 'tech1', name: 'Yusuf Rahman', dept: 'Support', role: 'Employee', manager: 'support_lead' },
  { key: 'tech2', name: 'Chloe Martin', dept: 'Support', role: 'Employee', manager: 'support_lead' },
  { key: 'hr2', name: 'Zara Siddiqui', dept: 'People & Culture', role: 'Employee', manager: 'hr' },
  { key: 'finance', name: 'Ahmed Raza', dept: 'Sales', role: 'Employee', manager: 'sales_mgr' },
];
const emailOf = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@${DOMAIN}`;

// Product roles beyond the defaults (product key → role → who). Targets: `dept:<name>`, `group:<name>`, `user:<key>`.
const ACCESS: Array<{ product: string; role: string; target: string }> = [
  { product: 'people', role: 'employee', target: 'group:All Members' },
  { product: 'people', role: 'people_administrator', target: 'user:hr' },
  { product: 'people', role: 'hr', target: 'user:hr2' },
  { product: 'projects', role: 'team_member', target: 'dept:Engineering' },
  { product: 'projects', role: 'project_manager', target: 'user:eng_mgr' },
  { product: 'projects', role: 'project_administrator', target: 'user:admin' },
  { product: 'sign', role: 'sign_user', target: 'group:Managers' },
  { product: 'sign', role: 'sign_administrator', target: 'user:admin' },
  { product: 'desk', role: 'technician', target: 'dept:Support' },
  { product: 'desk', role: 'support_lead', target: 'user:support_lead' },
  { product: 'desk', role: 'desk_admin', target: 'user:it' },
];

async function main() {
  let mongo: { stop: () => Promise<unknown>; getUri: () => string } | null = null;
  if (MEMORY) {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    Object.assign(process.env, {
      NODE_ENV: 'development', MONGODB_URI: mongo.getUri(), DB_NAME: 'seed_demo_test', MOCK_EMAIL: 'true', TRUST_PROXY: '0',
      CLIENT_URL: 'http://admin.karbexa.localhost:5173', ADMIN_SPA_ORIGIN: 'http://admin.karbexa.localhost:5173',
      ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'), AUTH_RATE_LIMIT: '100000', GLOBAL_RATE_LIMIT: '100000',
    });
  } else {
    dotenv.config({ path: path.join(__dirname, '../../.env') });
    if (process.env.NODE_ENV === 'production') throw new Error('seed:demo refuses to run with NODE_ENV=production');
  }
  // Provisioning returns the first admin's invite token only with this switch outside production (operator/routes.ts).
  process.env.EXPOSE_INVITE_TOKEN = 'true';
  process.env.AUTH_RATE_LIMIT = process.env.AUTH_RATE_LIMIT || '100000';

  const { connectDB } = await import('../config/db');
  await connectDB();
  const M = await import('../models');

  const existing = await M.Company.findOne({ slug: SLUG }).select('_id').lean();
  if (existing) {
    console.log(`[seed:demo] The demo organisation "${SLUG}" already exists. Accounts: ${fs.existsSync(OUT) ? OUT : '(file missing; reset to re-create)'}`);
    await mongoose.disconnect();
    return;
  }

  const { createServer } = await import('../app');
  const app = await createServer();
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const { seedProductRegistry } = await import('../lib/productCatalog');
  await seedProductRegistry();
  const { loadRealmKeys } = await import('../identity/keys');
  const { getIdentityConfig, OPERATOR_AUDIENCE, ADMIN_AUDIENCE } = await import('../identity/config');
  const cfg = getIdentityConfig();
  const sign = async (realm: 'operator' | 'tenant', claims: Record<string, unknown>, sub: string, iss: string, aud: string) => {
    const jwk = (await loadRealmKeys(realm)).privateJwks.keys[0];
    return new jose.SignJWT({ token_use: 'access', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid as string, typ: 'at+jwt' })
      .setIssuer(iss).setAudience(aud).setSubject(sub).setIssuedAt().setExpirationTime('30m')
      .sign(await jose.importJWK(jwk, 'RS256'));
  };
  const call = async (token: string | null, method: string, url: string, body?: unknown) => {
    const res = await fetch(`${base}${url}`, {
      method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${json?.code ?? ''} ${json?.error ?? json?.message ?? ''}`.trim());
    return json;
  };

  // ── Operator: provision the organisation on the Enterprise plan (all four products) ──
  let operator = await M.OperatorAccount.findOne({ status: 'active', roles: 'platform_admin' });
  if (!operator && MEMORY) {
    operator = await M.OperatorAccount.create({ email: 'seed.op@karbexa.test', full_name: 'Seed Operator', password_hash: 'x', roles: ['platform_admin'], status: 'active' } as any);
  }
  if (!operator) throw new Error('No active platform_admin operator. Run `npm run seed:operator` first (dev.mjs does this).');
  const opSid = crypto.randomUUID();
  await M.OperatorSession.create({ _id: opSid, operator_id: operator._id, idle_expires_at: new Date(Date.now() + 1800e3) } as any);
  const opTok = await sign('operator', { sid: opSid }, String(operator._id), cfg.operatorIssuer, OPERATOR_AUDIENCE);
  const prov = await call(opTok, 'POST', '/operator/v1/orgs', {
    name: 'Acme Demo', slug: SLUG, plan_key: 'enterprise', first_admin: { email: FIRST_ADMIN.email, full_name: FIRST_ADMIN.name },
  });
  const orgId: string = prov.data.id;
  if (!prov.data.invite_token) throw new Error('Provisioning did not return the invite token (EXPOSE_INVITE_TOKEN only works outside production).');
  await call(null, 'POST', '/api/v1/auth/setup-password', { token: prov.data.invite_token, newPassword: DEMO_PASSWORD });
  console.log(`[seed:demo] Organisation "${SLUG}" provisioned (${orgId}); first admin activated.`);

  // ── Admin session for the first admin (the same token shape the hosted sign-in issues) ──
  const adminUser = await M.User.findOne({ company_id: orgId, email: FIRST_ADMIN.email });
  if (!adminUser) throw new Error('first admin not found after provisioning');
  const sid = crypto.randomUUID();
  await M.Session.create({
    _id: sid, identity_id: (adminUser as any).identity_id ?? new Types.ObjectId(), member_id: adminUser._id, company_id: orgId, realm: 'tenant',
    idle_expires_at: new Date(Date.now() + 3600e3), absolute_expires_at: new Date(Date.now() + 3600e3), amr: ['pwd'],
  } as any);
  const tok = await sign('tenant', { org: orgId, sid, email: FIRST_ADMIN.email }, String(adminUser._id), cfg.tenantIssuer, ADMIN_AUDIENCE);
  const api = (method: string, url: string, body?: unknown) => call(tok, method, `/api/v1${url}`, body);

  // ── Structure: one business unit with four departments ──
  const bu = await api('POST', '/organization', { name: 'Acme', type: 'business_unit' });
  const deptIds: Record<string, string> = {};
  for (const name of ['Engineering', 'People & Culture', 'Sales', 'Support']) {
    deptIds[name] = (await api('POST', '/organization', { name, type: 'department', parent_id: bu.data._id })).data._id;
  }

  // ── People: invite (managers first), then each accepts through the real set-password flow ──
  const ids: Record<string, string> = { admin: String(adminUser._id) };
  for (const p of [...PEOPLE.filter((x) => !x.manager), ...PEOPLE.filter((x) => x.manager)]) {
    const inv = await api('POST', '/people/invite', {
      full_name: p.name, email: emailOf(p.name), department_id: deptIds[p.dept], role: p.role,
      ...(p.manager ? { manager_id: ids[p.manager] } : {}), employment_type: 'full_time',
    });
    const id = String(inv.data?._id ?? inv.data?.user?._id ?? inv.data?.id);
    ids[p.key] = id;
    const copy = await api('POST', `/people/${id}/resend-invite?copy=true`);
    const token = String(copy.data?.invite_link ?? '').match(/token=([0-9a-f]{64})/)?.[1];
    if (!token) throw new Error(`no invite link for ${p.name}`);
    await call(null, 'POST', '/api/v1/auth/setup-password', { token, newPassword: DEMO_PASSWORD });
  }
  console.log(`[seed:demo] ${PEOPLE.length + 1} members active.`);

  // ── Groups ──
  const groups: Record<string, string> = {};
  const allMembers = await M.Group.findOne({ company_id: orgId, name: 'All Members' }).select('_id').lean();
  if (allMembers) groups['All Members'] = String(allMembers._id);
  groups.Managers = (await api('POST', '/groups', { name: 'Managers', description: 'People managers', type: 'static' })).data._id;
  await api('POST', `/groups/${groups.Managers}/users`, { userIds: ['eng_mgr', 'sales_mgr', 'support_lead', 'hr'].map((k) => ids[k]) });

  // ── App Access ──
  const apps = (await api('GET', '/apps')).data as Array<{ _id: string; product_key?: string }>;
  const appOf = (key: string) => apps.find((a) => a.product_key === key)?._id;
  for (const a of ACCESS) {
    const appId = appOf(a.product);
    if (!appId) { console.warn(`[seed:demo] product ${a.product} not found in Apps; skipped`); continue; }
    const [kind, name] = a.target.split(':');
    const target = kind === 'dept' ? { target_type: 'department', target_id: deptIds[name] }
      : kind === 'group' ? { target_type: 'group', target_id: groups[name] }
      : { target_type: 'user', target_id: ids[name] };
    if (!target.target_id) { console.warn(`[seed:demo] target ${a.target} missing; skipped`); continue; }
    try {
      await api('POST', `/apps/${appId}/assign`, { ...target, product_role_key: a.role, reason: 'demo seed' });
    } catch (e) {
      // An identical default rule may already exist (provisioning adds "All Members → Desk requester"): keep going.
      console.warn(`[seed:demo] ${a.product}/${a.role} → ${a.target}: ${(e as Error).message}`);
    }
  }

  const accounts = {
    organisation: { name: 'Acme Demo', slug: SLUG, id: orgId },
    password: DEMO_PASSWORD,
    note: 'Every account uses this password. Each person sets up an authenticator app at first sign-in if the security policy asks for it.',
    people: [
      { name: FIRST_ADMIN.name, email: FIRST_ADMIN.email, admin_role: 'Super Admin', products: 'People employee, Projects administrator, Sign administrator, Desk requester' },
      ...PEOPLE.map((p) => ({ name: p.name, email: emailOf(p.name), admin_role: p.role, department: p.dept })),
    ],
  };
  if (!MEMORY) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(accounts, null, 2));
  }
  console.log(`[seed:demo] Done. Password for every account: ${DEMO_PASSWORD}`);
  for (const p of accounts.people) console.log(`  ${p.email.padEnd(32)} ${p.admin_role}`);
  if (!MEMORY) console.log(`[seed:demo] Accounts saved to ${OUT}`);

  if (MEMORY) {
    const events = await M.PlatformEvent.countDocuments({ org_id: new Types.ObjectId(orgId) });
    const active = await M.User.countDocuments({ company_id: orgId, lifecycle_state: 'active' });
    const assignments = await M.AppAssignment.countDocuments({ company_id: orgId });
    console.log(`[seed:demo] --memory check: ${active} active members, ${assignments} app assignments, ${events} platform events`);
    if (active !== PEOPLE.length + 1 || events === 0) process.exitCode = 1;
  }
  server.close();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
}

main().catch(async (e) => {
  console.error('[seed:demo] FAILED:', (e as Error).message);
  process.exitCode = 1;
  await mongoose.disconnect().catch(() => undefined);
}).finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 500));
