// server/src/scripts/perf-lists.ts — Plan 7.4: list endpoints at scale.
//   npm run perf:lists            (env: PERF_TENANTS=5000 PERF_MEMBERS=50000 to change the size)
// In-memory Mongo, full app in-process. Seeds tenants and members, calls every list endpoint (operator and tenant),
// and reads the Mongo profiler for each query: plan, documents examined, documents returned, server time.
// A query that scans a collection or examines far more than it returns gets a real explain('executionStats') run.
// Output: a table on stdout and a JSON file at PERF_OUT (default D:/karbexa-test-tmp/p7/perf-lists.json when it exists).
import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import * as jose from 'jose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const TENANTS = Number(process.env.PERF_TENANTS || 5000);
const MEMBERS = Number(process.env.PERF_MEMBERS || 50000);
const BIG = Math.min(5000, Math.floor(MEMBERS / 10)); // one large tenant, so tenant lists have something to page through

interface QueryInfo { ns: string; op: string; plan: string; examined: number; keys: number; returned: number; millis: number; explain?: string }
interface Row { endpoint: string; status: number; ms: number; bytes: number; queries: QueryInfo[] }

async function insertMany(model: mongoose.Model<any>, docs: any[], chunk = 5000) {
  for (let i = 0; i < docs.length; i += chunk) await model.collection.insertMany(docs.slice(i, i + chunk), { ordered: false });
}

async function main() {
  const t0 = Date.now();
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const server = http.createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const ORIGIN = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const gen = async () => jose.exportJWK((await jose.generateKeyPair('RS256', { extractable: true })).privateKey);
  const tenantKey = { ...(await gen()), kid: 'tenant-perf' };
  const operatorKey = { ...(await gen()), kid: 'operator-perf' };
  Object.assign(process.env, {
    NODE_ENV: 'development', MONGODB_URI: mongo.getUri(), DB_NAME: 'perf_lists',
    ID_ISSUER_ORIGIN: ORIGIN, ADMIN_SPA_ORIGIN: ORIGIN, OPERATOR_SPA_ORIGIN: ORIGIN, PRODUCTS_SPA_ORIGIN: ORIGIN, CLIENT_URL: ORIGIN,
    TRUST_PROXY: '0', AUTH_RATE_LIMIT: '100000', GLOBAL_RATE_LIMIT: '100000',
    ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    OIDC_COOKIE_KEYS: crypto.randomBytes(32).toString('base64url'),
    IDENTITY_TENANT_KEY: JSON.stringify(tenantKey),
    IDENTITY_SERVICES_KEY: JSON.stringify({ ...(await gen()), kid: 'services-perf' }),
    IDENTITY_OPERATOR_KEY: JSON.stringify(operatorKey),
    MOCK_EMAIL: 'true',
  });
  delete process.env.ENTRA_CLIENT_ID;

  const { connectDB } = await import('../config/db');
  await connectDB();
  const { createServer } = await import('../app');
  const app = await createServer();
  server.on('request', app);
  const M = await import('../models');
  const { seedProductRegistry } = await import('../lib/productCatalog');
  await seedProductRegistry();
  // The indexes the code declares, as production has them. One model failing (App: a partial index on $exists:false that MongoDB rejects) must not stop the rest.
  for (const m of Object.values(mongoose.models)) await m.createIndexes().catch((e: any) => console.log(`index build failed for ${m.modelName}: ${String(e.message).slice(0, 110)}`));

  // ── Seed ────────────────────────────────────────────────────────────────────────
  const now = new Date();
  const dayMs = 86_400_000;
  console.log(`seeding ${TENANTS} tenants and ${MEMBERS} members ...`);
  const op = await M.OperatorAccount.create({ email: 'perf@karbexa.test', full_name: 'Perf Op', password_hash: 'x'.repeat(60), roles: ['platform_admin'], status: 'active' });
  const opTok = await new jose.SignJWT({ token_use: 'access' })
    .setProtectedHeader({ alg: 'RS256', kid: 'operator-perf', typ: 'at+jwt' })
    .setIssuer(`${ORIGIN}/realms/operator`).setAudience('urn:karbexa:operator').setSubject(String(op._id)).setIssuedAt().setExpirationTime('3h')
    .sign(await jose.importJWK(operatorKey, 'RS256'));
  const opCall = async (path: string) => fetch(`${ORIGIN}/operator/v1${path}`, { headers: { authorization: `Bearer ${opTok}` } });

  // The large tenant goes through the real provisioning route so it has roles, permissions and an admin.
  const prov = (await (await fetch(`${ORIGIN}/operator/v1/orgs`, {
    method: 'POST', headers: { authorization: `Bearer ${opTok}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Perf Big', slug: 'perfbig', plan_key: 'professional', first_admin: { email: 'admin@perfbig.test', full_name: 'Big Admin' } }),
  })).json()) as any;
  const bigId = new Types.ObjectId(prov.data.id as string);
  const admin = (await M.User.findOne({ company_id: bigId, email: 'admin@perfbig.test' }))!;
  await M.User.updateOne({ _id: admin._id }, { $set: { lifecycle_state: 'active', is_active: true } });
  const sid = crypto.randomUUID();
  await M.Session.create({ _id: sid, identity_id: new Types.ObjectId(), member_id: admin._id, company_id: bigId, realm: 'tenant', idle_expires_at: new Date(Date.now() + 3 * 3600e3), absolute_expires_at: new Date(Date.now() + 3 * 3600e3), auth_methods: ['pwd'] } as any);
  const tenTok = await new jose.SignJWT({ token_use: 'access', org: String(bigId), sid, email: admin.email })
    .setProtectedHeader({ alg: 'RS256', kid: 'tenant-perf', typ: 'at+jwt' })
    .setIssuer(`${ORIGIN}/realms/tenant`).setAudience('urn:karbexa:admin').setSubject(String(admin._id)).setIssuedAt().setExpirationTime('3h')
    .sign(await jose.importJWK(tenantKey, 'RS256'));
  const tenCall = async (path: string) => fetch(`${ORIGIN}/api/v1${path}`, { headers: { authorization: `Bearer ${tenTok}` } });

  const plans = ['starter', 'professional', 'enterprise'];
  const companies: any[] = [];
  for (let i = 0; i < TENANTS - 1; i++) {
    companies.push({
      _id: new Types.ObjectId(), name: `Tenant ${i}`, slug: `t${i}`, status: i % 50 === 0 ? 'suspended' : 'active',
      tags: i % 10 === 0 ? ['pilot'] : [], trial_ends_at: i % 20 === 0 ? new Date(now.getTime() + 5 * dayMs) : undefined,
      created_at: new Date(now.getTime() - i * 60_000), createdAt: new Date(now.getTime() - i * 60_000), updatedAt: now,
    });
  }
  await insertMany(M.Company, companies);
  await insertMany(M.OrganizationEntitlement, companies.map((c, i) => ({ company_id: c._id, product_key: 'people', status: 'active', seats_limit: 25, source: 'plan', plan_key: plans[i % 3], created_at: now, updated_at: now })));
  await insertMany(M.SeatUsage, companies.map((c) => ({ company_id: c._id, product_key: 'people', used: 9, computed_at: now })));
  await insertMany(M.TenantNote, companies.filter((_, i) => i % 5 === 0).map((c) => ({ company_id: c._id, operator_id: op._id, operator_email: op.email, body: 'seeded note', created_at: now })));
  await insertMany(M.TenantDailyStat, companies.map((c, i) => ({ company_id: c._id, day: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), members_active: 9, admins_without_mfa: i % 40 === 0 ? 1 : 0 })));
  await insertMany(M.OperatorAuditEvent, Array.from({ length: 20_000 }, (_, i) => ({
    operator_id: op._id, operator_email: op.email, action: i % 3 ? 'org.updated' : 'entitlement.set', target_type: 'Organization', target_id: String(companies[i % companies.length]._id),
    company_id: companies[i % companies.length]._id, created_at: new Date(now.getTime() - i * 1000),
  })));

  const others = MEMBERS - BIG;
  const perOther = Math.max(1, Math.floor(others / (TENANTS - 1)));
  const users: any[] = [];
  const mk = (cid: Types.ObjectId, n: number, tag: string, deptId?: Types.ObjectId) => ({
    _id: new Types.ObjectId(), company_id: cid, full_name: `Member ${tag}-${n}`, email: `m${n}@${tag}.test`, password_hash: 'x', employee_id: `E-${tag}-${n}`, role: 'Employee',
    lifecycle_state: n % 10 === 0 ? 'invited' : 'active', is_active: n % 10 !== 0, department_id: deptId, created_at: new Date(now.getTime() - n * 1000), lifecycle_changed_at: now,
  });
  const depts = Array.from({ length: 40 }, (_, i) => ({ _id: new Types.ObjectId(), company_id: bigId, name: `Dept ${i}`, slug: `dept-${i}`, type: 'department', is_active: true }));
  await insertMany(M.Department, depts);
  for (let n = 0; n < BIG; n++) users.push(mk(bigId, n, 'big', depts[n % depts.length]._id));
  let uc = 0;
  for (const c of companies) { for (let n = 0; n < perOther && uc < others; n++, uc++) users.push(mk(c._id, n, String(c.slug))); }
  await insertMany(M.User, users);
  const bigUsers = users.slice(0, BIG);
  const groups = Array.from({ length: 200 }, (_, i) => ({ _id: new Types.ObjectId(), company_id: bigId, name: `Group ${i}`, type: 'static', is_active: true }));
  await insertMany(M.Group, groups);
  await insertMany(M.GroupMember, bigUsers.map((u, i) => ({ group_id: groups[i % groups.length]._id, user_id: u._id, assigned_by: admin._id, added_at: now })));
  await insertMany(M.AuditEvent, Array.from({ length: 60_000 }, (_, i) => ({
    company_id: i < 50_000 ? bigId : companies[i % companies.length]._id, actor_id: admin._id, actor_email: admin.email, action: i % 2 ? 'user.updated' : 'group.created', module: i % 2 ? 'people' : 'groups',
    category: 'System', object_type: 'User', object_id: String(bigUsers[i % bigUsers.length]._id), object_label: `Member ${i}`, created_at: new Date(now.getTime() - i * 500),
  })));
  await insertMany(M.Invitation, bigUsers.filter((_, i) => i % 10 === 0).map((u) => ({
    kind: 'member', company_id: bigId, user_id: u._id, email: u.email, token_hash: crypto.randomBytes(16).toString('hex'), state: 'pending', expires_at: new Date(now.getTime() + 3 * dayMs),
    created_by: { type: 'system' }, createdAt: now, updatedAt: now,
  })));
  await insertMany(M.AttentionItem, companies.filter((_, i) => i % 25 === 0).map((c) => ({ kind: 'sync_lag', company_id: c._id, severity: 'warning', summary: 'seeded', open: true, first_seen_at: now, last_seen_at: now })));
  const counts = { companies: await M.Company.countDocuments(), users: await M.User.countDocuments(), audit: await M.AuditEvent.countDocuments(), operator_audit: await M.OperatorAuditEvent.countDocuments() };
  console.log('seeded', JSON.stringify(counts), `in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

  // ── Measure ─────────────────────────────────────────────────────────────────────
  const db = mongoose.connection.db!;
  await db.command({ profile: 2, slowms: 0 });
  const profile = db.collection('system.profile');
  const someOrg = String(companies[2500]._id);
  const OP: string[] = [
    '/orgs', '/orgs?limit=50', '/orgs?search=Tenant%2012', '/orgs?status=suspended', '/orgs?plan=professional', '/orgs?sort=members', '/orgs?trial=true', '/orgs?tag=pilot',
    '/audit', '/audit?category=tenant', '/audit?action=org.updated', '/audit?limit=100', '/operators', '/plans', '/products', '/overview', '/health', '/health/sync', '/security',
    '/onboarding', '/announcement', `/orgs/${someOrg}`, `/orgs/${someOrg}/products`, `/orgs/${someOrg}/admins`, `/orgs/${someOrg}/notes`, `/orgs/${someOrg}/identity-providers`, `/orgs/${someOrg}/onboarding`,
    `/operators/${op._id}/sessions`,
  ];
  const TEN: string[] = [
    '/people', '/people?limit=50', '/people?search=Member%20big-12', '/people?lifecycle_state=invited', `/people?department_id=${depts[0]._id}`, '/people?page=40&limit=50',
    '/groups', '/organization', '/organization/tree', '/organization/history', '/organization/health', '/organization/subscription', '/teams', '/locations', '/roles', '/apps', '/policies',
    '/workflows', '/approvals/pending', '/audit-logs', '/audit-logs?module=people', '/audit-logs?action=user.updated', '/audit-logs?limit=100', '/security/sessions', '/security/events', '/security/policies',
    '/notifications/in-app', '/notifications/templates', '/notifications/events', '/holidays/calendars', '/work-schedules', '/data-fields', '/integrations', '/me/apps',
    '/overview/stats', '/overview/setup-progress', '/overview/recent-activity', '/overview/insights', '/intelligence', `/people/${bigUsers[7]._id}/invitation`, `/people/${bigUsers[7]._id}/effective-access`,
  ];

  const rows: Row[] = [];
  const isBad = (q: QueryInfo) => /COLLSCAN/.test(q.plan) || q.examined > Math.max(200, q.returned * 20);
  async function measure(kind: 'operator' | 'tenant', path: string) {
    const since = new Date(); // system.profile is capped and cannot be written to; read only the entries after this moment
    const t = process.hrtime.bigint();
    const res = await (kind === 'operator' ? opCall(path) : tenCall(path));
    const body = await res.arrayBuffer();
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    await new Promise((r) => setTimeout(r, 40)); // let the profiler flush
    const prof = await profile.find({
      ts: { $gte: since }, ns: { $regex: '^perf_lists\\.(?!system\\.)' },
      $or: [{ 'command.find': { $exists: true } }, { 'command.aggregate': { $exists: true } }, { 'command.count': { $exists: true } }],
    }).toArray();
    const queries: QueryInfo[] = [];
    for (const p of prof as any[]) {
      const cmd = p.command || {};
      const q: QueryInfo = { ns: p.ns, op: cmd.find ? 'find' : cmd.aggregate ? 'aggregate' : 'count', plan: p.planSummary || '(none)', examined: p.docsExamined ?? 0, keys: p.keysExamined ?? 0, returned: p.nreturned ?? 0, millis: p.millis ?? 0 };
      if (isBad(q) && (cmd.find || cmd.aggregate)) {
        try {
          const c = { ...cmd }; delete c.lsid; delete c.$db; delete c.$clusterTime; delete c.readConcern; delete c.txnNumber;
          const ex: any = await db.command({ explain: c, verbosity: 'executionStats' });
          const es = ex.executionStats || ex.stages?.[0]?.$cursor?.executionStats;
          q.explain = `explain: examined ${es?.totalDocsExamined} / returned ${es?.nReturned} / ${es?.executionTimeMillis} ms`;
        } catch (e: any) { q.explain = `explain failed: ${String(e.message).slice(0, 80)}`; }
      }
      queries.push(q);
    }
    rows.push({ endpoint: `${kind === 'operator' ? 'OP ' : 'TEN'} ${path}`, status: res.status, ms: Math.round(ms), bytes: body.byteLength, queries });
  }
  for (const p of OP) await measure('operator', p);
  for (const p of TEN) await measure('tenant', p);

  // ── Report ──────────────────────────────────────────────────────────────────────
  const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
  const flagged: string[] = [];
  console.log('\n' + pad('endpoint', 62) + pad('status', 8) + pad('ms', 7) + pad('KB', 7) + 'queries');
  for (const r of rows) {
    const bad = r.queries.filter(isBad);
    const worst = r.queries.slice().sort((a, b) => b.examined - a.examined)[0];
    console.log(pad(r.endpoint, 62) + pad(String(r.status), 8) + pad(String(r.ms), 7) + pad((r.bytes / 1024).toFixed(0), 7) + `${r.queries.length} q${bad.length ? `, ${bad.length} FLAGGED` : ''}${worst ? `; max examined ${worst.examined} (${worst.ns.split('.')[1]})` : ''}`);
    for (const q of bad) flagged.push(`${r.endpoint}  ${q.op} ${q.ns}  plan=${q.plan}  examined=${q.examined} returned=${q.returned} ${q.millis} ms  ${q.explain ?? ''}`);
  }
  console.log(`\nFLAGGED QUERIES (collection scan, or examined > 20x returned and > 200): ${flagged.length}`);
  for (const f of flagged) console.log('  ' + f);
  const slow = rows.filter((r) => r.ms > 300).map((r) => `${r.endpoint} ${r.ms} ms`);
  console.log(`\nSLOWER THAN 300 ms: ${slow.length}`); for (const s of slow) console.log('  ' + s);
  console.log(`non-200: ${rows.filter((r) => r.status !== 200).map((r) => `${r.endpoint}=${r.status}`).join(', ') || 'none'}`);
  const out = process.env.PERF_OUT || (fs.existsSync('D:/karbexa-test-tmp/p7') ? 'D:/karbexa-test-tmp/p7/perf-lists.json' : '');
  if (out) fs.writeFileSync(out, JSON.stringify({ counts, tenants: TENANTS, members: MEMBERS, rows, flagged }, null, 1));

  await mongoose.disconnect();
  await mongo.stop();
  server.close();
}
main().then(() => process.exit(0)).catch((e) => { console.error('PERF CRASH', e); process.exit(1); });
