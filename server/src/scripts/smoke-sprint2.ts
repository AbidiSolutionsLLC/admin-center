// server/src/scripts/smoke-sprint2.ts — Sprint 2 (E3 + E10) targeted smoke test.
//   npm run smoke:sprint2
// In-memory Mongo, full app in-process. Operator logs in via the operator realm (PKCE + TOTP enrolment),
// provisions an org from a plan, suspends an entitlement / the org; E3 effective access is checked
// through the library and the /platform/v1 endpoint (services-realm token).
import http from 'http';
import crypto from 'crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import * as jose from 'jose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { generate as generateTotp } from 'otplib';

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: unknown, detail: unknown = '') => {
  results.push({ name, ok: !!ok, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
};
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
const form = (data: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(data).toString(),
});

async function main() {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const server = http.createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const ORIGIN = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const gen = async () => jose.exportJWK((await jose.generateKeyPair('RS256', { extractable: true })).privateKey);
  const backend = await jose.generateKeyPair('RS256', { extractable: true });
  const tenantPrivateJwk = { ...(await gen()), kid: 'tenant-smoke' };
  const servicesPrivateJwk = { ...(await gen()), kid: 'services-smoke' };
  const backendPublic = { ...(await jose.exportJWK(backend.publicKey)), kid: 'smoke-backend-1', alg: 'RS256', use: 'sig' };
  const adminBackend = await jose.generateKeyPair('RS256', { extractable: true });
  const adminBackendPublicJwk = await jose.exportJWK(adminBackend.publicKey);
  const adminBackendPublic = { ...adminBackendPublicJwk, kid: await jose.calculateJwkThumbprint(adminBackendPublicJwk), alg: 'RS256', use: 'sig' };
  const adminBackendPem = await jose.exportPKCS8(adminBackend.privateKey);
  Object.assign(process.env, {
    NODE_ENV: 'development', MONGODB_URI: mongo.getUri(), DB_NAME: 'smoke_s2',
    ID_ISSUER_ORIGIN: ORIGIN, ADMIN_SPA_ORIGIN: ORIGIN, OPERATOR_SPA_ORIGIN: ORIGIN, PRODUCTS_SPA_ORIGIN: ORIGIN, CLIENT_URL: ORIGIN,
    TRUST_PROXY: '0', AUTH_RATE_LIMIT: '10000', GLOBAL_RATE_LIMIT: '10000',
    ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    OIDC_COOKIE_KEYS: crypto.randomBytes(32).toString('base64url'),
    IDENTITY_TENANT_KEY: JSON.stringify(tenantPrivateJwk),
    IDENTITY_SERVICES_KEY: JSON.stringify(servicesPrivateJwk),
    IDENTITY_OPERATOR_KEY: JSON.stringify({ ...(await gen()), kid: 'operator-smoke' }),
    SERVICES_PRODUCTS_BACKEND_JWKS: JSON.stringify({ keys: [backendPublic] }),
    SERVICES_ADMIN_BACKEND_JWKS: JSON.stringify({ keys: [adminBackendPublic] }),
    ADMIN_BACKEND_CLIENT_KEY: adminBackendPem,
  });
  delete process.env.ENTRA_CLIENT_ID;

  const { connectDB } = await import('../config/db');
  await connectDB();
  const { createServer } = await import('../app');
  const app = await createServer();
  server.on('request', app);
  const { OperatorAccount, Company, User, Plan, App, AppAssignment, ProductRole, OrganizationEntitlement, OperatorAuditEvent, Group, GroupMember, AuditEvent, PlatformEvent, OrgEventCounter, Session } = await import('../models');
  const { seedProductRegistry } = await import('../lib/productCatalog');
  const { computeEffectiveAccess } = await import('../lib/effectiveAccess');
  const { runInTransaction, emitPlatformEvent } = await import('../lib/platformEvents');

  try {
    // ── E3: product registry ─────────────────────────────────────────────────────────────
    await seedProductRegistry();
    await seedProductRegistry(); // idempotent
    const apps = await App.find({ app_type: 'karbexa_product' });
    check('E3 registry seeds people/projects/sign/desk', apps.map((a) => a.product_key).sort().join() === 'desk,people,projects,sign', apps.map((a) => a.product_key));
    const deskRoles = await ProductRole.find({ product_key: 'desk' });
    check('E3 desk catalog (5 roles, default requester)', deskRoles.length === 5 && deskRoles.find((r) => r.is_default)?.key === 'requester', deskRoles.map((r) => r.key));
    {
      // L3-1 (D5): read_only rank 5 in every product catalog; default roles unchanged after a second seed
      const defaults: Record<string, string> = { people: 'employee', projects: 'team_member', sign: 'sign_user', desk: 'requester' };
      for (const pk of Object.keys(defaults)) {
        const rows = await ProductRole.find({ product_key: pk }).lean();
        const ro = rows.filter((r) => r.key === 'read_only');
        check(`L3-1 ${pk}: read_only rank 5 named 'Read Only', not default, exactly one row`, ro.length === 1 && ro[0].rank === 5 && ro[0].name === 'Read Only' && !ro[0].is_default, ro);
        check(`L3-1 ${pk}: default role still ${defaults[pk]} (only one default)`, rows.filter((r) => r.is_default).map((r) => r.key).join() === defaults[pk], rows.map((r) => r.key));
      }
    }
    check('E3 default plans seeded', (await Plan.countDocuments({ key: { $in: ['starter', 'professional', 'enterprise'] } })) === 3);

    // ── E10: operator login (operator realm, PKCE, mandatory TOTP enrolment) ──────────────
    const PASSWORD = 'Operator-Passw0rd!x';
    await OperatorAccount.create({ email: 'op@karbexa.test', full_name: 'Op One', password_hash: await bcrypt.hash(PASSWORD, 12), roles: ['platform_admin'], status: 'active' });
    const REALM = `${ORIGIN}/realms/operator`;
    const REDIRECT = `${ORIGIN}/operator/callback`;
    const RESOURCE = 'urn:karbexa:operator';
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    let res = await jarFetch(`${REALM}/oauth/authorize?${new URLSearchParams({
      client_id: 'karbexa-operator-spa', response_type: 'code', redirect_uri: REDIRECT, scope: 'openid profile email',
      code_challenge: challenge, code_challenge_method: 'S256', state: 's', resource: RESOURCE,
    })}`);
    const uid = /\/interaction\/([^/?#]+)/.exec(res.headers.get('location') || '')?.[1];
    check('E10 operator authorize → hosted interaction', res.status === 303 && uid, `${res.status} ${res.headers.get('location')}`);
    const IX = `${REALM}/interaction/${uid}`;
    await jarFetch(IX);
    res = await jarFetch(`${IX}/login`, form({ email: 'op@karbexa.test', password: PASSWORD }));
    res = await jarFetch(IX);
    const html = await res.text();
    const secret = /([A-Z2-7]{16,})/.exec(/<code>([A-Z2-7]+)<\/code>/.exec(html)?.[1] || '')?.[1];
    check('E10 operator without MFA must enrol TOTP', !!secret, res.status);
    res = await jarFetch(`${IX}/mfa`, form({ code: await generateTotp({ secret: secret || 'AAAA' }) }));
    let code: string | null = null;
    for (let i = 0; i < 10 && res.status >= 300 && res.status < 400; i++) {
      const loc = new URL(res.headers.get('location')!, ORIGIN);
      if (loc.pathname === '/operator/callback') { code = loc.searchParams.get('code'); break; }
      res = await jarFetch(loc.toString());
    }
    const tok = await (await fetch(`${REALM}/oauth/token`, form({
      grant_type: 'authorization_code', code: code || '', redirect_uri: REDIRECT, client_id: 'karbexa-operator-spa', code_verifier: verifier, resource: RESOURCE,
    }))).json() as Record<string, string>;
    check('E10 operator code exchange → access token', !!tok.access_token, JSON.stringify(tok).slice(0, 120));
    const claims = tok.access_token ? jose.decodeJwt(tok.access_token) : {};
    check('E10 AT aud = urn:karbexa:operator', claims.aud === RESOURCE, claims.aud);

    const OP = `${ORIGIN}/operator/v1`;
    const op = (path: string, method = 'GET', body?: unknown, at = tok.access_token) => fetch(`${OP}${path}`, {
      method, headers: { authorization: `Bearer ${at}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    res = await fetch(`${OP}/orgs`);
    check('E10 /operator/v1 without token = 401', res.status === 401, res.status);
    res = await op('/orgs');
    check('E10 /operator/v1/orgs with operator token = 200', res.status === 200, res.status);

    // ── provision org from plan ───────────────────────────────────────────────────────────
    res = await op('/orgs', 'POST', { name: 'Acme Corp', slug: 'acme', plan_key: 'professional', first_admin: { email: 'admin@acme.test', full_name: 'Ada Admin' } });
    const created = await res.json() as { data?: { id: string; status: string; entitlements: { product_key: string }[] } };
    check('E10 POST /orgs provisions org (201, active)', res.status === 201 && created.data?.status === 'active', `${res.status} ${JSON.stringify(created).slice(0, 200)}`);
    const orgId = created.data?.id || '';
    check('E10 entitlements come from plan (people, projects, sign)', ['people', 'projects', 'sign'].every((k) => created.data?.entitlements.some((e) => e.product_key === k)) && !created.data?.entitlements.some((e) => e.product_key === 'desk'), created.data?.entitlements);
    res = await op('/orgs', 'POST', { name: 'Acme Corp', slug: 'acme', plan_key: 'professional', first_admin: { email: 'admin@acme.test', full_name: 'Ada Admin' } });
    check('E10 provisioning idempotent by slug', (await Company.countDocuments({ slug: 'acme' })) === 1, res.status);
    const admin = await User.findOne({ company_id: orgId, email: 'admin@acme.test' });
    check('E10 first admin membership created', !!admin, admin?.lifecycle_state);

    // ── E4a: provisioning emits platform events in the same txn, one correlation id ─────────
    {
      const evs = await PlatformEvent.find({ org_id: orgId }).sort({ seq: 1 }).lean();
      const provAudit = await AuditEvent.findOne({ company_id: orgId, action: 'org.provisioned' }).lean();
      const types = new Set(evs.map((e) => e.type));
      check('E4a provisioning events: org.provisioned, entitlement.changed, member.provisioned, app_access.changed',
        ['org.provisioned', 'entitlement.changed', 'member.provisioned', 'app_access.changed'].every((t) => types.has(t)), [...types]);
      check('E4a provisioning seq is 1..N contiguous, no gaps/dupes', evs.length > 0 && evs.every((e, i) => e.seq === i + 1), evs.map((e) => e.seq));
      check('E4a provisioning AuditEvent has source operator + correlation_id', provAudit?.source === 'operator' && !!provAudit?.correlation_id, provAudit?.correlation_id);
      check('E4a every provisioning event shares the AuditEvent correlation_id', evs.length > 0 && evs.every((e) => e.correlation_id === provAudit?.correlation_id), evs.map((e) => e.correlation_id));
      check('E4a OrgEventCounter equals last seq', (await OrgEventCounter.findById(orgId))?.seq === evs.length);
    }

    // ── E3: effective access ──────────────────────────────────────────────────────────────
    const people = await App.findOne({ product_key: 'people', app_type: 'karbexa_product' });
    const projects = await App.findOne({ product_key: 'projects', app_type: 'karbexa_product' });
    const desk = await App.findOne({ product_key: 'desk', app_type: 'karbexa_product' });
    const me = admin!;
    await User.updateOne({ _id: me._id }, { lifecycle_state: 'active', is_active: true });
    const grp = await Group.findOne({ company_id: orgId, name: 'All Members', type: 'dynamic' });
    check('E10 provisioning creates dynamic All Members group', !!grp && grp.is_active, grp?.toObject());
    check('E10 provisioning creates default people employee assignment (group)', !!(await AppAssignment.exists({
      company_id: orgId, app_id: people!._id, target_type: 'group', target_id: grp!._id, product_role_key: 'employee', granted_by: admin!._id,
    })));
    check('E10 re-provision does not duplicate group/assignment', (await Group.countDocuments({ company_id: orgId, name: 'All Members' })) === 1
      && (await AppAssignment.countDocuments({ company_id: orgId, app_id: people!._id, target_type: 'group' })) === 1);
    const mk = (app: typeof people, role: string, target: object) => AppAssignment.create({
      company_id: orgId, app_id: app!._id, granted_by: me._id, is_active: true, product_role_key: role, ...target,
    } as never);
    await mk(projects, 'team_member', { target_type: 'user', target_id: me._id });
    const pm = await mk(projects, 'project_manager', { target_type: 'user', target_id: me._id });
    await mk(desk, 'technician', { target_type: 'user', target_id: me._id });
    const ea = await computeEffectiveAccess(orgId, me._id.toString());
    check('E3 effective: people=employee via dynamic All Members group', ea.products.people?.role === 'employee', ea.products);
    check('E3 effective: highest rank wins (project_manager > team_member)', ea.products.projects?.role === 'project_manager' && ea.products.projects.granted_by.length >= 1, ea.products.projects);
    check('E3 effective: desk denied — no entitlement', !ea.products.desk && /NO_ENTITLEMENT/.test(String(ea.denials.desk)), ea.denials);

    // platform API with services token
    const SERVICES = `${ORIGIN}/realms/services`;
    const assertion = await new jose.SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'smoke-backend-1' })
      .setIssuer('karbexa-products-backend').setSubject('karbexa-products-backend').setAudience(SERVICES)
      .setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('2m').sign(backend.privateKey);
    const svc = await (await fetch(`${SERVICES}/oauth/token`, form({
      grant_type: 'client_credentials', client_id: 'karbexa-products-backend',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion,
      scope: 'platform.access.read', resource: 'urn:karbexa:platform-api',
    }))).json() as Record<string, string>;
    const EA = `${ORIGIN}/platform/v1/orgs/${orgId}/members/${me._id}/effective-access`;
    res = await fetch(EA);
    check('E3 platform effective-access without token = 401', res.status === 401, res.status);
    res = await fetch(EA, { headers: { authorization: `Bearer ${svc.access_token}` } });
    const pea = await res.json() as { products?: Record<string, { role: string }> };
    check('E3 platform effective-access with service token = 200, no-store', res.status === 200 && pea.products?.projects?.role === 'project_manager' && /no-store/.test(res.headers.get('cache-control') || ''), `${res.status} ${JSON.stringify(pea)}`);
    res = await fetch(`${ORIGIN}/platform/v1/orgs/${new mongoose.Types.ObjectId()}/members/${me._id}/effective-access`, { headers: { authorization: `Bearer ${svc.access_token}` } });
    check('E3 member not in org = 404', res.status === 404, res.status);
    res = await fetch(EA, { headers: { authorization: `Bearer ${tok.access_token}` } });
    check('E3 operator token rejected by platform API', res.status === 401 || res.status === 403, res.status);

    // ── entitlement suspend → effective access denies ────────────────────────────────────
    const verBefore = (await User.findById(me._id))?.authz_ver ?? 0;
    res = await op(`/orgs/${orgId}/entitlements/projects`, 'PUT', { status: 'suspended' });
    check('E10 entitlement change bumps authz_ver', ((await User.findById(me._id))?.authz_ver ?? 0) > verBefore, { verBefore, after: (await User.findById(me._id))?.authz_ver });
    check('E10 PUT entitlement suspended = 200', res.status === 200, res.status);
    const ea2 = await computeEffectiveAccess(orgId, me._id.toString());
    check('E3 suspended entitlement removes product access', !ea2.products.projects && ea2.denials.projects === 'NO_ENTITLEMENT', ea2.denials);
    check('E3 other products unaffected', ea2.products.people?.role === 'employee');
    check('E3 entitlement row status suspended', (await OrganizationEntitlement.findOne({ company_id: orgId, product_key: 'projects' }))?.status === 'suspended');
    void pm;

    // ── suspend org ───────────────────────────────────────────────────────────────────────
    res = await op(`/orgs/${orgId}/suspend`, 'POST');
    check('E10 suspend org = 200', res.status === 200, res.status);
    const ea3 = await computeEffectiveAccess(orgId, me._id.toString());
    check('E3 suspended org → all products denied ORG_SUSPENDED', Object.keys(ea3.products).length === 0 && Object.values(ea3.denials).every((d) => d === 'ORG_SUSPENDED') && Object.keys(ea3.denials).length > 0, ea3);
    check('E10 Company.status suspended and is_active false', (await Company.findById(orgId))?.status === 'suspended' && (await Company.findById(orgId))?.is_active === false);
    res = await op(`/orgs/${orgId}/reactivate`, 'POST');
    check('E10 reactivate org = 200', res.status === 200 && (await Company.findById(orgId))?.status === 'active', res.status);

    // ── E4a: suspend/reactivate events carry data.reason ─────────────────────────────────
    res = await op(`/orgs/${orgId}/suspend`, 'POST', { reason: 'billing-hold' });
    res = await op(`/orgs/${orgId}/reactivate`, 'POST', { reason: 'paid' });
    {
      const sus = await PlatformEvent.find({ org_id: orgId, type: 'org.suspended' }).sort({ seq: 1 }).lean();
      const rea = await PlatformEvent.find({ org_id: orgId, type: 'org.reactivated' }).sort({ seq: 1 }).lean();
      check('E4a org.suspended event has data.reason (default + explicit)', sus.length === 2 && (sus[0].data as any).reason === 'suspended' && (sus[1].data as any).reason === 'billing-hold', sus.map((e) => e.data));
      check('E4a org.reactivated event has data.reason (default + explicit)', rea.length === 2 && (rea[0].data as any).reason === 'active' && (rea[1].data as any).reason === 'paid', rea.map((e) => e.data));
      check('E4a suspend/reactivate events are operator-actor with correlation_id', [...sus, ...rea].every((e) => e.actor.type === 'operator' && !!e.correlation_id));
    }

    // ── E4a: tenant assignment create/update/revoke → app_access.changed ──────────────────
    {
      const sid = crypto.randomUUID();
      await Session.create({
        _id: sid, identity_id: new mongoose.Types.ObjectId(), member_id: me._id, company_id: orgId, realm: 'tenant',
        idle_expires_at: new Date(Date.now() + 3600e3), absolute_expires_at: new Date(Date.now() + 3600e3), amr: ['pwd'],
      });
      const tenantKey = await jose.importJWK(tenantPrivateJwk, 'RS256');
      const tAt = await new jose.SignJWT({ token_use: 'access', org: String(orgId), sid, email: me.email })
        .setProtectedHeader({ alg: 'RS256', kid: 'tenant-smoke', typ: 'at+jwt' })
        .setIssuer(`${ORIGIN}/realms/tenant`).setAudience('urn:karbexa:admin').setSubject(String(me._id))
        .setIssuedAt().setExpirationTime('10m').sign(tenantKey);
      const API = `${ORIGIN}/api/v1`;
      const tenant = (path: string, method: string, body: unknown, cid: string) => fetch(`${API}${path}`, {
        method, headers: { authorization: `Bearer ${tAt}`, 'content-type': 'application/json', 'x-correlation-id': cid }, body: body ? JSON.stringify(body) : undefined,
      });
      const signApp = await App.findOne({ product_key: 'sign', app_type: 'karbexa_product' });
      const signRoles = await ProductRole.find({ product_key: 'sign', assignable: true }).sort({ key: 1 });
      const r1 = signRoles[0]?.key, r2 = signRoles[1]?.key;
      const liveAccess = async () => {
        const r = await tenant(`/people/${me._id}/effective-access`, 'GET', undefined, 'smoke-ea');
        const j = await r.json() as { data?: { products: Record<string, { role: string }> } };
        return Object.fromEntries(Object.entries(j.data?.products || {}).map(([k, v]) => [k, v.role]));
      };
      const verify = async (label: string, cid: string, action: string) => {
        const evts = await PlatformEvent.find({ org_id: orgId, type: 'app_access.changed', correlation_id: cid }).lean();
        const evt = evts.find((e) => e.subject.id === String(me._id));
        const user = await User.findById(me._id);
        const d = evt?.data as { authz_ver?: number; products?: Record<string, string> } | undefined;
        check(`E4a ${label}: app_access.changed emitted for affected member`, !!evt && evt.actor.type === 'member' && evt.actor.id === String(me._id), evts.map((e) => e.subject));
        check(`E4a ${label}: data.authz_ver equals User.authz_ver`, d?.authz_ver === user?.authz_ver, { evt: d?.authz_ver, user: user?.authz_ver });
        check(`E4a ${label}: data.products matches effective-access`, JSON.stringify(Object.entries(d?.products || {}).sort()) === JSON.stringify(Object.entries(await liveAccess()).sort()), d?.products);
        const ae = await AuditEvent.findOne({ company_id: orgId, action, correlation_id: cid }).lean();
        check(`E4a ${label}: AuditEvent correlation_id equals the event's`, !!ae && ae.correlation_id === evt?.correlation_id, ae?.correlation_id);
      };
      {
        const rr = await tenant(`/apps/${signApp!._id}/roles`, 'GET', undefined, 'smoke-roles');
        const rj = await rr.json() as { data?: { key?: string; role_key?: string; rank?: number }[] | { roles?: { key?: string; rank?: number }[] } };
        check('L3-1 GET /apps/:id/roles lists read_only', rr.status === 200 && JSON.stringify(rj).includes('read_only'), `${rr.status} ${JSON.stringify(rj).slice(0, 200)}`);
      }
      check('E4a signing roles available for assignment test', !!signApp && !!r1 && !!r2, signRoles.map((r) => r.key));

      res = await tenant(`/apps/${signApp!._id}/assign`, 'POST', { target_type: 'user', target_id: String(me._id), product_role_key: r1 }, 'smoke-assign');
      check('E4a tenant POST assign = 200/201', res.status === 200 || res.status === 201, `${res.status} ${(await res.text()).slice(0, 200)}`);
      const asg = await AppAssignment.findOne({ company_id: orgId, app_id: signApp!._id, target_type: 'user', target_id: me._id, is_active: true });
      check('E4a assign: effective-access shows the granted sign role', (await liveAccess()).sign === r1, await liveAccess());
      await verify('assign', 'smoke-assign', 'apps.assigned');

      res = await tenant(`/apps/assignments/${asg?._id}`, 'PATCH', { product_role_key: r2 }, 'smoke-update');
      check('E4a tenant PATCH assignment = 200', res.status === 200, `${res.status}`);
      await verify('update', 'smoke-update', 'apps.assignment_updated');

      res = await tenant(`/apps/${signApp!._id}/revoke`, 'POST', { assignment_id: String(asg?._id) }, 'smoke-revoke');
      check('E4a tenant POST revoke = 200', res.status === 200, `${res.status}`);
      check('E4a revoke: sign no longer in effective-access', !(await liveAccess()).sign, await liveAccess());
      await verify('revoke', 'smoke-revoke', 'apps.revoked');
    }

    // ── E4a: atomicity — a failure after emit rolls back event + seq ──────────────────────
    {
      const seqBefore = (await OrgEventCounter.findById(orgId))?.seq;
      const countBefore = await PlatformEvent.countDocuments({ org_id: orgId });
      let threw = false;
      try {
        await runInTransaction(async (session) => {
          await emitPlatformEvent(session, { org_id: orgId, type: 'smoke.rollback', subject: { type: 'org', id: orgId }, actor: { type: 'system' } });
          throw new Error('forced failure');
        });
      } catch { threw = true; }
      check('E4a forced failure propagates', threw);
      check('E4a rollback: no PlatformEvent persisted', (await PlatformEvent.countDocuments({ org_id: orgId, type: 'smoke.rollback' })) === 0 && (await PlatformEvent.countDocuments({ org_id: orgId })) === countBefore);
      check('E4a rollback: OrgEventCounter seq unchanged', (await OrgEventCounter.findById(orgId))?.seq === seqBefore, { before: seqBefore, after: (await OrgEventCounter.findById(orgId))?.seq });
      const fresh = new mongoose.Types.ObjectId();
      try {
        await runInTransaction(async (session) => {
          await emitPlatformEvent(session, { org_id: fresh, type: 'smoke.rollback', subject: { type: 'org', id: String(fresh) }, actor: { type: 'system' } });
          throw new Error('forced failure');
        });
      } catch { /* expected */ }
      check('E4a rollback: fresh org gets no counter row nor event', !(await OrgEventCounter.findById(fresh)) && (await PlatformEvent.countDocuments({ org_id: fresh })) === 0);
      const seqs = (await PlatformEvent.find({ org_id: orgId }).sort({ seq: 1 }).lean()).map((e) => e.seq);
      check('E4a org seq still contiguous after assignments/suspends/rollback', seqs.every((v, i) => v === i + 1), seqs);
    }

    // ── L3-2 (H1): group membership / state changes propagate (event + authz_ver + audit, one transaction) ─────────
    {
      const gSid = crypto.randomUUID();
      await Session.create({
        _id: gSid, identity_id: new mongoose.Types.ObjectId(), member_id: me._id, company_id: orgId, realm: 'tenant',
        idle_expires_at: new Date(Date.now() + 3600e3), absolute_expires_at: new Date(Date.now() + 3600e3), amr: ['pwd'],
      });
      const gKey = await jose.importJWK(tenantPrivateJwk, 'RS256');
      const gAt = await new jose.SignJWT({ token_use: 'access', org: String(orgId), sid: gSid, email: me.email })
        .setProtectedHeader({ alg: 'RS256', kid: 'tenant-smoke', typ: 'at+jwt' })
        .setIssuer(`${ORIGIN}/realms/tenant`).setAudience('urn:karbexa:admin').setSubject(String(me._id))
        .setIssuedAt().setExpirationTime('10m').sign(gKey);
      const gt = async (path: string, method: string, body: unknown, cid: string) => {
        const rr = await fetch(`${ORIGIN}/api/v1${path}`, {
          method, headers: { authorization: `Bearer ${gAt}`, 'content-type': 'application/json', 'x-correlation-id': cid }, body: body ? JSON.stringify(body) : undefined,
        });
        const text = await rr.text();
        let json: any = {};
        try { json = JSON.parse(text); } catch { /* not json */ }
        return { status: rr.status, json, text };
      };
      const aacFor = (cid: string, memberId: unknown) => PlatformEvent.find({ org_id: orgId, type: 'app_access.changed', correlation_id: cid, 'subject.id': String(memberId) }).lean();
      const authzOf = async (id: unknown) => (await User.findById(id))?.authz_ver ?? 0;
      const signAppG = await App.findOne({ product_key: 'sign', app_type: 'karbexa_product' });
      const [grpMember, outsider] = await User.insertMany([
        { company_id: orgId, full_name: 'Grp Member', email: 'grp.member@acme.test', password_hash: 'x', role: 'Employee', lifecycle_state: 'active', is_active: true, employment_type: 'full_time', employee_id: 'GRP-1' },
        { company_id: orgId, full_name: 'Grp Outsider', email: 'grp.outsider@acme.test', password_hash: 'x', role: 'Employee', lifecycle_state: 'active', is_active: true, employment_type: 'part_time', employee_id: 'GRP-2' },
      ]);

      // static group + assignment of sign_administrator to the group
      let r = await gt('/groups', 'POST', { name: 'H1 Static', type: 'static' }, 'h1-create');
      const sgId: string = r.json.data?._id;
      check('L3-2 create static group = 201', r.status === 201 && !!sgId, `${r.status} ${r.text.slice(0, 160)}`);
      r = await gt(`/apps/${signAppG!._id}/assign`, 'POST', { target_type: 'group', target_id: sgId, product_role_key: 'sign_administrator' }, 'h1-assign');
      const sgAssignId: string = r.json.data?._id || r.json.data?.id || (await AppAssignment.findOne({ company_id: orgId, target_type: 'group', target_id: sgId, is_active: true }))?._id?.toString();
      check('L3-2 assign sign_administrator to the group = 200/201', (r.status === 200 || r.status === 201) && !!sgAssignId, `${r.status} ${r.text.slice(0, 160)}`);

      // add member
      let v0 = await authzOf(grpMember._id);
      r = await gt(`/groups/${sgId}/users`, 'POST', { userIds: [String(grpMember._id)] }, 'h1-add');
      let ev = await aacFor('h1-add', grpMember._id);
      check('L3-2 add member = 200 and added 1', r.status === 200 && r.json.data?.added === 1, `${r.status} ${r.text.slice(0, 160)}`);
      check('L3-2 add: app_access.changed carries the group grant (sign = sign_administrator)', ev.length === 1 && (ev[0].data as any).products?.sign === 'sign_administrator', ev.map((e) => e.data));
      check('L3-2 add: authz_ver bumped and equals event data.authz_ver', (await authzOf(grpMember._id)) === v0 + 1 && (ev[0]?.data as any)?.authz_ver === v0 + 1, { v0, now: await authzOf(grpMember._id) });
      check('L3-2 add: audit row shares the correlation id', !!(await AuditEvent.findOne({ company_id: orgId, action: 'group.user_added', correlation_id: 'h1-add' })));
      r = await gt(`/groups/${sgId}/users`, 'POST', { userIds: [String(grpMember._id)] }, 'h1-add-dup');
      check('L3-2 add duplicate: no event and no authz_ver bump', (await aacFor('h1-add-dup', grpMember._id)).length === 0 && (await authzOf(grpMember._id)) === v0 + 1, r.text.slice(0, 120));

      // remove member
      r = await gt(`/groups/${sgId}/users`, 'DELETE', { userIds: [String(grpMember._id)] }, 'h1-remove');
      ev = await aacFor('h1-remove', grpMember._id);
      check('L3-2 remove member = 200 and removed 1', r.status === 200 && r.json.data?.removed === 1, `${r.status} ${r.text.slice(0, 160)}`);
      check('L3-2 remove: app_access.changed WITHOUT the group grant, authz_ver bumped', ev.length === 1 && (ev[0].data as any).products?.sign === undefined && (ev[0].data as any).authz_ver === v0 + 2 && (await authzOf(grpMember._id)) === v0 + 2, ev.map((e) => e.data));
      check('L3-2 remove: audit row shares the correlation id', !!(await AuditEvent.findOne({ company_id: orgId, action: 'group.user_removed', correlation_id: 'h1-remove' })));

      // deactivate / reactivate
      await gt(`/groups/${sgId}/users`, 'POST', { userIds: [String(grpMember._id)] }, 'h1-readd');
      check('L3-2 re-added member has the grant again', (await computeEffectiveAccess(orgId, String(grpMember._id))).products.sign?.role === 'sign_administrator');
      r = await gt(`/groups/${sgId}`, 'PUT', { is_active: false }, 'h1-deactivate');
      ev = await aacFor('h1-deactivate', grpMember._id);
      check('L3-2 deactivate group = 200', r.status === 200, `${r.status} ${r.text.slice(0, 160)}`);
      check('L3-2 deactivate: event emitted and carries no sign grant', ev.length === 1 && (ev[0].data as any).products?.sign === undefined, ev.map((e) => e.data));
      check('L3-2 deactivate: effective access excludes the inactive static group', (await computeEffectiveAccess(orgId, String(grpMember._id))).products.sign === undefined);
      r = await gt(`/groups/${sgId}`, 'PUT', { is_active: true }, 'h1-reactivate');
      ev = await aacFor('h1-reactivate', grpMember._id);
      check('L3-2 reactivate: event emitted with the grant restored', r.status === 200 && ev.length === 1 && (ev[0].data as any).products?.sign === 'sign_administrator', ev.map((e) => e.data));
      r = await gt(`/groups/${sgId}`, 'PUT', { description: 'rename only' }, 'h1-describe');
      check('L3-2 update without rule/active change emits nothing', (await aacFor('h1-describe', grpMember._id)).length === 0, r.status);

      // delete: members first (HAS_DEPENDENTS), then GROUP_IN_USE while the assignment is active, then success after revoke
      await gt(`/groups/${sgId}/users`, 'DELETE', { userIds: [String(grpMember._id)] }, 'h1-remove2');
      r = await gt(`/groups/${sgId}`, 'DELETE', undefined, 'h1-del-inuse');
      check('L3-2 delete group targeted by an active assignment = 409 GROUP_IN_USE', r.status === 409 && r.json.code === 'GROUP_IN_USE', `${r.status} ${r.text.slice(0, 160)}`);
      check('L3-2 409 leaves the group, assignment and event log untouched', !!(await Group.findById(sgId)) && (await PlatformEvent.countDocuments({ org_id: orgId, correlation_id: 'h1-del-inuse' })) === 0 && (await AuditEvent.countDocuments({ company_id: orgId, correlation_id: 'h1-del-inuse' })) === 0);
      r = await gt(`/apps/${signAppG!._id}/revoke`, 'POST', { assignment_id: sgAssignId }, 'h1-revoke');
      r = await gt(`/groups/${sgId}`, 'DELETE', undefined, 'h1-del');
      check('L3-2 delete after the assignment is revoked = 200', r.status === 200 && !(await Group.findById(sgId)), `${r.status} ${r.text.slice(0, 160)}`);

      // dynamic group: rule change touches old + new matches only; delete emits for the matched members
      r = await gt('/groups', 'POST', { name: 'H1 Dynamic', type: 'dynamic', dynamic_rules: { employment_type: 'full_time' } }, 'h1-dyn-create');
      const dgId: string = r.json.data?._id;
      check('L3-2 create dynamic group = 201', r.status === 201 && !!dgId, `${r.status} ${r.text.slice(0, 160)}`);
      r = await gt(`/groups/${dgId}`, 'PUT', { dynamic_rules: { employment_type: 'part_time' } }, 'h1-dyn-rules');
      check('L3-2 dynamic rule change: event for the old match (full_time member) and the new match (part_time outsider)', (await aacFor('h1-dyn-rules', grpMember._id)).length === 1 && (await aacFor('h1-dyn-rules', outsider._id)).length === 1, r.status);
      const totalMembers = await User.countDocuments({ company_id: orgId });
      const dynEvents = await PlatformEvent.countDocuments({ org_id: orgId, type: 'app_access.changed', correlation_id: 'h1-dyn-rules' });
      const expectDyn = await User.countDocuments({ company_id: orgId, employment_type: { $in: ['full_time', 'part_time'] } });
      check('L3-2 dynamic rule change emits only for affected members (not the whole org)', dynEvents === expectDyn && dynEvents <= totalMembers, { dynEvents, expectDyn, totalMembers });
      r = await gt(`/groups/${dgId}`, 'DELETE', undefined, 'h1-dyn-del');
      const delEvents = await PlatformEvent.find({ org_id: orgId, type: 'app_access.changed', correlation_id: 'h1-dyn-del' }).lean();
      check('L3-2 delete dynamic group = 200 with events for its rule-matched members (resolved before delete)', r.status === 200 && !(await Group.findById(dgId)) && delEvents.some((e) => e.subject.id === String(outsider._id)) && delEvents.length === (await User.countDocuments({ company_id: orgId, employment_type: 'part_time' })), { status: r.status, events: delEvents.length });
      check('L3-2 delete audit row shares the correlation id', !!(await AuditEvent.findOne({ company_id: orgId, action: 'group.deleted', correlation_id: 'h1-dyn-del' })));

      // tenant isolation: another org's admin cannot touch this org's group
      const foreignGroup = await Group.create({ company_id: new mongoose.Types.ObjectId(), name: 'Foreign', type: 'static' });
      r = await gt(`/groups/${foreignGroup._id}/users`, 'POST', { userIds: [String(grpMember._id)] }, 'h1-foreign');
      check('L3-2 foreign-tenant group is 404 (no membership, no event)', r.status === 404 && (await GroupMember.countDocuments({ group_id: foreignGroup._id })) === 0, r.status);

      // bounded fan-out: more members than the inline limit -> authz_ver bumped in the txn, events emitted after commit
      const bulk = await User.insertMany(Array.from({ length: 5 }, (_, i) => ({
        company_id: orgId, full_name: `Bounded ${i}`, email: `bounded${i}@acme.test`, password_hash: 'x', role: 'Employee',
        lifecycle_state: 'active', is_active: true, employment_type: 'intern', employee_id: `BND-${i}`,
      })));
      const bulkIds = bulk.map((u) => String(u._id));
      const { emitAppAccessChangedBounded } = await import('../lib/platformEvents');
      let seenInsideTxn = -1;
      await runInTransaction(async (session) => {
        await emitAppAccessChangedBounded(session, orgId, bulkIds, { actor: { type: 'system' }, correlation_id: 'h1-bounded', limit: 3, batchSize: 2 });
        seenInsideTxn = await PlatformEvent.countDocuments({ org_id: orgId, correlation_id: 'h1-bounded' }).session(session ?? null);
      });
      const bEvents = await PlatformEvent.find({ org_id: orgId, correlation_id: 'h1-bounded' }).lean();
      check('L3-2 bounded: over the limit no per-member event is written inside the transaction', seenInsideTxn === 0, seenInsideTxn);
      check('L3-2 bounded: after commit every member gets exactly one event with the bumped authz_ver', bEvents.length === 5 && (await Promise.all(bulkIds.map(async (id) => (bEvents.find((e) => e.subject.id === id)?.data as any)?.authz_ver === (await authzOf(id))))).every(Boolean), bEvents.length);
      const bSeqs = (await PlatformEvent.find({ org_id: orgId }).sort({ seq: 1 }).lean()).map((e) => e.seq);
      check('L3-2 org seq stays contiguous after group changes and the bounded fan-out', bSeqs.every((v, i) => v === i + 1));
    }

    // ── L3-4 (D4): karbexa-admin-backend services client → products-internal token ────────────────────────────────
    {
      const { getProductsInternalToken, resetProductsInternalToken } = await import('../platform/productsInternalToken');
      const SVC = `${ORIGIN}/realms/services`;
      let calls = 0;
      const countingFetch: typeof fetch = (u, i) => { calls++; return fetch(u, i); };
      resetProductsInternalToken();
      const t1 = await getProductsInternalToken({ fetchImpl: countingFetch });
      const t2 = await getProductsInternalToken({ fetchImpl: countingFetch });
      const c1 = jose.decodeJwt(t1);
      check('L3-4 getProductsInternalToken issues aud urn:karbexa:products-internal', c1.aud === 'urn:karbexa:products-internal', c1.aud);
      check('L3-4 token scope is exactly products.internal.read and client_id karbexa-admin-backend', c1.scope === 'products.internal.read' && (c1.client_id === 'karbexa-admin-backend' || c1.sub === 'karbexa-admin-backend'), { scope: c1.scope, client_id: c1.client_id, sub: c1.sub });
      check('L3-4 token is token_use service, RS256 at+jwt (services realm issues typ at+jwt)', c1.token_use === 'service' && jose.decodeProtectedHeader(t1).alg === 'RS256' && String(jose.decodeProtectedHeader(t1).typ).toLowerCase().replace('application/', '') === 'at+jwt', jose.decodeProtectedHeader(t1));
      check('L3-4 second call is served from cache (one token request)', t1 === t2 && calls === 1, { calls });
      resetProductsInternalToken(); calls = 0;
      const [s1, s2] = await Promise.all([getProductsInternalToken({ fetchImpl: countingFetch }), getProductsInternalToken({ fetchImpl: countingFetch })]);
      check('L3-4 concurrent callers are single-flight (one request, same token)', s1 === s2 && calls === 1, { calls });
      const exp = Number(jose.decodeJwt(s1).exp) * 1000;
      const t3 = await getProductsInternalToken({ fetchImpl: countingFetch, now: () => exp - 30_000 }); // inside the 60 s refresh margin
      check('L3-4 token is refreshed once it is within 60 s of exp', calls === 2 && !!t3, { calls });
      check('L3-4 the internal token is rejected by the Platform API (audience mismatch)', (await fetch(`${ORIGIN}/platform/v1/orgs`, { headers: { authorization: `Bearer ${t1}` } })).status === 401);

      const assertion = async (clientId: string, key: crypto.KeyObject | jose.CryptoKey, kid: string) => new jose.SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid }).setIssuer(clientId).setSubject(clientId).setAudience(SVC)
        .setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('2m').sign(key);
      const tokenCall = async (clientId: string, key: crypto.KeyObject | jose.CryptoKey, kid: string, scope: string, resource: string) => {
        const rr = await fetch(`${SVC}/oauth/token`, form({
          grant_type: 'client_credentials', client_id: clientId,
          client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: await assertion(clientId, key, kid), scope, resource,
        }));
        return { status: rr.status, json: await rr.json() as Record<string, string> };
      };
      const adminKey = crypto.createPrivateKey(process.env.ADMIN_BACKEND_CLIENT_KEY!);
      const adminKid = await jose.calculateJwkThumbprint(crypto.createPublicKey(adminKey).export({ format: 'jwk' }) as jose.JWK);
      const ok = await tokenCall('karbexa-admin-backend', adminKey, adminKid, 'products.internal.read', 'urn:karbexa:products-internal');
      check('L3-4 admin-backend token request with its own key = 200', ok.status === 200 && !!ok.json.access_token, ok);
      const bad1 = await tokenCall('karbexa-admin-backend', adminKey, adminKid, 'platform.org.read', 'urn:karbexa:platform-api');
      check('L3-4 admin-backend CANNOT obtain urn:karbexa:platform-api', bad1.status >= 400 && !bad1.json.access_token, bad1);
      const bad2 = await tokenCall('karbexa-admin-backend', adminKey, adminKid, 'platform.org.read', 'urn:karbexa:products-internal');
      check('L3-4 admin-backend CANNOT obtain a platform scope on products-internal', bad2.status >= 400 && !bad2.json.access_token, bad2);
      const bad3 = await tokenCall('karbexa-products-backend', backend.privateKey, 'smoke-backend-1', 'products.internal.read', 'urn:karbexa:products-internal');
      check('L3-4 karbexa-products-backend CANNOT obtain products-internal', bad3.status >= 400 && !bad3.json.access_token, bad3);
      const bad4 = await tokenCall('karbexa-admin-backend', backend.privateKey, 'smoke-backend-1', 'products.internal.read', 'urn:karbexa:products-internal');
      check('L3-4 an assertion signed with another client\'s key is rejected', bad4.status === 400 || bad4.status === 401, bad4);
      const pb = await tokenCall('karbexa-products-backend', backend.privateKey, 'smoke-backend-1', 'platform.org.read', 'urn:karbexa:platform-api');
      check('L3-4 products-backend still gets its platform-api token (typ at+jwt)', pb.status === 200 && String(jose.decodeProtectedHeader(pb.json.access_token).typ).toLowerCase().replace('application/', '') === 'at+jwt', pb.status);
      resetProductsInternalToken();

      // L3-6 (M4): Platform API budget is per authenticated client (router-level auth, then limiter)
      const orgsCall = (tok: string) => fetch(`${ORIGIN}/platform/v1/orgs`, { headers: { authorization: `Bearer ${tok}` } });
      const okCall = await orgsCall(pb.json.access_token);
      check('L3-6 platform call with a valid token = 200 and reports the per-client budget (RateLimit-Limit 1200)', okCall.status === 200 && Number(okCall.headers.get('ratelimit-limit')) === 1200, { status: okCall.status, limit: okCall.headers.get('ratelimit-limit') });
      process.env.PLATFORM_RATE_LIMIT_PER_MIN = '1';
      try {
        const over = await orgsCall(pb.json.access_token);
        check('L3-6 exceeding the client budget = 429 RATE_LIMITED', over.status === 429 && ((await over.json()) as { code?: string }).code === 'RATE_LIMITED', over.status);
        const noTok = await fetch(`${ORIGIN}/platform/v1/orgs`);
        const badTok = await orgsCall('not-a-jwt');
        check('L3-6 authentication precedes the limiter: no token = 401, bad token = 401 (not charged to the client)', noTok.status === 401 && badTok.status === 401, { noTok: noTok.status, badTok: badTok.status });
      } finally {
        delete process.env.PLATFORM_RATE_LIMIT_PER_MIN;
      }
      check('L3-6 default budget restored: the same client passes again', (await orgsCall(pb.json.access_token)).status === 200);
      const wrongScope = await fetch(`${ORIGIN}/platform/v1/orgs/${orgId}/events`, { headers: { authorization: `Bearer ${pb.json.access_token}` } });
      check('L3-6 per-route scope check still applies (platform.org.read token on events = 403 INSUFFICIENT_SCOPE)', wrongScope.status === 403 && ((await wrongScope.json()) as { code?: string }).code === 'INSUFFICIENT_SCOPE', wrongScope.status);

      // L3-7 (L7): service tokens must carry typ at+jwt (RFC 9068); forged with the services key so only the header differs
      {
        const svcKey = await jose.importJWK(servicesPrivateJwk, 'RS256');
        const forge = (typ: string | undefined) => new jose.SignJWT({ token_use: 'service', client_id: 'karbexa-products-backend', scope: 'platform.org.read' })
          .setProtectedHeader({ alg: 'RS256', kid: 'services-smoke', ...(typ ? { typ } : {}) })
          .setIssuer(`${ORIGIN}/realms/services`).setAudience('urn:karbexa:platform-api').setSubject('karbexa-products-backend')
          .setIssuedAt().setExpirationTime('5m').sign(svcKey);
        const st = async (typ: string | undefined) => (await orgsCall(await forge(typ))).status;
        check('L3-7 forged service token with typ at+jwt is accepted (control: only the header varies below)', (await st('at+jwt')) === 200);
        check('L3-7 typ application/at+jwt and AT+JWT are accepted', (await st('application/at+jwt')) === 200 && (await st('AT+JWT')) === 200);
        check('L3-7 typ JWT is rejected (401)', (await st('JWT')) === 401);
        check('L3-7 missing typ is rejected (401)', (await st(undefined)) === 401);
        check('L3-7 typ at+jwt+x (lookalike) is rejected (401)', (await st('at+jwt+x')) === 401);
      }

      // L3-7 (D6): /sessions/revocations realm filter (default = all realms)
      {
        const mkRevoked = async (realm: 'tenant' | 'operator') => {
          const sid = crypto.randomUUID();
          await Session.create({
            _id: sid, identity_id: new mongoose.Types.ObjectId(), member_id: me._id, company_id: orgId, realm, revoked_at: new Date(), revoked_reason: 'smoke-d6',
            idle_expires_at: new Date(Date.now() + 3600e3), absolute_expires_at: new Date(Date.now() + 3600e3), amr: ['pwd'],
          });
          return sid;
        };
        const tSid = await mkRevoked('tenant');
        const oSid = await mkRevoked('operator');
        const tkSess = (await tokenCall('karbexa-products-backend', backend.privateKey, 'smoke-backend-1', 'platform.sessions.read', 'urn:karbexa:platform-api')).json.access_token;
        const revs = async (qs: string) => {
          const rr = await fetch(`${ORIGIN}/platform/v1/sessions/revocations${qs}`, { headers: { authorization: `Bearer ${tkSess}` } });
          return { status: rr.status, rows: (await rr.json().catch(() => [])) as { sid: string }[] };
        };
        const all = await revs('?limit=1000');
        check('L3-7 revocations without realm = all realms (tenant and operator rows both present)', all.status === 200 && all.rows.some((r) => r.sid === tSid) && all.rows.some((r) => r.sid === oSid), all.rows.length);
        const ten = await revs('?realm=tenant&limit=1000');
        check('L3-7 revocations realm=tenant excludes operator sessions', ten.status === 200 && ten.rows.some((r) => r.sid === tSid) && !ten.rows.some((r) => r.sid === oSid), ten.rows.length);
        const opr = await revs('?realm=operator&limit=1000');
        check('L3-7 revocations realm=operator returns only operator sessions', opr.status === 200 && opr.rows.some((r) => r.sid === oSid) && !opr.rows.some((r) => r.sid === tSid), opr.rows.length);
        check('L3-7 revocations realm=bogus = 400', (await revs('?realm=admin')).status === 400);
        const since = new Date(Date.now() - 60_000).toISOString();
        const tenSince = await revs(`?realm=tenant&since=${since}&after_sid=${tSid}&limit=1000`);
        check('L3-7 realm filter composes with the since/after_sid keyset cursor', tenSince.status === 200 && !tenSince.rows.some((r) => r.sid === oSid), tenSince.rows.length);
      }
    }

    // ── E10: OPERATOR_IP_ALLOWLIST (read per request from env; req.ip with TRUST_PROXY=0, so X-Forwarded-For is ignored) ──
    {
      const prev = process.env.OPERATOR_IP_ALLOWLIST;
      const status = async (extra: Record<string, string> = {}) => (await fetch(`${OP}/orgs`, { headers: { authorization: `Bearer ${tok.access_token}`, ...extra } })).status;
      try {
        process.env.OPERATOR_IP_ALLOWLIST = '127.0.0.1';
        check('E10 allow-list: listed IP (127.0.0.1) passes', (await status()) === 200);
        process.env.OPERATOR_IP_ALLOWLIST = '10.9.8.7, 127.0.0.0/8';
        check('E10 allow-list: CIDR match (with spaces) passes', (await status()) === 200);
        process.env.OPERATOR_IP_ALLOWLIST = '203.0.113.0/24,198.51.100.5';
        check('E10 allow-list: non-listed IP = 403', (await status()) === 403);
        check('E10 allow-list: X-Forwarded-For cannot spoof an allowed IP (proxy not trusted)', (await status({ 'x-forwarded-for': '203.0.113.9' })) === 403);
        process.env.OPERATOR_IP_ALLOWLIST = '203.0.113.0/24';
        const noTok = await fetch(`${OP}/orgs`);
        check('E10 allow-list: 403 precedes auth for non-listed IP', noTok.status === 403, noTok.status);
        // L3-5 (M2): the operator OIDC realm is gated by the same list; the tenant realm is not
        const realmStatus = async (extra: Record<string, string> = {}) => (await fetch(`${REALM}/.well-known/openid-configuration`, { headers: extra })).status;
        check('L3-5 /realms/operator discovery: non-listed IP = 403', (await realmStatus()) === 403);
        check('L3-5 /realms/operator: X-Forwarded-For cannot spoof an allowed IP', (await realmStatus({ 'x-forwarded-for': '203.0.113.9' })) === 403);
        check('L3-5 /realms/operator token endpoint is gated too', (await fetch(`${REALM}/oauth/token`, form({ grant_type: 'authorization_code', code: 'x', client_id: 'karbexa-operator-spa' }))).status === 403);
        check('L3-5 /realms/tenant is NOT gated by the operator allow-list', (await fetch(`${ORIGIN}/realms/tenant/.well-known/openid-configuration`)).status === 200);
        process.env.OPERATOR_IP_ALLOWLIST = '127.0.0.1';
        check('L3-5 /realms/operator: listed IP passes', (await realmStatus()) === 200);
        // L3-5 (D-4): production + empty list fails closed; production + list passes; development + empty list stays open
        const prevNodeEnv = process.env.NODE_ENV;
        try {
          process.env.NODE_ENV = 'production';
          process.env.OPERATOR_IP_ALLOWLIST = '';
          check('L3-5 production + empty allow-list: /operator/v1 with a valid token = 403 (fail closed)', (await status()) === 403);
          check('L3-5 production + empty allow-list: /operator/v1 without a token = 403', (await fetch(`${OP}/orgs`)).status === 403);
          check('L3-5 production + empty allow-list: /realms/operator = 403', (await realmStatus()) === 403);
          process.env.OPERATOR_IP_ALLOWLIST = ' , ,';
          check('L3-5 production + whitespace/comma-only allow-list is also empty = 403', (await status()) === 403);
          process.env.OPERATOR_IP_ALLOWLIST = '127.0.0.1';
          check('L3-5 production + allow-list containing the caller: /operator/v1 = 200', (await status()) === 200);
          delete process.env.TRUST_PROXY;
          let bootError = '';
          try { await createServer(); } catch (err) { bootError = (err as Error).message; }
          check('L3-5 production boot without TRUST_PROXY throws', /TRUST_PROXY must be set explicitly/.test(bootError), bootError);
        } finally {
          process.env.NODE_ENV = prevNodeEnv;
          process.env.TRUST_PROXY = '0';
        }
        process.env.OPERATOR_IP_ALLOWLIST = '';
        check('L3-5 development + empty allow-list still allows (smoke default)', (await status()) === 200 && (await realmStatus()) === 200);
        process.env.OPERATOR_IP_ALLOWLIST = '203.0.113.0/24';
      } finally {
        if (prev === undefined) delete process.env.OPERATOR_IP_ALLOWLIST; else process.env.OPERATOR_IP_ALLOWLIST = prev;
      }
      check('E10 allow-list restored: operator API passes again', (await status()) === 200);
    }

    // ── plan assignment activates products ───────────────────────────────────────────────
    res = await op(`/orgs/${orgId}`, 'PATCH', { plan_key: 'enterprise' });
    const enterprise = await Plan.findOne({ key: 'enterprise' });
    const activeKeys = (await OrganizationEntitlement.find({ company_id: orgId, status: 'active' })).map((e) => e.product_key);
    check('E10 PATCH /orgs/:id {plan_key} activates plan products (suspended ones stay suspended)', res.status === 200 && !!enterprise && enterprise.products.includes('desk') && activeKeys.includes('desk') && !activeKeys.includes('projects'), { status: res.status, activeKeys });

    // ── E4: platform read API, ack hook, dispatcher ───────────────────────────────────────
    {
      const { PlatformEventSubscription, SubscriptionCursor } = await import('../models');
      const { dispatchOnce, verifyNudgeSignature } = await import('../lib/platformDispatcher');
      const { assertSafeSubscriberUrl } = await import('../lib/ssrfGuard');
      const mint = async (scope: string) => {
        const a = await new jose.SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'smoke-backend-1' })
          .setIssuer('karbexa-products-backend').setSubject('karbexa-products-backend').setAudience(SERVICES)
          .setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('2m').sign(backend.privateKey);
        const t = await (await fetch(`${SERVICES}/oauth/token`, form({
          grant_type: 'client_credentials', client_id: 'karbexa-products-backend',
          client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: a,
          scope, resource: 'urn:karbexa:platform-api',
        }))).json() as Record<string, string>;
        return t.access_token;
      };
      const P = `${ORIGIN}/platform/v1`;
      const tkAll = await mint('platform.org.read platform.events.read platform.members.read platform.sessions.read');
      check('E4 service token with read scopes minted', !!tkAll);
      const get = (path: string, token: string | undefined = tkAll) => fetch(`${P}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

      // second org for cross-org checks
      res = await op('/orgs', 'POST', { name: 'Beta Inc', slug: 'beta', plan_key: 'professional', first_admin: { email: 'admin@beta.test', full_name: 'Bea Admin' } });
      const betaId = ((await res.json()) as { data?: { id: string } }).data?.id || '';
      check('E4 second org provisioned', res.status === 201 && !!betaId, res.status);

      // events
      const dbEvents = await PlatformEvent.find({ org_id: orgId }).sort({ seq: 1 }).lean();
      res = await get(`/orgs/${orgId}/events?after_seq=0`);
      const ev0 = await res.json() as { events: any[]; latest_seq: number; has_more: boolean };
      check('E4 events after_seq=0 = 200 no-store', res.status === 200 && /no-store/.test(res.headers.get('cache-control') || ''), res.status);
      check('E4 events envelopes ordered and match PlatformEvent rows', ev0.events.length === dbEvents.length && ev0.events.every((e, i) =>
        e.id === dbEvents[i].id && e.seq === dbEvents[i].seq && e.type === dbEvents[i].type && e.version === dbEvents[i].version
        && e.org_id === String(orgId) && e.subject.id === dbEvents[i].subject.id && e.actor.type === dbEvents[i].actor.type
        && e.correlation_id === dbEvents[i].correlation_id && !!e.occurred_at && e.data !== undefined), ev0.events.map((e) => e.seq));
      check('E4 events latest_seq = last seq, has_more false', ev0.latest_seq === dbEvents[dbEvents.length - 1].seq && ev0.has_more === false, { l: ev0.latest_seq, h: ev0.has_more });
      const N = dbEvents[2].seq;
      const evN = await (await get(`/orgs/${orgId}/events?after_seq=${N}`)).json() as { events: any[] };
      check('E4 events after_seq=N returns only newer', evN.events.length === dbEvents.length - N && evN.events.every((e) => e.seq > N) && evN.events[0]?.seq === N + 1, evN.events.map((e) => e.seq));
      const evL = await (await get(`/orgs/${orgId}/events?after_seq=0&limit=2`)).json() as { events: any[]; has_more: boolean };
      check('E4 events limit=2 -> 2 events and has_more true', evL.events.length === 2 && evL.has_more === true && evL.events[0].seq === 1, evL);
      res = await get(`/orgs/${orgId}/events?after_seq=0&limit=0`);
      check('E4 events limit=0 = 400', res.status === 400, res.status);
      res = await get(`/orgs/${orgId}/events?after_seq=abc`);
      check('E4 events after_seq=abc = 400', res.status === 400, res.status);
      res = await get(`/orgs/${orgId}/events?after_seq=0`, svc.access_token);
      check('E4 events with wrong-scope token = 403', res.status === 403, res.status);
      res = await get(`/orgs/${orgId}/events?after_seq=0`, '');
      check('E4 events without token = 401', res.status === 401, res.status);
      res = await get(`/orgs/${new mongoose.Types.ObjectId()}/events?after_seq=0`);
      check('E4 events unknown org = 404', res.status === 404, res.status);

      // cross-org isolation
      const betaEv = await (await get(`/orgs/${betaId}/events?after_seq=0`)).json() as { events: any[] };
      check('E4 cross-org: beta events only carry beta org_id', betaEv.events.length > 0 && betaEv.events.every((e) => e.org_id === betaId), betaEv.events.map((e) => e.org_id));
      const betaMem = await (await get(`/orgs/${betaId}/members`)).json() as { items: any[]; next_cursor: string | null };
      const betaUserIds = (await User.find({ company_id: betaId })).map((u) => String(u._id));
      check('E4 cross-org: beta members only beta users', betaMem.items.length === betaUserIds.length && betaMem.items.every((m) => betaUserIds.includes(String(m.id))), betaMem.items.map((m) => m.id));

      // orgs list
      const orgsList = await (await get('/orgs')).json() as { items: { id: string; latest_seq: number }[] };
      const counterNow = (await OrgEventCounter.findById(orgId))?.seq;
      check('E4 GET /orgs lists latest_seq = OrgEventCounter', orgsList.items.find((o) => o.id === String(orgId))?.latest_seq === counterNow && orgsList.items.some((o) => o.id === betaId), orgsList);

      // members paging + single
      const allMem = await (await get(`/orgs/${orgId}/members`)).json() as { items: any[] };
      const pg = await (await get(`/orgs/${orgId}/members?limit=1`)).json() as { items: any[]; next_cursor: string | null };
      check('E4 members limit=1 -> 1 item with next_cursor (when >1 member)', pg.items.length === 1 && (allMem.items.length < 2 || !!pg.next_cursor), pg);
      if (pg.next_cursor) {
        const pg2 = await (await get(`/orgs/${orgId}/members?limit=1&cursor=${pg.next_cursor}`)).json() as { items: any[] };
        check('E4 members next page differs from first', pg2.items.length === 1 && pg2.items[0].id !== pg.items[0].id, pg2.items.map((m) => m.id));
      }
      res = await get(`/orgs/${orgId}/members/${me._id}`);
      const one = await res.json() as Record<string, unknown>;
      check('E4 single member = 200 with expected shape', res.status === 200 && one.email === me.email && 'authz_ver' in one && 'lifecycle_state' in one, one);
      check('E4 member views expose no password/secret fields', ![...Object.keys(one), ...allMem.items.flatMap((m) => Object.keys(m))].some((k) => /pass|secret|hash|totp|mfa|token/i.test(k)), Object.keys(one));
      res = await get(`/orgs/${betaId}/members/${me._id}`);
      check('E4 member of another org = 404', res.status === 404, res.status);
      res = await get(`/orgs/${orgId}/departments`);
      check('E4 departments = 200 array', res.status === 200 && Array.isArray(await res.json()), res.status);
      res = await get(`/orgs/${orgId}/locations`);
      check('E4 locations = 200 array', res.status === 200 && Array.isArray(await res.json()), res.status);

      // session revocations
      const revSid = crypto.randomUUID();
      await Session.create({
        _id: revSid, identity_id: new mongoose.Types.ObjectId(), member_id: me._id, company_id: orgId, realm: 'tenant',
        idle_expires_at: new Date(Date.now() + 3600e3), absolute_expires_at: new Date(Date.now() + 3600e3), amr: ['pwd'], revoked_at: new Date(), revoked_reason: 'smoke',
      });
      const revs = await (await get('/sessions/revocations')).json() as { sid: string; member_id: string; org_id: string }[];
      check('E4 /sessions/revocations returns the revoked session', revs.some((r) => r.sid === revSid && String(r.org_id) === String(orgId)), revs);

      // dispatcher + ack hook
      const hits: { sig: string; body: string }[] = [];
      let failMode = false;
      const sink = http.createServer((rq, rs) => {
        let b = '';
        rq.on('data', (c) => (b += c));
        rq.on('end', () => { hits.push({ sig: String(rq.headers['x-karbexa-signature']), body: b }); rs.statusCode = failMode ? 500 : 204; rs.end(); });
      });
      await new Promise<void>((r) => sink.listen(0, '127.0.0.1', () => r()));
      const SECRET_ENV = 'PLATFORM_SUB_SECRET_SMOKE';
      const NUDGE_SECRET = crypto.randomBytes(24).toString('hex');
      process.env[SECRET_ENV] = NUDGE_SECRET;
      try {
        const sub = await PlatformEventSubscription.create({ name: 'karbexa-products-backend', url: `http://127.0.0.1:${(sink.address() as { port: number }).port}/hook`, secret_ref: SECRET_ENV });
        const seqOf = async (id: unknown) => (await OrgEventCounter.findById(id))?.seq as number;
        const activeOrgs = await OrgEventCounter.countDocuments({ seq: { $gt: 0 } });
        const r1 = await dispatchOnce();
        check('E4 dispatcher nudges once per org with events', r1.nudged === activeOrgs && r1.failed === 0 && hits.length === activeOrgs, { r1, hits: hits.length, activeOrgs });
        const hit = hits.map((h) => ({ ...h, j: JSON.parse(h.body) })).find((h) => h.j.org_id === String(orgId));
        check('E4 nudge body is exactly {org_id, latest_seq}', !!hit && Object.keys(hit.j).sort().join() === 'latest_seq,org_id' && hit.j.latest_seq === (await seqOf(orgId)), hit?.j);
        check('E4 nudge signature verifies', !!hit && verifyNudgeSignature(NUDGE_SECRET, hit.sig, hit.body), hit?.sig);
        check('E4 nudge signature rejects wrong secret / tampered body / tampered mac', !!hit && !verifyNudgeSignature('other', hit.sig, hit.body)
          && !verifyNudgeSignature(NUDGE_SECRET, hit.sig, hit.body.replace(/\d/, (d) => String((Number(d) + 1) % 10)))
          && !verifyNudgeSignature(NUDGE_SECRET, hit.sig.replace(/v1=./, (m) => (m.endsWith('0') ? 'v1=1' : 'v1=0')), hit.body)
          && !verifyNudgeSignature(NUDGE_SECRET, '', hit.body) && !verifyNudgeSignature(NUDGE_SECRET, 'garbage', hit.body));
        const oldT = Math.floor(Date.now() / 1000) - 1000;
        const oldSig = `t=${oldT},v1=${crypto.createHmac('sha256', NUDGE_SECRET).update(`${oldT}.${hit?.body}`).digest('hex')}`;
        check('E4 nudge signature with old timestamp rejected (valid mac)', !verifyNudgeSignature(NUDGE_SECRET, oldSig, hit!.body) && verifyNudgeSignature(NUDGE_SECRET, oldSig, hit!.body, 5000));
        let cur = await SubscriptionCursor.findOne({ subscription_id: sub._id, org_id: orgId });
        check('E4 cursor.last_nudged_seq updated', cur?.last_nudged_seq === (await seqOf(orgId)) && !cur?.last_error, cur?.toObject());

        const before = hits.length;
        const r2 = await dispatchOnce();
        check('E4 second dispatchOnce sends nothing', r2.nudged === 0 && r2.failed === 0 && hits.length === before, { r2, hits: hits.length });

        // ack hook: informational cursor update for the subscription named like the calling client
        await get(`/orgs/${orgId}/events?after_seq=${N}`);
        const settle = () => new Promise((r) => setTimeout(r, 300)); // ack is written after the response is sent
        await settle();
        cur = await SubscriptionCursor.findOne({ subscription_id: sub._id, org_id: orgId });
        check('E4 ack hook: last_acknowledged_seq = after_seq', cur?.last_acknowledged_seq === N, cur?.toObject());
        await get(`/orgs/${orgId}/events?after_seq=1`);
        await settle();
        cur = await SubscriptionCursor.findOne({ subscription_id: sub._id, org_id: orgId });
        check('E4 ack hook never moves backwards', cur?.last_acknowledged_seq === N, cur?.last_acknowledged_seq);
        res = await get(`/orgs/${orgId}/events?after_seq=${N}`, await mint('platform.events.read'));
        check('E4 ack hook does not break the request', res.status === 200, res.status);

        // new event -> new nudge
        await runInTransaction(async (session) => {
          await emitPlatformEvent(session, { org_id: orgId, type: 'smoke.e4', subject: { type: 'org', id: String(orgId) }, actor: { type: 'system' } });
        });
        const newSeq = await seqOf(orgId);
        let nudgedBeforeFailure = newSeq; // advanced by the L3-7 lease block below
        const r3 = await dispatchOnce();
        const last = hits[hits.length - 1] && JSON.parse(hits[hits.length - 1].body);
        check('E4 new event -> exactly one new nudge with new latest_seq', r3.nudged === 1 && hits.length === before + 1 && last?.latest_seq === newSeq && last?.org_id === String(orgId), { r3, last });

        // L3-7 (L9): cross-instance lease; two dispatchers, one sends
        {
          const { dispatchCycle } = await import('../lib/platformDispatcher');
          const { acquireLease, releaseLease } = await import('../lib/platformLease');
          check('L3-7 lease: first holder acquires, a second holder is refused', (await acquireLease('smoke-lease', 'A', 60_000)) === true && (await acquireLease('smoke-lease', 'B', 60_000)) === false);
          check('L3-7 lease: the holder can renew, the other is still refused', (await acquireLease('smoke-lease', 'A', 60_000)) === true && (await acquireLease('smoke-lease', 'B', 60_000)) === false);
          await releaseLease('smoke-lease', 'B');
          check('L3-7 lease: a non-holder cannot release it', (await acquireLease('smoke-lease', 'B', 60_000)) === false);
          await releaseLease('smoke-lease', 'A');
          check('L3-7 lease: after release another holder acquires', (await acquireLease('smoke-lease', 'B', 1)) === true);
          await new Promise((r) => setTimeout(r, 25));
          check('L3-7 lease: an expired lease is taken over', (await acquireLease('smoke-lease', 'A', 60_000)) === true);
          await releaseLease('smoke-lease', 'A');

          await runInTransaction(async (session) => {
            await emitPlatformEvent(session, { org_id: orgId, type: 'smoke.l9', subject: { type: 'org', id: String(orgId) }, actor: { type: 'system' } });
          });
          const hitsBeforeL9 = hits.length;
          const [d1, d2] = await Promise.all([dispatchCycle('holder-A'), dispatchCycle('holder-B')]);
          check('L3-7 two concurrent dispatchers: exactly one runs, the other is skipped', [d1, d2].filter((d) => d.skipped).length === 1 && [d1, d2].filter((d) => !d.skipped).length === 1, { d1, d2 });
          check('L3-7 two concurrent dispatchers: exactly one nudge reaches the subscriber', hits.length === hitsBeforeL9 + 1 && d1.nudged + d2.nudged === 1, { hits: hits.length - hitsBeforeL9, d1, d2 });
          await releaseLease('platform-dispatcher', 'holder-A');
          await releaseLease('platform-dispatcher', 'holder-B');
          nudgedBeforeFailure = await seqOf(orgId);
        }

        // failure: 500 -> recorded, backoff, no storm
        failMode = true;
        await runInTransaction(async (session) => {
          await emitPlatformEvent(session, { org_id: orgId, type: 'smoke.e4', subject: { type: 'org', id: String(orgId) }, actor: { type: 'system' } });
        });
        const h0 = hits.length;
        const r4 = await dispatchOnce();
        cur = await SubscriptionCursor.findOne({ subscription_id: sub._id, org_id: orgId });
        check('E4 subscriber 500 -> failure recorded (last_error, attempts, next_attempt_at in future)', r4.failed === 1 && r4.nudged === 0 && /500/.test(cur?.last_error || '') && (cur?.attempts ?? 0) >= 1 && !!cur?.next_attempt_at && cur.next_attempt_at.getTime() > Date.now() && cur.last_nudged_seq === nudgedBeforeFailure, { r4, cur: cur?.toObject() });
        const r5 = await dispatchOnce();
        check('E4 no nudge storm: immediate retry skipped during backoff', r5.failed === 0 && r5.nudged === 0 && hits.length === h0 + 1, { r5, hits: hits.length - h0 });
        failMode = false;

        // SSRF guard
        const rejects = async (u: string) => assertSafeSubscriberUrl(u).then(() => false, () => true);
        check('E4 ssrf: credentials in URL rejected', await rejects('http://user:pw@127.0.0.1:9/x'));
        check('E4 ssrf: http to non-localhost rejected', await rejects('http://203.0.113.5/x'));
        check('E4 ssrf: localhost http allowed in dev', !(await rejects('http://127.0.0.1:9/x')));
        const prevEnv = process.env.NODE_ENV;
        try {
          process.env.NODE_ENV = 'production';
          check('E4 ssrf (prod): 169.254.169.254 rejected', await rejects('https://169.254.169.254/latest'));
          check('E4 ssrf (prod): 10.0.0.1 rejected', await rejects('https://10.0.0.1/x'));
          check('E4 ssrf (prod): [::1] rejected', await rejects('https://[::1]/x'));
          check('E4 ssrf (prod): http localhost rejected', await rejects('http://127.0.0.1/x'));
        } finally {
          process.env.NODE_ENV = prevEnv;
        }
      } finally {
        delete process.env[SECRET_ENV];
        await new Promise<void>((r) => sink.close(() => r()));
      }

      // 410 CURSOR_EXPIRED: purge early events of beta (raw collection bypasses the append-only guard)
      const betaCount = await PlatformEvent.countDocuments({ org_id: betaId });
      await PlatformEvent.collection.deleteMany({ org_id: new mongoose.Types.ObjectId(betaId), seq: { $lte: 2 } });
      res = await get(`/orgs/${betaId}/events?after_seq=1`);
      const gone = await res.json() as { code?: string };
      check('E4 purged cursor -> 410 CURSOR_EXPIRED', betaCount > 3 && res.status === 410 && gone.code === 'CURSOR_EXPIRED', { betaCount, status: res.status, gone });
      res = await get(`/orgs/${betaId}/events?after_seq=2`);
      check('E4 cursor at the purge boundary still served (200)', res.status === 200, res.status);
    }

    // ── E4b: tenant mutations emit domain + AuditEvent + PlatformEvent atomically ─────────────
    try {
      const { Role, HolidayCalendar, Holiday, Location, Department } = await import('../models');
      const SERVICES2 = `${ORIGIN}/realms/services`;
      const mintSvc = async (scope: string) => {
        const a = await new jose.SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'smoke-backend-1' })
          .setIssuer('karbexa-products-backend').setSubject('karbexa-products-backend').setAudience(SERVICES2)
          .setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('2m').sign(backend.privateKey);
        const tk = await (await fetch(`${SERVICES2}/oauth/token`, form({
          grant_type: 'client_credentials', client_id: 'karbexa-products-backend',
          client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: a,
          scope, resource: 'urn:karbexa:platform-api',
        }))).json() as Record<string, string>;
        return tk.access_token;
      };
      const mkSession = async (memberId: unknown, extra: Record<string, unknown> = {}) => {
        const sid = crypto.randomUUID();
        await Session.create({
          _id: sid, identity_id: new mongoose.Types.ObjectId(), member_id: memberId, company_id: orgId, realm: 'tenant',
          idle_expires_at: new Date(Date.now() + 3600e3), absolute_expires_at: new Date(Date.now() + 3600e3), amr: ['pwd'], ...extra,
        });
        return sid;
      };
      const adminSid = await mkSession(me._id);
      const tenantKey = await jose.importJWK(tenantPrivateJwk, 'RS256');
      const tAt = await new jose.SignJWT({ token_use: 'access', org: String(orgId), sid: adminSid, email: me.email })
        .setProtectedHeader({ alg: 'RS256', kid: 'tenant-smoke', typ: 'at+jwt' })
        .setIssuer(`${ORIGIN}/realms/tenant`).setAudience('urn:karbexa:admin').setSubject(String(me._id))
        .setIssuedAt().setExpirationTime('10m').sign(tenantKey);
      const API = `${ORIGIN}/api/v1`;
      const t = async (path: string, method: string, body: unknown, cid: string) => {
        const rr = await fetch(`${API}${path}`, {
          method, headers: { authorization: `Bearer ${tAt}`, 'content-type': 'application/json', 'x-correlation-id': cid }, body: body ? JSON.stringify(body) : undefined,
        });
        return { status: rr.status, text: await rr.text() };
      };
      const evsOf = (cid: string) => PlatformEvent.find({ org_id: orgId, correlation_id: cid }).sort({ seq: 1 }).lean();
      const ofType = (list: any[], type: string) => list.filter((e) => e.type === type);
      const auditHasCid = async (label: string, action: string, cid: string, list: any[]) => {
        const ae = await AuditEvent.findOne({ company_id: orgId, action, correlation_id: cid }).lean();
        check(`E4b ${label}: AuditEvent(${action}).correlation_id == events' correlation_id`, !!ae && list.length > 0 && list.every((e) => e.correlation_id === ae.correlation_id), { ae: ae?.correlation_id, evs: list.map((e) => e.correlation_id) });
      };
      const asActor = (list: any[]) => list.length > 0 && list.every((e) => e.actor.type === 'member' && e.actor.id === String(me._id));

      // org structure: location + departments
      let r = await t('/locations', 'POST', { name: 'Smoke HQ', type: 'region', timezone: 'Europe/London' }, 'e4b-loc-create');
      const loc = await Location.findOne({ company_id: orgId, name: 'Smoke HQ' });
      check('E4b location create = 201', r.status === 201 && !!loc, `${r.status} ${r.text.slice(0, 200)}`);
      let evs = await evsOf('e4b-loc-create');
      check('E4b location create -> org_structure.changed (subject location)', ofType(evs, 'org_structure.changed').length === 1 && ofType(evs, 'org_structure.changed')[0].subject.type === 'location' && ofType(evs, 'org_structure.changed')[0].subject.id === String(loc?._id) && asActor(evs), evs.map((e) => [e.type, e.subject]));
      await auditHasCid('location create', 'location.created', 'e4b-loc-create', evs);
      const locId = String(loc?._id);

      r = await t('/organization', 'POST', { name: 'Smoke BU A', type: 'business_unit' }, 'e4b-dept-create');
      const deptA = await Department.findOne({ company_id: orgId, name: 'Smoke BU A' });
      check('E4b department create = 201', r.status === 201 && !!deptA, `${r.status} ${r.text.slice(0, 200)}`);
      evs = await evsOf('e4b-dept-create');
      check('E4b department create -> org_structure.changed (subject department)', ofType(evs, 'org_structure.changed').length === 1 && ofType(evs, 'org_structure.changed')[0].subject.id === String(deptA?._id) && asActor(evs), evs.map((e) => [e.type, e.subject]));
      await auditHasCid('department create', 'department.created', 'e4b-dept-create', evs);

      r = await t(`/organization/${deptA?._id}`, 'PUT', { name: 'Smoke BU A2' }, 'e4b-dept-update');
      evs = await evsOf('e4b-dept-update');
      check('E4b department update = 200 -> org_structure.changed', r.status === 200 && ofType(evs, 'org_structure.changed').length === 1 && ofType(evs, 'org_structure.changed')[0].subject.id === String(deptA?._id), `${r.status} ${r.text.slice(0, 200)}`);
      await auditHasCid('department update', 'department.updated', 'e4b-dept-update', evs);

      await t('/organization', 'POST', { name: 'Smoke BU B', type: 'business_unit' }, 'e4b-dept-create-b');
      const deptB = await Department.findOne({ company_id: orgId, name: 'Smoke BU B' });
      r = await t(`/organization/${deptB?._id}`, 'DELETE', undefined, 'e4b-dept-delete');
      evs = await evsOf('e4b-dept-delete');
      check('E4b department delete = 200 -> org_structure.changed data.deleted true', r.status === 200 && ofType(evs, 'org_structure.changed').length === 1 && (ofType(evs, 'org_structure.changed')[0].data as any)?.deleted === true && ofType(evs, 'org_structure.changed')[0].subject.id === String(deptB?._id), `${r.status} ${r.text.slice(0, 200)} ${JSON.stringify(evs.map((e) => e.data))}`);
      await auditHasCid('department delete', 'department.archived', 'e4b-dept-delete', evs);

      // invite member / update member
      r = await t('/people/invite', 'POST', { full_name: 'Smoke Member', email: 'smoke.member@acme.test', location_id: locId }, 'e4b-invite');
      const mem = await User.findOne({ company_id: orgId, email: 'smoke.member@acme.test' });
      check('E4b invite = 201', r.status === 201 && !!mem, `${r.status} ${r.text.slice(0, 300)}`);
      if (!mem) throw new Error(`invite did not create the member: ${r.status} ${r.text.slice(0, 400)}`);
      const memId = String(mem._id);
      evs = await evsOf('e4b-invite');
      const prov = ofType(evs, 'member.provisioned');
      check('E4b invite -> member.provisioned (subject member, lifecycle invited, email, location)', prov.length === 1 && prov[0].subject.id === memId && (prov[0].data as any).lifecycle_state === 'invited' && (prov[0].data as any).email === 'smoke.member@acme.test' && (prov[0].data as any).location_id === locId && asActor(evs), prov.map((e) => e.data));
      check('E4b invite -> app_access.changed for the new member', ofType(evs, 'app_access.changed').some((e) => e.subject.id === memId), evs.map((e) => e.type));
      await auditHasCid('invite', 'user.invited', 'e4b-invite', evs);

      const verBefore1 = (await User.findById(memId))?.authz_ver ?? 0;
      r = await t(`/people/${memId}`, 'PUT', { full_name: 'Smoke Member Renamed', department_id: String(deptA?._id) }, 'e4b-member-update');
      evs = await evsOf('e4b-member-update');
      const upd = ofType(evs, 'member.updated');
      const changedKeys = Object.keys((upd[0]?.data as any)?.changed || {}).sort().join();
      check('E4b member update = 200 -> member.updated with changed fields only', r.status === 200 && upd.length === 1 && changedKeys === 'department_id,full_name' && (upd[0].data as any).changed.full_name === 'Smoke Member Renamed' && (upd[0].data as any).changed.department_id === String(deptA?._id), `${r.status} ${r.text.slice(0, 200)} ${changedKeys}`);
      const aac = ofType(evs, 'app_access.changed').find((e) => e.subject.id === memId);
      const verAfter1 = (await User.findById(memId))?.authz_ver ?? 0;
      check('E4b member update -> authz_ver bumped and app_access.changed carries it', verAfter1 > verBefore1 && (aac?.data as any)?.authz_ver === verAfter1, { verBefore1, verAfter1, evt: (aac?.data as any)?.authz_ver });
      await auditHasCid('member update', 'user.updated', 'e4b-member-update', evs);
      r = await t(`/people/${memId}`, 'PUT', { full_name: 'Smoke Member Renamed' }, 'e4b-member-noop');
      evs = await evsOf('e4b-member-noop');
      check('E4b member update with no admin-field change emits no member.updated', r.status === 200 && ofType(evs, 'member.updated').length === 0, `${r.status} ${evs.map((e) => e.type)}`);

      // L3-3 (D3): phone / hire_date / avatar_url are admin-owned fields carried on member.updated; Dates compare by value
      r = await t(`/people/${memId}`, 'PUT', { phone: '5551234567' }, 'l33-phone');
      evs = await evsOf('l33-phone');
      const phoneEv = ofType(evs, 'member.updated');
      check('L3-3 changing phone = 200 -> member.updated {changed:{phone}} only', r.status === 200 && phoneEv.length === 1 && JSON.stringify((phoneEv[0].data as any).changed) === JSON.stringify({ phone: '5551234567' }), `${r.status} ${JSON.stringify(phoneEv.map((e) => e.data))}`);
      r = await t(`/people/${memId}`, 'PUT', { phone: '5551234567', hire_date: '2024-03-01' }, 'l33-hire');
      evs = await evsOf('l33-hire');
      const hireEv = ofType(evs, 'member.updated');
      check('L3-3 same phone + new hire_date -> changed has only hire_date (ISO string)', r.status === 200 && hireEv.length === 1 && JSON.stringify(Object.keys((hireEv[0].data as any).changed)) === JSON.stringify(['hire_date']) && /^2024-03-01T/.test((hireEv[0].data as any).changed.hire_date), `${r.status} ${JSON.stringify(hireEv.map((e) => e.data))}`);
      r = await t(`/people/${memId}`, 'PUT', { phone: '5551234567', hire_date: '2024-03-01' }, 'l33-hire-same');
      evs = await evsOf('l33-hire-same');
      check('L3-3 resending an identical hire_date (Date value) emits NO member.updated', r.status === 200 && ofType(evs, 'member.updated').length === 0, `${r.status} ${evs.map((e) => e.type)}`);
      r = await t(`/people/${memId}`, 'PUT', { avatar_url: 'https://cdn.acme.test/a.png' }, 'l33-avatar');
      evs = await evsOf('l33-avatar');
      check('L3-3 changing avatar_url -> member.updated {changed:{avatar_url}}', r.status === 200 && JSON.stringify((ofType(evs, 'member.updated')[0]?.data as any)?.changed) === JSON.stringify({ avatar_url: 'https://cdn.acme.test/a.png' }), `${r.status} ${JSON.stringify(ofType(evs, 'member.updated').map((e) => e.data))}`);
      {
        const tkM = await mintSvc('platform.members.read');
        const mv = await fetch(`${ORIGIN}/platform/v1/orgs/${orgId}/members/${memId}`, { headers: { authorization: `Bearer ${tkM}` } });
        const mj = await mv.json() as Record<string, unknown>;
        const memFresh = await User.findById(memId);
        check('L3-3 member view carries employee_id, hire_date (ISO), termination_date null, phone, avatar_url, identity_id', mv.status === 200
          && mj.employee_id === memFresh?.employee_id && !!memFresh?.employee_id && typeof mj.hire_date === 'string' && /^2024-03-01T/.test(String(mj.hire_date)) && mj.termination_date === null
          && mj.phone === '5551234567' && mj.avatar_url === 'https://cdn.acme.test/a.png' && 'identity_id' in mj && (mj.identity_id === null || typeof mj.identity_id === 'string'), mj);
        check('L3-3 member view still has no timezone key (D-3 open)', !('timezone' in mj) && !('time_zone' in mj), Object.keys(mj));
        const ml = await fetch(`${ORIGIN}/platform/v1/orgs/${orgId}/members?limit=500`, { headers: { authorization: `Bearer ${tkM}` } });
        const mlj = await ml.json() as { items: Record<string, unknown>[] };
        check('L3-3 members list uses the same view and is no-store', ml.status === 200 && /no-store/.test(ml.headers.get('cache-control') || '') && mlj.items.some((m) => m.id === memId && m.phone === '5551234567' && 'employee_id' in m && 'identity_id' in m), ml.status);
        const mOther = await fetch(`${ORIGIN}/platform/v1/orgs/${orgId}/members/${new mongoose.Types.ObjectId()}`, { headers: { authorization: `Bearer ${tkM}` } });
        check('L3-3 unknown member is 404', mOther.status === 404, mOther.status);
      }

      // lifecycle
      r = await t(`/people/${memId}/lifecycle`, 'PUT', { lifecycle_state: 'active' }, 'e4b-activate');
      check('E4b lifecycle invited->active = 200', r.status === 200, `${r.status} ${r.text.slice(0, 300)}`);
      const liveSid = await mkSession(memId);
      r = await t(`/people/${memId}/lifecycle`, 'PUT', { lifecycle_state: 'deactivated', reason: 'smoke suspend' }, 'e4b-suspend');
      evs = await evsOf('e4b-suspend');
      const sus = ofType(evs, 'member.suspended');
      check('E4b suspend = 200 -> member.suspended with session_ids containing the live Session', r.status === 200 && sus.length === 1 && sus[0].subject.id === memId && ((sus[0].data as any).session_ids || []).includes(liveSid) && (sus[0].data as any).reason === 'smoke suspend' && asActor(evs), `${r.status} ${r.text.slice(0, 200)} ${JSON.stringify(sus.map((e) => e.data))}`);
      const sessAfter = await Session.findById(liveSid);
      check('E4b suspend revokes the live Session (revoked_at + reason)', !!sessAfter?.revoked_at && /lifecycle_deactivated/.test(String(sessAfter?.revoked_reason)), sessAfter?.revoked_reason);
      check('E4b suspend -> app_access.changed for member (sids ride on member.suspended, no separate session.revoked)', ofType(evs, 'app_access.changed').some((e) => e.subject.id === memId) && ofType(evs, 'session.revoked').length === 0, evs.map((e) => e.type));
      await auditHasCid('suspend', 'user.lifecycle_changed', 'e4b-suspend', evs);

      r = await t(`/people/${memId}/lifecycle`, 'PUT', { lifecycle_state: 'active' }, 'e4b-reactivate');
      evs = await evsOf('e4b-reactivate');
      check('E4b reactivate = 200 -> member.reactivated + app_access.changed', r.status === 200 && ofType(evs, 'member.reactivated').length === 1 && (ofType(evs, 'member.reactivated')[0].data as any).lifecycle_state === 'active' && ofType(evs, 'app_access.changed').some((e) => e.subject.id === memId), `${r.status} ${evs.map((e) => e.type)}`);
      await auditHasCid('reactivate', 'user.lifecycle_changed', 'e4b-reactivate', evs);

      const fsid = await mkSession(memId);
      r = await t(`/security/force-logout/${memId}`, 'POST', undefined, 'e4b-force-logout');
      evs = await evsOf('e4b-force-logout');
      const fs = ofType(evs, 'session.revoked');
      check('E4b force logout = 200 -> session.revoked for the live sid', r.status === 200 && fs.length === 1 && (fs[0].data as any).sid === fsid && fs[0].subject.id === memId && !!(await Session.findById(fsid))?.revoked_at, `${r.status} ${r.text.slice(0, 200)} ${JSON.stringify(fs.map((e) => e.data))}`);
      await auditHasCid('force logout', 'security.force_logout', 'e4b-force-logout', evs);

      const tsid = await mkSession(memId);
      r = await t(`/people/${memId}/lifecycle`, 'PUT', { lifecycle_state: 'terminated' }, 'e4b-terminate');
      evs = await evsOf('e4b-terminate');
      const term = ofType(evs, 'member.terminated');
      check('E4b terminate = 200 -> member.terminated with termination_date', r.status === 200 && term.length === 1 && !!(term[0].data as any).termination_date, `${r.status} ${r.text.slice(0, 200)} ${JSON.stringify(term.map((e) => e.data))}`);
      check('E4b terminate -> session.revoked for live sid + app_access.changed', ofType(evs, 'session.revoked').some((e) => (e.data as any).sid === tsid) && ofType(evs, 'app_access.changed').some((e) => e.subject.id === memId) && !!(await Session.findById(tsid))?.revoked_at, evs.map((e) => e.type));
      await auditHasCid('terminate', 'user.lifecycle_changed', 'e4b-terminate', evs);
      // an invalid transition is rejected up-front and leaves no events/audit behind (true mid-txn rollback is covered by E4a)
      r = await t(`/people/${memId}/lifecycle`, 'PUT', { lifecycle_state: 'deactivated', reason: 'x' }, 'e4b-invalid');
      check('E4b invalid transition (terminated->deactivated) = 400 and emits nothing', r.status === 400 && (await evsOf('e4b-invalid')).length === 0 && !(await AuditEvent.findOne({ company_id: orgId, correlation_id: 'e4b-invalid' })), `${r.status} ${r.text.slice(0, 160)}`);

      // calendars
      r = await t('/holidays/calendars', 'POST', { name: 'Smoke Calendar' }, 'e4b-cal-create');
      const cal = await HolidayCalendar.findOne({ company_id: orgId, name: 'Smoke Calendar' });
      check('E4b calendar create = 201', r.status === 201 && !!cal, `${r.status} ${r.text.slice(0, 200)}`);
      r = await t(`/holidays/calendars/${cal?._id}/holidays`, 'POST', { name: 'Smoke Yearly Day', date: '2026-03-15', recurring_type: 'yearly' }, 'e4b-holiday-create');
      const hol = await Holiday.findOne({ calendar_id: cal?._id, name: 'Smoke Yearly Day' });
      evs = await evsOf('e4b-holiday-create');
      check('E4b holiday create = 201 -> calendar.changed (org subject, no assigned locations yet)', r.status === 201 && !!hol && ofType(evs, 'calendar.changed').length === 1 && JSON.stringify((ofType(evs, 'calendar.changed')[0].data as any).affected_location_ids) === '[]' && ofType(evs, 'calendar.changed')[0].subject.id === String(orgId), `${r.status} ${r.text.slice(0, 200)} ${JSON.stringify(evs.map((e) => e.data))}`);
      await auditHasCid('holiday create', 'holiday.created', 'e4b-holiday-create', evs);
      r = await t('/holidays/assignments', 'POST', { location_id: locId, calendar_id: String(cal?._id), is_primary: true, effective_date: '2020-01-01' }, 'e4b-hol-assign');
      evs = await evsOf('e4b-hol-assign');
      check('E4b holiday assignment = 201 -> calendar.changed with affected_location_ids [location]', r.status === 201 && ofType(evs, 'calendar.changed').length === 1 && JSON.stringify((ofType(evs, 'calendar.changed')[0].data as any).affected_location_ids) === JSON.stringify([locId]), `${r.status} ${r.text.slice(0, 200)} ${JSON.stringify(evs.map((e) => e.data))}`);
      r = await t(`/holidays/holidays/${hol?._id}`, 'PUT', { name: 'Smoke Yearly Day 2' }, 'e4b-holiday-update');
      evs = await evsOf('e4b-holiday-update');
      check('E4b holiday update after assignment -> calendar.changed affected_location_ids includes location', r.status === 200 && ofType(evs, 'calendar.changed').some((e) => ((e.data as any).affected_location_ids || []).includes(locId)), `${r.status} ${JSON.stringify(evs.map((e) => e.data))}`);

      // company settings + role assign
      r = await t('/company/settings/company-name', 'PUT', { name: 'Acme Corp Renamed' }, 'e4b-company-name');
      evs = await evsOf('e4b-company-name');
      check('E4b company name update = 200 -> org.updated (org subject)', r.status === 200 && ofType(evs, 'org.updated').length === 1 && ofType(evs, 'org.updated')[0].subject.id === String(orgId) && asActor(evs), `${r.status} ${r.text.slice(0, 200)} ${evs.map((e) => e.type)}`);
      await auditHasCid('company name', 'company.name_updated', 'e4b-company-name', evs);

      const anyRole: any = (await Role.find({ company_id: orgId, is_active: true }).lean()).find((x: any) => /employee/i.test(x.name || x.key || '')) || (await Role.findOne({ company_id: orgId }).lean());
      const verBefore2 = (await User.findById(memId))?.authz_ver ?? 0;
      r = await t(`/roles/${anyRole?._id}/users`, 'POST', { user_id: memId }, 'e4b-role-assign');
      evs = await evsOf('e4b-role-assign');
      const verAfter2 = (await User.findById(memId))?.authz_ver ?? 0;
      check('E4b role assign = 201 -> app_access.changed for user (authz_ver bumped)', r.status === 201 && ofType(evs, 'app_access.changed').some((e) => e.subject.id === memId && (e.data as any).authz_ver === verAfter2) && verAfter2 > verBefore2, `${r.status} ${r.text.slice(0, 200)} ${verBefore2}->${verAfter2}`);
      await auditHasCid('role assign', 'roles.user_assigned', 'e4b-role-assign', evs);
      r = await t(`/roles/${anyRole?._id}/users/${memId}`, 'DELETE', undefined, 'e4b-role-unassign');
      evs = await evsOf('e4b-role-unassign');
      check('E4b role unassign = 200 -> app_access.changed', r.status === 200 && ofType(evs, 'app_access.changed').some((e) => e.subject.id === memId), `${r.status} ${r.text.slice(0, 200)} ${evs.map((e) => e.type)}`);

      const seqs = (await PlatformEvent.find({ org_id: orgId }).sort({ seq: 1 }).lean()).map((e) => e.seq);
      check('E4b org seq contiguous 1..N after all tenant mutations', seqs.every((v, i) => v === i + 1) && (await OrgEventCounter.findById(orgId))?.seq === seqs.length, { n: seqs.length });

      // GET /platform/v1/orgs/:id/calendars/effective
      const P2 = `${ORIGIN}/platform/v1`;
      const tkRead = await mintSvc('platform.org.read');
      const g = async (path: string, token: string | undefined = tkRead) => {
        const x = await fetch(`${P2}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
        return { status: x.status, headers: x.headers, json: (await x.json().catch(() => ({}))) as any };
      };
      const otherOrg = (await Company.findOne({ slug: 'beta' }))?._id;
      const base = `/orgs/${orgId}/calendars/effective`;
      check('E4b calendars/effective: no member_id/location_id = 400', (await g(`${base}?from=2026-01-01&to=2026-01-31`)).status === 400);
      check('E4b calendars/effective: missing dates = 400', (await g(`${base}?location_id=${locId}`)).status === 400);
      check('E4b calendars/effective: invalid dates = 400', (await g(`${base}?location_id=${locId}&from=abc&to=2026-01-31`)).status === 400);
      check('E4b calendars/effective: to before from = 400', (await g(`${base}?location_id=${locId}&from=2026-02-01&to=2026-01-01`)).status === 400);
      check('E4b calendars/effective: range > 366 days = 400', (await g(`${base}?location_id=${locId}&from=2026-01-01&to=2027-01-05`)).status === 400);
      check('E4b calendars/effective: no token = 401', (await g(`${base}?location_id=${locId}&from=2026-01-01&to=2026-01-31`, '')).status === 401);
      check('E4b calendars/effective: member of another org = 404', (await g(`/orgs/${otherOrg}/calendars/effective?member_id=${memId}&from=2026-01-01&to=2026-01-31`)).status === 404);
      check('E4b calendars/effective: unknown org = 404', (await g(`/orgs/${new mongoose.Types.ObjectId()}/calendars/effective?location_id=${locId}&from=2026-01-01&to=2026-01-31`)).status === 404);
      check('E4b calendars/effective: location of another org = 404', (await g(`/orgs/${otherOrg}/calendars/effective?location_id=${locId}&from=2026-01-01&to=2026-01-31`)).status === 404);
      let ce = await g(`${base}?location_id=${locId}&from=2026-03-01&to=2026-03-31`);
      check('E4b calendars/effective: happy path expands assigned yearly holiday in range', ce.status === 200 && /no-store/.test(ce.headers.get('cache-control') || '') && ce.json.holidays?.length === 1 && ce.json.holidays[0].date === '2026-03-15' && ce.json.holidays[0].name === 'Smoke Yearly Day 2' && ce.json.holidays[0].calendar_id === String(cal?._id) && ce.json.holidays[0].recurring_type === 'yearly', ce.json);
      ce = await g(`${base}?member_id=${memId}&from=2026-03-01&to=2026-03-31`);
      check('E4b calendars/effective: member_id resolves the member location', ce.status === 200 && ce.json.holidays?.length === 1 && ce.json.holidays[0].date === '2026-03-15', ce.json);
      ce = await g(`${base}?location_id=${locId}&from=2026-04-01&to=2026-04-30`);
      check('E4b calendars/effective: out-of-range month has no holidays', ce.status === 200 && ce.json.holidays?.length === 0 && 'work_schedule' in ce.json, ce.json);
      ce = await g(`${base}?location_id=${locId}&from=2026-01-01&to=2026-12-31`);
      check('E4b calendars/effective: 365-day range accepted', ce.status === 200 && ce.json.holidays?.length === 1, ce.status);

      // PUT /platform/v1/apps/:productKey/role-catalog
      const tkW = await mintSvc('platform.role_catalog.write');
      const put = async (key: string, body: unknown, token: string | undefined = tkW) => {
        const x = await fetch(`${P2}/apps/${key}/role-catalog`, { method: 'PUT', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
        return { status: x.status, json: (await x.json().catch(() => ({}))) as any };
      };
      const signRows = await ProductRole.find({ product_key: 'sign' }).lean();
      const catBody = (v: number, rows: any[]) => ({ version: v, roles: rows.map((x) => ({ key: x.key, name: x.name, description: x.description, rank: x.rank, is_default: !!x.is_default, assignable: x.assignable !== false })) });
      const signApp2: any = await App.findOne({ product_key: 'sign', app_type: 'karbexa_product' }).lean();
      const v0 = signApp2?.role_catalog_version ?? 1;
      check('E4b role-catalog: wrong scope = 403', (await put('sign', catBody(v0 + 1, signRows), tkRead)).status === 403);
      check('E4b role-catalog: no token = 401', (await put('sign', catBody(v0 + 1, signRows), '')).status === 401);
      check('E4b role-catalog: unknown product = 404', (await put('nope', catBody(v0 + 1, signRows))).status === 404);
      check('E4b role-catalog: invalid body (no default) = 400', (await put('sign', { version: v0 + 1, roles: signRows.map((x: any) => ({ key: x.key, name: x.name, rank: x.rank })) })).status === 400);
      const p1 = await put('sign', catBody(v0 + 1, signRows));
      check('E4b role-catalog: valid catalog = 200 with version + roles', p1.status === 200 && p1.json.version === v0 + 1 && p1.json.roles?.length === signRows.length, p1.json);
      const p2 = await put('sign', catBody(v0 + 1, signRows));
      check('E4b role-catalog: re-PUT identical catalog is idempotent (same body, same row count)', p2.status === 200 && JSON.stringify(p2.json) === JSON.stringify(p1.json) && (await ProductRole.countDocuments({ product_key: 'sign' })) === signRows.length, p2.json);
      check('E4b role-catalog: App.role_catalog_version updated', (await App.findOne({ product_key: 'sign', app_type: 'karbexa_product' }))?.role_catalog_version === v0 + 1);
      const victim = signRows.find((x: any) => !x.is_default);
      const victimAssign = await AppAssignment.create({ company_id: orgId, app_id: signApp2._id, granted_by: me._id, is_active: true, product_role_key: victim!.key, target_type: 'user', target_id: me._id } as never);
      const keep = signRows.filter((x: any) => x.key !== victim!.key);
      const p3 = await put('sign', catBody(v0 + 2, keep));
      check('E4b role-catalog: removing a role in active use = 409 ROLE_IN_USE', p3.status === 409 && p3.json.code === 'ROLE_IN_USE' && (p3.json.roles || []).includes(victim!.key), p3.json);
      check('E4b role-catalog: 409 leaves catalog unchanged (roles + version)', (await ProductRole.countDocuments({ product_key: 'sign' })) === signRows.length && !!(await ProductRole.findOne({ product_key: 'sign', key: victim!.key })) && (await App.findOne({ product_key: 'sign', app_type: 'karbexa_product' }))?.role_catalog_version === v0 + 1);
      await AppAssignment.updateOne({ _id: victimAssign._id }, { $set: { is_active: false } });
      const p4 = await put('sign', catBody(v0 + 2, keep));
      check('E4b role-catalog: removing an unused role = 200 and the role is gone', p4.status === 200 && !(await ProductRole.findOne({ product_key: 'sign', key: victim!.key })), p4.json);
      const p5 = await put('sign', catBody(v0 + 1, signRows));
      check('E4b role-catalog: stale version returns stored (newer) catalog unchanged', p5.status === 200 && p5.json.version === v0 + 2 && !p5.json.roles.some((x: any) => x.key === victim!.key), p5.json);
      const p6 = await put('sign', catBody(v0 + 3, signRows));
      check('E4b role-catalog: re-adding the removed role = 200', p6.status === 200 && p6.json.roles.some((x: any) => x.key === victim!.key), p6.json);

      // /sessions/revocations pagination (keyset within identical revoked_at)
      const tkS = await mintSvc('platform.sessions.read');
      const T0 = new Date('2099-01-01T00:00:00.000Z');
      const pageSids: string[] = [];
      for (let i = 0; i < 5; i++) pageSids.push(await mkSession(me._id, { revoked_at: T0, revoked_reason: 'smoke-page' }));
      const revGet = async (qs: string) => {
        const x = await fetch(`${P2}/sessions/revocations?${qs}`, { headers: { authorization: `Bearer ${tkS}` } });
        return { status: x.status, headers: x.headers, rows: (await x.json()) as { sid: string }[] };
      };
      const pg1 = await revGet(`since=${T0.toISOString()}&limit=2`);
      check('E4b revocations limit=2: 2 rows, X-Has-More true, X-Next-Since/X-Next-After-Sid set', pg1.status === 200 && pg1.rows.length === 2 && pg1.headers.get('x-has-more') === 'true' && pg1.headers.get('x-next-since') === T0.toISOString() && pg1.headers.get('x-next-after-sid') === pg1.rows[1]?.sid, { rows: pg1.rows.length, h: [...pg1.headers.entries()].filter(([k]) => k.startsWith('x-')) });
      const pg2 = await revGet(`since=${pg1.headers.get('x-next-since')}&after_sid=${pg1.headers.get('x-next-after-sid')}&limit=2`);
      check('E4b revocations continuation: next 2 rows, more pending, no duplicates', pg2.rows.length === 2 && pg2.headers.get('x-has-more') === 'true' && pg2.rows.every((x) => !pg1.rows.some((y) => y.sid === x.sid)), pg2.rows);
      const pg3 = await revGet(`since=${pg2.headers.get('x-next-since')}&after_sid=${pg2.headers.get('x-next-after-sid')}&limit=2`);
      check('E4b revocations last page: 1 row, no X-Has-More', pg3.rows.length === 1 && pg3.headers.get('x-has-more') === null, { n: pg3.rows.length, h: pg3.headers.get('x-has-more') });
      const gathered = [...pg1.rows, ...pg2.rows, ...pg3.rows].map((x) => x.sid);
      check('E4b revocations pagination yields exactly the 5 sessions (no dupes, none missed)', new Set(gathered).size === 5 && pageSids.every((s) => gathered.includes(s)), gathered);
      const fullNoLimit = await revGet(`since=${T0.toISOString()}`);
      check('E4b revocations default limit: no X-Has-More when everything fits', fullNoLimit.rows.length === 5 && fullNoLimit.headers.get('x-has-more') === null);
      check('E4b revocations limit=0 / 1001 = 400', (await revGet('limit=0')).status === 400 && (await revGet('limit=1001')).status === 400);
    } catch (e) { check('E4b section did not crash', false, (e as Error).stack?.split(String.fromCharCode(10)).slice(0, 4).join(' | ')); }

    // ── E4c: per-client product scoping, onCommit hooks, transactional teams ──────────────────
    const prevClientProducts = process.env.PLATFORM_CLIENT_PRODUCTS;
    try {
      const { Team, Department, ProductRole, App } = await import('../models');
      const { onCommit } = await import('../lib/platformEvents');
      const SERVICES3 = `${ORIGIN}/realms/services`;
      const a3 = await new jose.SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'smoke-backend-1' })
        .setIssuer('karbexa-products-backend').setSubject('karbexa-products-backend').setAudience(SERVICES3)
        .setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('2m').sign(backend.privateKey);
      const tk3 = await (await fetch(`${SERVICES3}/oauth/token`, form({
        grant_type: 'client_credentials', client_id: 'karbexa-products-backend',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: a3,
        scope: 'platform.role_catalog.write', resource: 'urn:karbexa:platform-api',
      }))).json() as Record<string, string>;
      const put3 = async (key: string, body: unknown) => {
        const x = await fetch(`${ORIGIN}/platform/v1/apps/${key}/role-catalog`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${tk3.access_token}` }, body: JSON.stringify(body) });
        return { status: x.status, json: (await x.json().catch(() => ({}))) as any };
      };
      const catBody3 = (v: number, rows: any[]) => ({ version: v, roles: rows.map((x) => ({ key: x.key, name: x.name, description: x.description, rank: x.rank, is_default: !!x.is_default, assignable: x.assignable !== false })) });
      const signRows3 = await ProductRole.find({ product_key: 'sign' }).lean();
      const peopleRows3 = await ProductRole.find({ product_key: 'people' }).lean();
      const signV3 = ((await App.findOne({ product_key: 'sign', app_type: 'karbexa_product' }).lean()) as any)?.role_catalog_version ?? 1;
      const peopleV3 = ((await App.findOne({ product_key: 'people', app_type: 'karbexa_product' }).lean()) as any)?.role_catalog_version ?? 1;

      process.env.PLATFORM_CLIENT_PRODUCTS = JSON.stringify({ 'karbexa-products-backend': ['people'] });
      const denied = await put3('sign', catBody3(signV3 + 1, signRows3));
      check('E4c role-catalog: product outside client allow-list = 403 PRODUCT_NOT_ALLOWED', denied.status === 403 && denied.json.code === 'PRODUCT_NOT_ALLOWED', denied);
      const allowed = await put3('people', catBody3(peopleV3 + 1, peopleRows3));
      check('E4c role-catalog: allowed product still = 200', allowed.status === 200, allowed);
      if (prevClientProducts === undefined) delete process.env.PLATFORM_CLIENT_PRODUCTS; else process.env.PLATFORM_CLIENT_PRODUCTS = prevClientProducts;
      const restored = await put3('sign', catBody3(signV3 + 1, signRows3));
      check('E4c role-catalog: default allow-list (env restored) permits sign', restored.status === 200, restored);

      // onCommit: runs after commit, not on abort
      let okRan = false; let okRanInside = true;
      await runInTransaction(async (session) => { onCommit(session, () => { okRan = true; }); okRanInside = okRan; });
      let abortRan = false;
      await runInTransaction(async (session) => { onCommit(session, () => { abortRan = true; }); throw new Error('boom'); }).catch(() => undefined);
      check('E4c onCommit: runs after commit (not inside the transaction)', okRan === true && okRanInside === false, { okRan, okRanInside });
      check('E4c onCommit: does not run when the transaction aborts', abortRan === false);
      let immediate = false;
      onCommit(undefined, () => { immediate = true; });
      await new Promise((r) => setTimeout(r, 20));
      check('E4c onCommit: no session runs immediately', immediate === true);

      // teams: create writes an audit row (transactional with the team)
      const sid3 = crypto.randomUUID();
      await Session.create({
        _id: sid3, identity_id: new mongoose.Types.ObjectId(), member_id: me._id, company_id: orgId, realm: 'tenant',
        idle_expires_at: new Date(Date.now() + 3600e3), absolute_expires_at: new Date(Date.now() + 3600e3), amr: ['pwd'],
      });
      const tKey3 = await jose.importJWK(tenantPrivateJwk, 'RS256');
      const tAt3 = await new jose.SignJWT({ token_use: 'access', org: String(orgId), sid: sid3, email: me.email })
        .setProtectedHeader({ alg: 'RS256', kid: 'tenant-smoke', typ: 'at+jwt' })
        .setIssuer(`${ORIGIN}/realms/tenant`).setAudience('urn:karbexa:admin').setSubject(String(me._id))
        .setIssuedAt().setExpirationTime('10m').sign(tKey3);
      const api3 = async (path: string, body: unknown, cid: string) => {
        const rr = await fetch(`${ORIGIN}/api/v1${path}`, { method: 'POST', headers: { authorization: `Bearer ${tAt3}`, 'content-type': 'application/json', 'x-correlation-id': cid }, body: JSON.stringify(body) });
        return { status: rr.status, text: await rr.text() };
      };
      await api3('/organization', { name: 'E4c Dept', type: 'business_unit' }, 'e4c-dept');
      const dept3 = await Department.findOne({ company_id: orgId, name: 'E4c Dept' });
      const tr = await api3('/teams', { name: 'E4c Team', department_id: String(dept3?._id), team_lead_id: String(me._id) }, 'e4c-team-create');
      const team3 = await Team.findOne({ company_id: orgId, name: 'E4c Team' });
      const ae3 = await AuditEvent.findOne({ company_id: orgId, action: 'team.created', correlation_id: 'e4c-team-create' }).lean();
      check('E4c team create = 201 and writes its team.created audit row', tr.status === 201 && !!team3 && !!ae3 && ae3.object_id === String(team3?._id), `${tr.status} ${tr.text.slice(0, 200)}`);
    } catch (e) { check('E4c section did not crash', false, (e as Error).stack?.split(String.fromCharCode(10)).slice(0, 4).join(' | ')); }
    finally { if (prevClientProducts === undefined) delete process.env.PLATFORM_CLIENT_PRODUCTS; else process.env.PLATFORM_CLIENT_PRODUCTS = prevClientProducts; }

    // ── E4d: O(1) org txn + post-commit fan-out, lifecycle guard, catalog lock, hardening ──────
    try {
      const { correlationIdFor } = await import('../lib/platformEvents');
      const { isPrivateAddress } = await import('../lib/ssrfGuard');
      const SERVICES4 = `${ORIGIN}/realms/services`;
      const mint4 = async (scope: string) => {
        const a = await new jose.SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'smoke-backend-1' })
          .setIssuer('karbexa-products-backend').setSubject('karbexa-products-backend').setAudience(SERVICES4)
          .setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('2m').sign(backend.privateKey);
        const j = await (await fetch(`${SERVICES4}/oauth/token`, form({
          grant_type: 'client_credentials', client_id: 'karbexa-products-backend',
          client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: a, scope, resource: 'urn:karbexa:platform-api',
        }))).json() as Record<string, string>;
        return j.access_token;
      };

      // org suspend with 60+ members
      res = await op('/orgs', 'POST', { name: 'Gamma Ltd', slug: 'gamma', plan_key: 'professional', first_admin: { email: 'admin@gamma.test', full_name: 'Gus Admin' } });
      const gammaId = ((await res.json()) as { data?: { id: string } }).data?.id || '';
      await User.insertMany(Array.from({ length: 65 }, (_, i) => ({
        company_id: gammaId, full_name: `Bulk ${i}`, email: `bulk${i}@gamma.test`, password_hash: 'x', role: 'Employee',
        lifecycle_state: 'active', is_active: true, employment_type: 'full_time', employee_id: `GAM-${i}`,
      })));
      const before4 = new Map((await User.find({ company_id: gammaId }).lean()).map((u) => [String(u._id), u.authz_ver ?? 0]));
      res = await op(`/orgs/${gammaId}/suspend`, 'POST', { reason: 'e4d' });
      check('E4d org suspend (66 members) = 200', res.status === 200 && before4.size >= 66, { status: res.status, members: before4.size });
      const after4 = await User.find({ company_id: gammaId }).lean();
      check('E4d suspend bumped every member authz_ver exactly once (no double bump)', after4.every((u) => (u.authz_ver ?? 0) === (before4.get(String(u._id)) ?? 0) + 1), after4.slice(0, 3).map((u) => u.authz_ver));
      const susEv = await PlatformEvent.find({ org_id: gammaId, type: 'org.suspended' }).lean();
      check('E4d exactly ONE org.suspended event', susEv.length === 1, susEv.length);
      const aacEv = await PlatformEvent.find({ org_id: gammaId, type: 'app_access.changed', seq: { $gt: susEv[0]?.seq ?? 0 } }).lean();
      const authzOf = new Map(after4.map((u) => [String(u._id), u.authz_ver ?? 0]));
      const bySubject = new Map(aacEv.map((e) => [e.subject.id, e]));
      check('E4d per-member app_access.changed arrive after org.suspended with the correct authz_ver', [...authzOf].every(([id, v]) => (bySubject.get(id)?.data as any)?.authz_ver === v), { events: aacEv.length, members: authzOf.size });
      const seqs4 = (await PlatformEvent.find({ org_id: gammaId }).sort({ seq: 1 }).lean()).map((e) => e.seq);
      check('E4d org event seq contiguous after fan-out', seqs4.every((v, i) => v === i + 1), seqs4.length);

      // concurrent conflicting lifecycle transitions
      const sidL = crypto.randomUUID();
      await Session.create({
        _id: sidL, identity_id: new mongoose.Types.ObjectId(), member_id: me._id, company_id: orgId, realm: 'tenant',
        idle_expires_at: new Date(Date.now() + 3600e3), absolute_expires_at: new Date(Date.now() + 3600e3), amr: ['pwd'],
      });
      const tKeyL = await jose.importJWK(tenantPrivateJwk, 'RS256');
      const tAtL = await new jose.SignJWT({ token_use: 'access', org: String(orgId), sid: sidL, email: me.email })
        .setProtectedHeader({ alg: 'RS256', kid: 'tenant-smoke', typ: 'at+jwt' })
        .setIssuer(`${ORIGIN}/realms/tenant`).setAudience('urn:karbexa:admin').setSubject(String(me._id))
        .setIssuedAt().setExpirationTime('10m').sign(tKeyL);
      const apiL = async (path: string, method: string, body: unknown, cid: string) => {
        const rr = await fetch(`${ORIGIN}/api/v1${path}`, { method, headers: { authorization: `Bearer ${tAtL}`, 'content-type': 'application/json', 'x-correlation-id': cid }, body: JSON.stringify(body) });
        return { status: rr.status, text: await rr.text() };
      };
      await apiL('/people/invite', 'POST', { full_name: 'Race Member', email: 'race.member@acme.test' }, 'e4d-invite');
      const race = await User.findOne({ company_id: orgId, email: 'race.member@acme.test' });
      await User.updateOne({ _id: race?._id }, { $set: { lifecycle_state: 'active', is_active: true } });
      const rr2 = await Promise.all([
        apiL(`/people/${race?._id}/lifecycle`, 'PUT', { lifecycle_state: 'on_leave' }, 'e4d-race-a'),
        apiL(`/people/${race?._id}/lifecycle`, 'PUT', { lifecycle_state: 'deactivated', reason: 'e4d race' }, 'e4d-race-b'),
      ]);
      const statuses = rr2.map((x) => x.status).sort().join();
      check('E4d concurrent conflicting lifecycle transitions -> one success, one 409 LIFECYCLE_CONFLICT', statuses === '200,409' && rr2.some((x) => x.status === 409 && /LIFECYCLE_CONFLICT/.test(x.text)), rr2.map((x) => `${x.status} ${x.text.slice(0, 120)}`));

      // stale role-catalog version is a no-op
      const rcTok = await mint4('platform.role_catalog.write');
      const signApp = await App.findOne({ product_key: 'sign', app_type: 'karbexa_product' }).lean();
      const verNow = (signApp as any)?.role_catalog_version ?? 1;
      const stale = await fetch(`${ORIGIN}/platform/v1/apps/sign/role-catalog`, {
        method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${rcTok}` },
        body: JSON.stringify({ version: Math.max(verNow - 1, 1), roles: [{ key: 'stale_only', name: 'Stale', rank: 1, is_default: true }] }),
      });
      const staleJson = await stale.json() as { version: number; roles: { key: string }[] };
      const verAfter = ((await App.findOne({ product_key: 'sign', app_type: 'karbexa_product' }).lean()) as any)?.role_catalog_version ?? 1;
      check('E4d stale role-catalog version = 200 no-op returning stored catalog', verNow > 1 && stale.status === 200 && verAfter === verNow && staleJson.version === verNow && !staleJson.roles.some((r) => r.key === 'stale_only') && !(await ProductRole.exists({ product_key: 'sign', key: 'stale_only' })), { status: stale.status, verNow, verAfter });

      // CURSOR_AHEAD
      const evTok = await mint4('platform.events.read');
      const ahead = await fetch(`${ORIGIN}/platform/v1/orgs/${orgId}/events?after_seq=99999999`, { headers: { authorization: `Bearer ${evTok}` } });
      check('E4d after_seq beyond latest = 409 CURSOR_AHEAD', ahead.status === 409 && ((await ahead.json()) as any).code === 'CURSOR_AHEAD', ahead.status);

      // correlation id sanitising
      const badCid = correlationIdFor({ headers: { 'x-correlation-id': 'bad id!<script>' } } as any);
      const goodCid = correlationIdFor({ headers: { 'x-correlation-id': 'ok-id_1.2' } } as any);
      check('E4d correlation id with illegal chars is replaced; legal one kept', badCid !== 'bad id!<script>' && /^[\w.-]{1,100}$/.test(badCid) && goodCid === 'ok-id_1.2', { badCid, goodCid });

      // ssrfGuard ranges
      const blocked = ['64:ff9b::1.2.3.4', '64:ff9b::7f00:1', '2002:c000:204::1', '2001::1', '2001:0:4136:e378::1', '::1.2.3.4', '::102:304', '100::1', '198.18.0.1', '198.19.255.255', '192.0.2.1', '198.51.100.7', '203.0.113.9'];
      const leaked = blocked.filter((a) => !isPrivateAddress(a));
      check('E4d ssrfGuard rejects NAT64/6to4/Teredo/IPv4-compatible/discard/benchmark/doc ranges', leaked.length === 0 && !isPrivateAddress('8.8.8.8') && !isPrivateAddress('2606:4700:4700::1111'), leaked);
    } catch (e) { check('E4d section did not crash', false, (e as Error).stack?.split(String.fromCharCode(10)).slice(0, 4).join(' | ')); }

    // ── audit ─────────────────────────────────────────────────────────────────────────────
    const actions = (await OperatorAuditEvent.find()).map((e) => e.action);
    check('E10 operator audit recorded', ['org.provisioned', 'entitlement.updated', 'org.suspended', 'org.reactivated'].every((a) => actions.includes(a)), actions);
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  (got ${r.detail})`}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`\nSMOKE SPRINT 2: ${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error('SMOKE CRASH', e); process.exit(2); });
