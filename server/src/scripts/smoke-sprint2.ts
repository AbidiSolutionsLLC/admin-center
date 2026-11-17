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
    EXPOSE_INVITE_TOKEN: 'true',
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
    {
      // 1.2: manifest fields are seeded; default rules come from default_assignments
      const byKey = Object.fromEntries(apps.map((a) => [a.product_key, a]));
      check('1.2 seeded manifest fields (version, status, icon, category)', apps.every((a) => a.manifest_version === 1 && a.product_status === 'active' && !!a.icon && !!a.product_category), apps.map((a) => [a.product_key, a.manifest_version, a.icon]));
      check('1.2 default_assignments: people->employee, desk->requester, others none', byKey.people?.default_assignments?.[0]?.role === 'employee' && byKey.desk?.default_assignments?.[0]?.role === 'requester' && !byKey.projects?.default_assignments?.length && !byKey.sign?.default_assignments?.length);
    }
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
    const secret = /data-copy="([A-Z2-7]{16,})"/.exec(html)?.[1];
    check('E10 operator without MFA must enrol TOTP', !!secret, res.status);
    check('E10 operator enrolment page shows a QR code', /<img src="data:image\/png;base64,/.test(html), res.status);
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
    // ── Plan 2.5: provisioning is one transaction ───────────────────────────────────────────
    {
      const { Role: RoleM, SecurityPolicy: PolM, EmailDelivery: DelM, Invitation: InvM, Plan: PlanM } = await import('../models');
      // A plan that lists a product twice makes the entitlement insert fail AFTER the company, roles and policy were written.
      await PlanM.create({ key: 'dup-products', name: 'Duplicate products', products: ['people', 'people'], status: 'active' });
      const before = { roles: await RoleM.countDocuments(), policies: await PolM.countDocuments(), mails: await DelM.countDocuments(), invites: await InvM.countDocuments() };
      const bad = await op('/orgs', 'POST', { name: 'Forced Fail', slug: 'forced-fail', plan_key: 'dup-products', first_admin: { email: 'admin@forced.test', full_name: 'Fay Fail' } });
      check('2.5 a failure after seeding is not a 201', bad.status !== 201, bad.status);
      check('2.5 ...and leaves no Company, Role, SecurityPolicy, e-mail row or invitation behind',
        (await Company.countDocuments({ slug: 'forced-fail' })) === 0
        && (await RoleM.countDocuments()) === before.roles && (await PolM.countDocuments()) === before.policies
        && (await DelM.countDocuments()) === before.mails && (await InvM.countDocuments()) === before.invites
        && !(await User.exists({ email: 'admin@forced.test' })), before);
      await PlanM.updateOne({ key: 'dup-products' }, { $set: { products: ['people'] } });
      const retry = await op('/orgs', 'POST', { name: 'Forced Fail', slug: 'forced-fail', plan_key: 'dup-products', first_admin: { email: 'admin@forced.test', full_name: 'Fay Fail' } });
      const retryJson = await retry.json() as { data?: { id: string; status: string; invite_email_sent: boolean; invite_delivery_id: string | null } };
      check('2.5 the same request then succeeds: active company, six system roles, one policy', retry.status === 201 && retryJson.data?.status === 'active'
        && (await RoleM.countDocuments({ company_id: retryJson.data?.id, type: 'system' })) === 6 && (await PolM.countDocuments({ company_id: retryJson.data?.id })) === 1, retry.status);
      const mail = retryJson.data?.invite_delivery_id ? await DelM.findById(retryJson.data.invite_delivery_id) : null;
      check('2.5 the welcome e-mail row exists and is linked from the response', !!mail && mail.template === 'welcome' && retryJson.data?.invite_email_sent === true, mail?.status);
      const inv = await InvM.findOne({ company_id: retryJson.data?.id, kind: 'first_admin' });
      check('2.5 the first admin has one pending first_admin invitation', !!inv && inv.state === 'pending' && (await InvM.countDocuments({ company_id: retryJson.data?.id })) === 1, inv?.state);
    }

    // ── Plan 2.6: operator onboarding API ───────────────────────────────────────────────────
    {
      const { Invitation: InvM, OperatorAuditEvent: OaM, PlatformEvent: PeM } = await import('../models');
      const forced = await Company.findOne({ slug: 'forced-fail' });
      const fid = String(forced?._id);
      const g = await op(`/orgs/${fid}/onboarding`);
      const gj = await g.json() as { data?: { stage: string; first_admin: { email: string; lifecycle_state: string } | null; invitation: { state: string } | null; delivery: { status: string } | null } };
      check('2.6 GET onboarding: first admin found through UserRole, pending invitation, a delivery row', g.status === 200 && gj.data?.first_admin?.email === 'admin@forced.test' && gj.data?.invitation?.state === 'pending' && !!gj.data?.delivery, gj);
      check('2.6 GET onboarding stage is sending or awaiting_acceptance and no token is exposed', ['sending', 'awaiting_acceptance'].includes(gj.data?.stage ?? '') && !/token/i.test(JSON.stringify(gj)), gj.data?.stage);

      const list = await op('/onboarding');
      const lj = await list.json() as { data?: { organization: { id: string }; stage: string }[] };
      check('2.6 GET /onboarding lists the organisation with its stage', list.status === 200 && !!lj.data?.some((r) => r.organization.id === fid && r.stage !== 'complete'), lj.data?.length);

      const rs = await op(`/orgs/${fid}/onboarding/resend-invite`, 'POST');
      const rsj = await rs.json() as { data?: { invite_delivery_id: string | null } };
      check('2.6 resend-invite = 200, new delivery id, old invitation superseded, one pending',
        rs.status === 200 && !!rsj.data?.invite_delivery_id && (await InvM.countDocuments({ company_id: fid, kind: 'first_admin', state: 'pending' })) === 1 && (await InvM.countDocuments({ company_id: fid, state: 'superseded' })) === 1, rs.status);
      check('2.6 resend-invite is operator-audited', !!(await OaM.findOne({ action: 'onboarding.invite_resent', target_id: fid })));

      const pa = await op(`/orgs/${fid}/onboarding/first-admin`, 'PATCH', { email: 'new.admin@forced.test', full_name: 'Fay Fixed' });
      const paj = await pa.json() as { data?: { changed: boolean } };
      const movedInv = await InvM.findOne({ company_id: fid, kind: 'first_admin', state: 'pending' });
      check('2.6 PATCH first-admin = 200: user updated, invitation re-issued to the new address',
        pa.status === 200 && paj.data?.changed === true && !!(await User.exists({ company_id: fid, email: 'new.admin@forced.test', full_name: 'Fay Fixed' })) && movedInv?.email === 'new.admin@forced.test', pa.status);
      check('2.6 PATCH first-admin emits member.updated with the changed fields', !!(await PeM.findOne({ org_id: fid, type: 'member.updated', 'data.changed.email': 'new.admin@forced.test' })));
      const same = await op(`/orgs/${fid}/onboarding/first-admin`, 'PATCH', { email: 'new.admin@forced.test', full_name: 'Fay Fixed' });
      check('2.6 PATCH first-admin with no change = 200 changed:false', same.status === 200 && ((await same.json()) as any).data?.changed === false, same.status);
      const dup = await op(`/orgs/${fid}/onboarding/first-admin`, 'PATCH', { email: 'not-an-email', full_name: 'X' });
      check('2.6 PATCH first-admin rejects a bad e-mail = 400', dup.status === 400, dup.status);

      // once the first admin has accepted, neither action is allowed
      await User.updateOne({ company_id: fid, email: 'new.admin@forced.test' }, { $set: { lifecycle_state: 'active', is_active: true } });
      const late1 = await op(`/orgs/${fid}/onboarding/resend-invite`, 'POST');
      const late2 = await op(`/orgs/${fid}/onboarding/first-admin`, 'PATCH', { email: 'later@forced.test', full_name: 'Late' });
      check('2.6 after acceptance: resend-invite and first-admin change = 409 ALREADY_ONBOARDED', late1.status === 409 && late2.status === 409, [late1.status, late2.status]);
      const done = await (await op(`/orgs/${fid}/onboarding`)).json() as { data?: { stage: string } };
      check('2.6 stage is complete once the first admin is active', done.data?.stage === 'complete', done.data?.stage);
      const nf = await op(`/orgs/${new (await import('mongoose')).Types.ObjectId()}/onboarding`);
      check('2.6 unknown organisation = 404', nf.status === 404, nf.status);
    }

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
    check('C-3 no desk default rule without a desk entitlement (professional plan)',
      !(await AppAssignment.exists({ company_id: orgId, app_id: desk!._id, target_type: 'group' })));
    {
      // C-3 (decided 2026-11-12): an org entitled to Desk gets All Members -> desk requester.
      const r = await op('/orgs', 'POST', { name: 'Delta Desk', slug: 'delta-desk', plan_key: 'enterprise', first_admin: { email: 'admin@delta.test', full_name: 'Dee Admin' } });
      const deltaId = ((await r.json()) as { data?: { id: string } }).data?.id;
      const dGrp = await Group.findOne({ company_id: deltaId, name: 'All Members', type: 'dynamic' });
      check('C-3 enterprise org: All Members -> desk requester default rule', r.status === 201 && !!dGrp && !!(await AppAssignment.exists({
        company_id: deltaId, app_id: desk!._id, target_type: 'group', target_id: dGrp!._id, product_role_key: 'requester',
      })), r.status);
      const dAdmin = await User.findOne({ company_id: deltaId, email: 'admin@delta.test' });
      await User.updateOne({ _id: dAdmin!._id }, { lifecycle_state: 'active', is_active: true });
      const dEa = await computeEffectiveAccess(deltaId!, dAdmin!._id.toString());
      check('C-3 member effective access: desk=requester via All Members', dEa.products.desk?.role === 'requester', dEa.products);
    }
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
    res = await op(`/orgs/${orgId}/entitlements/projects`, 'PUT', { status: 'suspended', reason: 'Smoke: suspend projects' });
    check('E10 entitlement change bumps authz_ver', ((await User.findById(me._id))?.authz_ver ?? 0) > verBefore, { verBefore, after: (await User.findById(me._id))?.authz_ver });
    check('E10 PUT entitlement suspended = 200', res.status === 200, res.status);
    const ea2 = await computeEffectiveAccess(orgId, me._id.toString());
    check('E3 suspended entitlement removes product access', !ea2.products.projects && ea2.denials.projects === 'NO_ENTITLEMENT', ea2.denials);
    check('E3 other products unaffected', ea2.products.people?.role === 'employee');
    check('E3 entitlement row status suspended', (await OrganizationEntitlement.findOne({ company_id: orgId, product_key: 'projects' }))?.status === 'suspended');
    void pm;

    // ── suspend org ───────────────────────────────────────────────────────────────────────
    const orgSlug = (await Company.findById(orgId))!.slug;
    res = await op(`/orgs/${orgId}/suspend`, 'POST', { reason: 'smoke hold', confirm_slug: orgSlug });
    check('E10 suspend org = 200', res.status === 200, res.status);
    const ea3 = await computeEffectiveAccess(orgId, me._id.toString());
    check('E3 suspended org → all products denied ORG_SUSPENDED', Object.keys(ea3.products).length === 0 && Object.values(ea3.denials).every((d) => d === 'ORG_SUSPENDED') && Object.keys(ea3.denials).length > 0, ea3);
    check('E10 Company.status suspended and is_active false', (await Company.findById(orgId))?.status === 'suspended' && (await Company.findById(orgId))?.is_active === false);
    res = await op(`/orgs/${orgId}/reactivate`, 'POST', { reason: 'smoke release' });
    check('E10 reactivate org = 200', res.status === 200 && (await Company.findById(orgId))?.status === 'active', res.status);

    // ── E4a: suspend/reactivate events carry data.reason ─────────────────────────────────
    res = await op(`/orgs/${orgId}/suspend`, 'POST', { reason: 'billing-hold', confirm_slug: orgSlug });
    res = await op(`/orgs/${orgId}/reactivate`, 'POST', { reason: 'paid' });
    {
      const sus = await PlatformEvent.find({ org_id: orgId, type: 'org.suspended' }).sort({ seq: 1 }).lean();
      const rea = await PlatformEvent.find({ org_id: orgId, type: 'org.reactivated' }).sort({ seq: 1 }).lean();
      check('E4a org.suspended event has data.reason (both calls)', sus.length === 2 && (sus[0].data as any).reason === 'smoke hold' && (sus[1].data as any).reason === 'billing-hold', sus.map((e) => e.data));
      check('E4a org.reactivated event has data.reason (both calls)', rea.length === 2 && (rea[0].data as any).reason === 'smoke release' && (rea[1].data as any).reason === 'paid', rea.map((e) => e.data));
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

    {
      // L3-9: PATCH plan_key persists Company.plan (same txn); list + detail return plan_key
      const planBefore = (await Company.findById(orgId))?.plan;
      const planBad = await op(`/orgs/${orgId}`, 'PATCH', { plan_key: 'no-such-plan' });
      check('L3-9 provisioning stored the plan on the Company (professional)', planBefore === 'professional', planBefore);
      check('L3-9 PATCH with an unknown plan = 404 and leaves Company.plan untouched', planBad.status === 404 && (await Company.findById(orgId))?.plan === 'professional', planBad.status);
    }

    // ── plan assignment activates products ───────────────────────────────────────────────
    res = await op(`/orgs/${orgId}`, 'PATCH', { plan_key: 'enterprise' });
    const enterprise = await Plan.findOne({ key: 'enterprise' });
    const activeKeys = (await OrganizationEntitlement.find({ company_id: orgId, status: 'active' })).map((e) => e.product_key);
    check('E10 PATCH /orgs/:id {plan_key} activates plan products (suspended ones stay suspended)', res.status === 200 && !!enterprise && enterprise.products.includes('desk') && activeKeys.includes('desk') && !activeKeys.includes('projects'), { status: res.status, activeKeys });

    {
      const detailAfter = await (await op(`/orgs/${orgId}`)).json() as { data?: Record<string, unknown> };
      const listAfter = await (await op('/orgs?limit=100')).json() as { data?: { id: string; plan_key?: string | null }[] };
      check('L3-9 PATCH plan_key persists Company.plan and the detail returns plan_key (legacy plan field gone)', (await Company.findById(orgId))?.plan === 'enterprise' && detailAfter.data?.plan_key === 'enterprise' && !('plan' in (detailAfter.data || {})), detailAfter.data?.plan_key);
      check('L3-9 org list items return plan_key', listAfter.data?.find((o) => o.id === String(orgId))?.plan_key === 'enterprise', listAfter.data?.find((o) => o.id === String(orgId)));
    }

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

      // Plan 5.11: active <-> probation <-> on_leave emit member.updated {changed:{lifecycle_state}} and no suspend/terminate/reactivate event
      for (const [step, to] of [['a', 'probation'], ['b', 'on_leave'], ['c', 'active']] as const) {
        const cid = `p511-${step}`;
        r = await t(`/people/${memId}/lifecycle`, 'PUT', { lifecycle_state: to }, cid);
        evs = await evsOf(cid);
        const mu = ofType(evs, 'member.updated');
        check(`5.11 -> ${to} = 200 and emits one member.updated {changed:{lifecycle_state:'${to}'}}`, r.status === 200 && mu.length === 1 && JSON.stringify((mu[0].data as any).changed) === JSON.stringify({ lifecycle_state: to }) && mu[0].subject.id === memId, `${r.status} ${JSON.stringify(mu.map((e) => e.data))}`);
        check(`5.11 -> ${to} emits no member.suspended/reactivated/terminated`, !evs.some((e: any) => ['member.suspended', 'member.reactivated', 'member.terminated'].includes(e.type)), evs.map((e: any) => e.type));
      }

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

      // 1.3: manifest publish (new product 'demo'), stale version, ROLE_IN_USE, client not allowed, then cleanup
      {
        const putM = async (key: string, body: unknown) => {
          const x = await fetch(`${ORIGIN}/platform/v1/apps/${key}/manifest`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${tk3.access_token}` }, body: JSON.stringify(body) });
          return { status: x.status, json: (await x.json().catch(() => ({}))) as any };
        };
        const manifest = (version: number, roles: string[]) => ({
          manifest_version: 1, key: 'demo', name: 'Demo', description: 'Smoke product', icon: 'box', category: 'work', status: 'active', version,
          hosting: { mode: 'suite', launch_path: '/demo/home' },
          roles: roles.map((k, i) => ({ key: k, name: k, rank: (roles.length - i) * 10, is_default: i === roles.length - 1 })),
          default_assignments: [],
        });
        const { Plan: PlanM, AppAssignment: AssignM } = await import('../models');
        const demoDenied = await putM('demo', manifest(1, ['demo_admin', 'demo_user']));
        check('1.3 manifest: new key outside the client allow-list = 403 PRODUCT_NOT_ALLOWED', demoDenied.status === 403 && demoDenied.json.code === 'PRODUCT_NOT_ALLOWED', demoDenied);
        process.env.PLATFORM_CLIENT_PRODUCTS = JSON.stringify({ 'karbexa-products-backend': ['demo', 'people'] });
        try {
          check('1.3 manifest: key mismatch with path = 400', (await putM('demo', { ...manifest(1, ['demo_admin', 'demo_user']), key: 'other' })).status === 400);
          check('1.3 manifest: invalid body (two defaults) = 400', (await putM('demo', { ...manifest(1, ['a', 'b']), roles: [{ key: 'a', name: 'a', rank: 2, is_default: true }, { key: 'b', name: 'b', rank: 1, is_default: true }] })).status === 400);
          const m1 = await putM('demo', manifest(2, ['demo_admin', 'demo_user']));
          check('1.3 manifest: first publish registers the product (200, version, roles)', m1.status === 200 && m1.json.version === 2 && m1.json.roles?.length === 2 && m1.json.hosting?.launch_path === '/demo/home', m1.json);
          const demoApp: any = await App.findOne({ product_key: 'demo', app_type: 'karbexa_product' }).lean();
          check('1.3 manifest: App row written (name, icon, category, default role, launch_url)', demoApp?.name === 'Demo' && demoApp.icon === 'box' && demoApp.product_category === 'work' && demoApp.default_role_key === 'demo_user' && /\/demo\/home$/.test(demoApp.launch_url || ''), demoApp);
          const { assertProductKey } = await import('../lib/productRegistry');
          check('1.3 manifest: demo is a valid product key without a source edit', await assertProductKey('demo').then(() => true, () => false));
          const planDemo = await fetch(`${ORIGIN}/platform/v1/apps`, { headers: { authorization: `Bearer ${tk3.access_token}` } });
          const listed = (await planDemo.json()) as any[];
          check('1.3 GET /apps lists registered products including demo', planDemo.status === 200 && listed.some((a) => a.key === 'demo') && listed.some((a) => a.key === 'people'), listed.map((a) => a.key));
          const stale = await putM('demo', { ...manifest(1, ['demo_admin', 'demo_user', 'stale_only']), name: 'Stale' });
          check('1.3 manifest: stale version returns the stored copy unchanged', stale.status === 200 && stale.json.version === 2 && stale.json.name === 'Demo' && !stale.json.roles.some((r: any) => r.key === 'stale_only') && !(await ProductRole.exists({ product_key: 'demo', key: 'stale_only' })), stale.json);
          await AssignM.create({ company_id: orgId, app_id: demoApp._id, target_type: 'user', target_id: me._id, product_role_key: 'demo_admin', granted_by: me._id, is_active: true });
          const inUse = await putM('demo', manifest(3, ['demo_user']));
          check('1.3 manifest: removing an assigned role = 409 ROLE_IN_USE, nothing changed', inUse.status === 409 && inUse.json.code === 'ROLE_IN_USE' && inUse.json.roles?.includes('demo_admin') && (await ProductRole.countDocuments({ product_key: 'demo' })) === 2 && ((await App.findById(demoApp._id).lean()) as any)?.role_catalog_version === 2, inUse.json);
          check('1.3 manifest: a plan can include demo (registry accepts it)', await (async () => { await PlanM.create({ key: 'demo-plan', name: 'Demo plan', products: ['demo'] }); return !!(await PlanM.exists({ key: 'demo-plan', products: 'demo' })); })());
        } finally {
          await AssignM.deleteMany({ app_id: (await App.findOne({ product_key: 'demo' }).lean())?._id });
          await PlanM.deleteMany({ key: 'demo-plan' });
          await ProductRole.deleteMany({ product_key: 'demo' });
          await App.deleteMany({ product_key: 'demo' });
          (await import('../lib/productRegistry')).invalidateProductRegistry();
          if (prevClientProducts === undefined) delete process.env.PLATFORM_CLIENT_PRODUCTS; else process.env.PLATFORM_CLIENT_PRODUCTS = prevClientProducts;
        }
        check('1.3 manifest: demo removed again', !(await App.exists({ product_key: 'demo' })));
      }

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
      res = await op(`/orgs/${gammaId}/suspend`, 'POST', { reason: 'e4d', confirm_slug: (await Company.findById(gammaId))!.slug });
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

      // ── Plan 2.4: invitation panel API (state, delivery, revoke, copy link) ────────────────────────────────
      {
        const { Invitation: InvM, EmailDelivery: DelM, AuditEvent: AuM } = await import('../models');
        const jsonOf = (t: string) => { try { return JSON.parse(t); } catch { return {}; } };
        await apiL('/people/invite', 'POST', { full_name: 'Panel Member', email: 'panel.member@acme.test' }, 'p24-invite');
        const pm = await User.findOne({ company_id: orgId, email: 'panel.member@acme.test' });
        const g1 = await apiL(`/people/${pm?._id}/invitation`, 'GET', undefined, 'p24-get1');
        const g1j = jsonOf(g1.text);
        check('2.4 GET invitation = pending, sent_count 1, no token in the body', g1.status === 200 && g1j.data?.invitation?.state === 'pending' && g1j.data?.invitation?.sent_count === 1 && !/token/i.test(g1.text), g1.text.slice(0, 200));
        check('2.4 GET invitation reports the e-mail delivery row', !!g1j.data?.delivery?.status, g1j.data?.delivery);
        await DelM.updateOne({ 'related.id': String(pm?._id) }, { $set: { status: 'failed', last_error: 'ECONNREFUSED: test' } });
        const g1b = jsonOf((await apiL(`/people/${pm?._id}/invitation`, 'GET', undefined, 'p24-get1b')).text);
        check('2.4 a failed delivery shows status failed and its last error', g1b.data?.delivery?.status === 'failed' && g1b.data?.delivery?.last_error === 'ECONNREFUSED: test', g1b.data?.delivery);

        const cp = await apiL(`/people/${pm?._id}/resend-invite?copy=true`, 'POST', undefined, 'p24-copy');
        const cpj = jsonOf(cp.text);
        const link = String(cpj.data?.invite_link ?? '');
        check('2.4 resend ?copy=true returns the link once, supersedes the old invitation', cp.status === 200 && /\/onboarding\?token=[0-9a-f]{64}&email=/.test(link) && (await InvM.countDocuments({ user_id: pm?._id, state: 'pending' })) === 1 && (await InvM.countDocuments({ user_id: pm?._id, state: 'superseded' })) === 1, cp.text.slice(0, 200));
        check('2.4 copy-link is audited', !!(await AuM.exists({ company_id: orgId, action: 'user.invite_link_copied', object_id: String(pm?._id) })));
        const g2 = jsonOf((await apiL(`/people/${pm?._id}/invitation`, 'GET', undefined, 'p24-get2')).text);
        check('2.4 copied invitation shows sent_count 0 (no e-mail went with it)', g2.data?.invitation?.sent_count === 0, g2.data?.invitation);

        const rv = await apiL(`/people/${pm?._id}/invitation/revoke`, 'POST', undefined, 'p24-revoke');
        const g3 = jsonOf((await apiL(`/people/${pm?._id}/invitation`, 'GET', undefined, 'p24-get3')).text);
        check('2.4 revoke = 200 and the panel shows revoked', rv.status === 200 && g3.data?.invitation?.state === 'revoked', g3.data?.invitation);
        const rv2 = await apiL(`/people/${pm?._id}/invitation/revoke`, 'POST', undefined, 'p24-revoke2');
        check('2.4 revoke with nothing pending = 409 NO_PENDING_INVITATION', rv2.status === 409 && /NO_PENDING_INVITATION/.test(rv2.text), rv2.text.slice(0, 120));
        check('2.4 revoke is audited', !!(await AuM.exists({ company_id: orgId, action: 'user.invite_revoked', object_id: String(pm?._id) })));
        const verRev = await fetch(`${ORIGIN}/api/v1/people/verify-invite`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: link.match(/token=([0-9a-f]{64})/)?.[1] }) });
        check('2.4 a revoked link verifies as 410 INVITE_REVOKED', verRev.status === 410 && ((await verRev.json()) as any).code === 'INVITE_REVOKED', verRev.status);

        // tenant isolation: another organisation's member is invisible
        const foreign = await Company.create({ name: 'Other Org', slug: `p24-other-${Date.now()}` });
        const fu = await User.create({ company_id: foreign._id, full_name: 'Foreign', email: 'foreign@other.test', password_hash: 'x', lifecycle_state: 'invited', is_active: false });
        const gf = await apiL(`/people/${fu._id}/invitation`, 'GET', undefined, 'p24-foreign');
        const rf = await apiL(`/people/${fu._id}/invitation/revoke`, 'POST', undefined, 'p24-foreign-revoke');
        check('2.4 a member of another organisation: GET and revoke = 404', gf.status === 404 && rf.status === 404, [gf.status, rf.status]);
      }

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

    // ── L3-9: invite_token is exposed only outside production AND with EXPOSE_INVITE_TOKEN=true ───────────────
    {
      const prevExpose = process.env.EXPOSE_INVITE_TOKEN;
      const prevAllow = process.env.OPERATOR_IP_ALLOWLIST;
      const prevNodeEnv = process.env.NODE_ENV;
      const mkOrg = async (slug: string) => {
        const rr = await op('/orgs', 'POST', { name: `Invite ${slug}`, slug, plan_key: 'starter', first_admin: { email: `admin@${slug}.test`, full_name: 'Inv Admin' } });
        return { status: rr.status, data: ((await rr.json()) as { data?: Record<string, unknown> }).data ?? {} };
      };
      try {
        process.env.EXPOSE_INVITE_TOKEN = 'true';
        const on = await mkOrg('invtok-on');
        check('L3-9 invite_token present when not production and EXPOSE_INVITE_TOKEN=true', on.status === 201 && typeof on.data.invite_token === 'string' && String(on.data.invite_token).length >= 32, on.status);
        process.env.EXPOSE_INVITE_TOKEN = 'false';
        const off = await mkOrg('invtok-off');
        check('L3-9 invite_token absent when EXPOSE_INVITE_TOKEN=false', off.status === 201 && !('invite_token' in off.data), off.status);
        delete process.env.EXPOSE_INVITE_TOKEN;
        const unset = await mkOrg('invtok-unset');
        check('L3-9 invite_token absent when EXPOSE_INVITE_TOKEN is unset', unset.status === 201 && !('invite_token' in unset.data), unset.status);
        process.env.EXPOSE_INVITE_TOKEN = 'true';
        process.env.NODE_ENV = 'production';
        process.env.OPERATOR_IP_ALLOWLIST = '127.0.0.1'; // production fails closed on an empty list (L3-5)
        const prod = await mkOrg('invtok-prod');
        check('L3-9 invite_token absent in production even with EXPOSE_INVITE_TOKEN=true', prod.status === 201 && !('invite_token' in prod.data), prod.status);
      } finally {
        process.env.NODE_ENV = prevNodeEnv;
        if (prevAllow === undefined) delete process.env.OPERATOR_IP_ALLOWLIST; else process.env.OPERATOR_IP_ALLOWLIST = prevAllow;
        if (prevExpose === undefined) delete process.env.EXPOSE_INVITE_TOKEN; else process.env.EXPOSE_INVITE_TOKEN = prevExpose;
      }
    }

    // ── A3-1: Identity Providers API + DNS TXT verification ───────────────────────────────
    {
      const { setDnsTxtResolver, resetDnsTxtResolver } = await import('../controllers/identityProviders.controller');
      const mockDns: Record<string, string[][]> = {};
      setDnsTxtResolver(async (domain: string) => {
        const r = mockDns[domain.toLowerCase()];
        if (!r) { const err = new Error('ENODATA'); (err as any).code = 'ENODATA'; throw err; }
        return r;
      });
      try {
        const sidIdp = crypto.randomUUID();
        await Session.create({
          _id: sidIdp,
          identity_id: new mongoose.Types.ObjectId(),
          member_id: me._id,
          company_id: orgId,
          realm: 'tenant',
          idle_expires_at: new Date(Date.now() + 3600e3),
          absolute_expires_at: new Date(Date.now() + 3600e3),
          amr: ['pwd'],
        });
        const tKeyIdp = await jose.importJWK(tenantPrivateJwk, 'RS256');
        const tAtIdp = await new jose.SignJWT({ token_use: 'access', org: String(orgId), sid: sidIdp, email: me.email })
          .setProtectedHeader({ alg: 'RS256', kid: 'tenant-smoke', typ: 'at+jwt' })
          .setIssuer(`${ORIGIN}/realms/tenant`).setAudience('urn:karbexa:admin').setSubject(String(me._id))
          .setIssuedAt().setExpirationTime('10m').sign(tKeyIdp);
        const idpFetch = async (path: string, method: string, body?: unknown) => {
          const res = await fetch(`${ORIGIN}/api/v1${path}`, {
            method,
            headers: { authorization: `Bearer ${tAtIdp}`, 'content-type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
          });
          const json = (await res.json().catch(() => ({}))) as any;
          return { status: res.status, json };
        };

        // 1. Create connection
        const createRes = await idpFetch('/security/identity-providers', 'POST', {
          display_name: 'Smoke Entra Connection',
          tenant_id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
          domains: ['smoke-corp.test'],
        });
        check('A3-1 create IdP connection = 201 draft with token', createRes.status === 201 && createRes.json.data?.status === 'draft' && typeof createRes.json.data?.domains[0]?.verification_token === 'string' && createRes.json.data.domains[0].verification_token.length === 64);
        const idpId = createRes.json.data?._id;
        const vToken = createRes.json.data?.domains[0]?.verification_token;

        // 2. List connections (never expose client_secret_ref)
        const listRes = await idpFetch('/security/identity-providers', 'GET');
        check('A3-1 list IdP connections = 200 without secret_ref', listRes.status === 200 && Array.isArray(listRes.json.data) && listRes.json.data.some((c: any) => c._id === idpId && !c.config?.client_secret_ref));

        // 3. Activation guard: active requires >= 1 verified domain
        const actFail = await idpFetch(`/security/identity-providers/${idpId}`, 'PATCH', { status: 'active' });
        check('A3-1 activation without verified domain = 400 NO_VERIFIED_DOMAINS', actFail.status === 400 && actFail.json.code === 'NO_VERIFIED_DOMAINS');

        // 4. DNS verification fails on missing record
        const vFail = await idpFetch(`/security/identity-providers/${idpId}/domains/smoke-corp.test/verify`, 'POST');
        check('A3-1 verify domain missing TXT = 422 DNS_RECORD_NOT_FOUND', vFail.status === 422 && vFail.json.code === 'DNS_RECORD_NOT_FOUND');

        // 5. DNS verification succeeds
        mockDns['smoke-corp.test'] = [[`karbexa-verification=${vToken}`]];
        const vOk = await idpFetch(`/security/identity-providers/${idpId}/domains/smoke-corp.test/verify`, 'POST');
        check('A3-1 verify domain matching TXT = 200 sets verified_at', vOk.status === 200 && !!vOk.json.data?.domains[0]?.verified_at);

        // 6. Review M-2: an Entra connection needs an operator's tenant approval before it can be activated
        const actNoApproval = await idpFetch(`/security/identity-providers/${idpId}`, 'PATCH', { status: 'active' });
        check('M-2 activation without operator tenant approval = 409 OPERATOR_APPROVAL_REQUIRED', actNoApproval.status === 409 && actNoApproval.json.code === 'OPERATOR_APPROVAL_REQUIRED', actNoApproval.status);
        const tenantTok = await fetch(`${OP}/orgs/${orgId}/identity-providers/${idpId}/approve-tenant`, {
          method: 'POST', headers: { authorization: `Bearer ${tAtIdp}` },
        });
        check('M-2 a tenant admin token cannot call the operator approval = 401', tenantTok.status === 401, tenantTok.status);
        const approve = await op(`/orgs/${orgId}/identity-providers/${idpId}/approve-tenant`, 'POST');
        const approveBody = (await approve.json().catch(() => ({}))) as any;
        check('M-2 operator approves the Entra tenant = 200', approve.status === 200 && approveBody.data?.tenant_approval?.tenant_id === '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', approve.status);
        check('M-2 tenant approval is operator-audited', !!(await OperatorAuditEvent.findOne({ action: 'identity_provider.tenant_approved', target_id: String(idpId) })));

        // 7. Activation succeeds now
        const actOk = await idpFetch(`/security/identity-providers/${idpId}`, 'PATCH', { status: 'active', enforce_sso: true });
        check('A3-1 activate with verified domain = 200', actOk.status === 200 && actOk.json.data?.status === 'active' && actOk.json.data?.enforce_sso === true);
      } finally {
        resetDnsTxtResolver();
      }
    }

    // ── Plan 4.9: platform health (checks, stored state, events, sync proxy, route counters) ──
    {
      const { runHealthChecks } = await import('../lib/health');
      const { flushRouteMetrics } = await import('../lib/health/routeMetrics');
      const { RouteMetric, HealthEvent, HealthCheck, Job } = await import('../models');
      const json = async (r: any) => (await r.json()) as any;
      const before = await json(await op('/health'));
      check('4.9 before any run every component reads unknown and the page is stale', before.data.components.length === 8 && before.data.components.every((c: any) => c.state === 'unknown') && before.data.stale === true, JSON.stringify(before.data).slice(0, 160));

      await flushRouteMetrics();
      check('4.9 route counters wrote a RouteMetric document with counts and no paths', (await RouteMetric.countDocuments()) >= 1 && !JSON.stringify(await RouteMetric.find().lean()).includes('/operator/v1/orgs'));

      const run = await runHealthChecks();
      check('4.9 all eight components were evaluated', Object.keys(run).sort().join() === ['admin_api', 'database', 'email', 'event_dispatcher', 'identity', 'jobs', 'products_api', 'products_worker'].sort().join(), Object.keys(run).join());
      check('4.9 database and identity are healthy in the smoke environment', run.database.state === 'healthy' && run.identity.state === 'healthy', JSON.stringify([run.database, run.identity]));
      const after = await json(await op('/health'));
      check('4.9 GET /health returns the stored state, overall state and is no longer stale', after.data.components.every((c: any) => !!c.checked_at) && ['healthy', 'degraded', 'critical'].includes(after.data.state) && after.data.stale === false, JSON.stringify(after.data.state));

      // A failed job turns the jobs component degraded and adds exactly one HealthEvent.
      await Job.create({ type: 'smoke.failed', payload: {}, status: 'failed', attempts: 5, finished_at: new Date(), last_error: 'boom' });
      await runHealthChecks();
      await runHealthChecks();
      const ev = await HealthEvent.find({ component: 'jobs' }).lean();
      check('4.9 a failed job degrades jobs and records one state change', (await HealthCheck.findOne({ component: 'jobs' }))?.state === 'degraded' && ev.length === 1 && ev[0].from === 'healthy' && ev[0].to === 'degraded', JSON.stringify(ev));
      const hist = (await json(await op('/health'))).data.history;
      check('4.9 /health history lists the change', hist.some((h: any) => h.component === 'jobs' && h.to === 'degraded'));
      await Job.deleteMany({ type: 'smoke.failed' });

      const sync = await op('/health/sync');
      const syncj = await json(sync);
      check('4.9 GET /health/sync answers with configured and rows[]', sync.status === 200 && typeof syncj.data.configured === 'boolean' && Array.isArray(syncj.data.rows), JSON.stringify(syncj).slice(0, 160));

      await OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles: ['support'] } });
      check('4.9 every role with health.read can read health (support = 200)', (await op('/health')).status === 200 && (await op('/health/sync')).status === 200);
      await OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles: ['platform_admin'] } });
    }

    // ── Plan 4.10: signals and overview ──
    {
      const { runSignals, computeDailyStats } = await import('../lib/signals');
      const { AttentionItem, TenantDailyStat, Company } = await import('../models');
      const json = async (r: any) => (await r.json()) as any;
      const t = await Company.findOne({ status: 'active' });
      await Company.updateOne({ _id: t!._id }, { $set: { trial_ends_at: new Date(Date.now() - 2 * 86_400_000) } });
      await computeDailyStats();
      const run = await runSignals();
      check('4.10 signals ran and the daily stats wrote a row per tenant', (await TenantDailyStat.countDocuments()) >= 1 && Array.isArray(run.failed));
      check('4.10 an ended trial raises a critical trial_ended item', !!(await AttentionItem.findOne({ kind: 'trial_ended', company_id: t!._id, open: true, severity: 'critical' })));
      const ov = await op('/overview');
      const ovj = await json(ov);
      check('4.10 GET /overview returns the five blocks', ov.status === 200 && ['tenants', 'members_active', 'health', 'attention', 'activity'].every((k) => k in ovj.data), Object.keys(ovj.data ?? {}).join());
      check('4.10 overview tenants and attention are filled', ovj.data.tenants.total >= 1 && ovj.data.attention.counts.critical >= 1 && ovj.data.attention.top[0].severity === 'critical', JSON.stringify(ovj.data.attention).slice(0, 160));
      await Company.updateOne({ _id: t!._id }, { $unset: { trial_ends_at: 1 } });
      await runSignals();
      check('4.10 the item resolves when the trial date is cleared', !(await AttentionItem.findOne({ kind: 'trial_ended', company_id: t!._id, open: true })));
      await OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles: ['support'] } });
      check('4.10 support can read the overview (overview.read)', (await op('/overview')).status === 200);
      await OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles: ['platform_admin'] } });
    }

    // ── Plan 4.11: security page, operator sessions, operator invite ──
    {
      const { OperatorSession, Invitation, OperatorAuditEvent } = await import('../models');
      const json = async (r: any) => (await r.json()) as any;
      const me = await OperatorAccount.findOne({ email: 'op@karbexa.test' });
      const sec = await op('/security');
      const secj = await json(sec);
      check('4.11 GET /security returns the six blocks', sec.status === 200 && ['operators_without_mfa', 'failed_sign_ins', 'locked_accounts', 'active_sessions', 'tenants_without_mfa', 'recent_role_changes'].every((k) => k in secj.data), Object.keys(secj.data ?? {}).join());
      check('4.11 the signed-in operator has a listed active session', Array.isArray(secj.data.active_sessions) && secj.data.active_sessions.some((s: any) => s.operator_email === 'op@karbexa.test'));

      const inv = await op('/operators/invite', 'POST', { email: 'newop@karbexa.test', full_name: 'New Op', roles: ['support'] });
      const invj = await json(inv);
      const created = await OperatorAccount.findOne({ email: 'newop@karbexa.test' });
      check('4.11 invite creates an invited operator with the chosen role', inv.status === 201 && created?.status === 'invited' && created.roles.join() === 'support' && String(created.invited_by) === String(me!._id), JSON.stringify(invj).slice(0, 160));
      check('4.11 invite stores an operator invitation with no company and no token in the response', !!(await Invitation.findOne({ kind: 'operator', user_id: created!._id, company_id: null, state: 'pending' })) && !JSON.stringify(invj).includes('token'));
      check('4.11 an invited operator cannot be a duplicate (409)', (await op('/operators/invite', 'POST', { email: 'newop@karbexa.test', full_name: 'Again', roles: ['support'] })).status === 409);
      check('4.11 invite is audited in the operator category', !!(await OperatorAuditEvent.findOne({ action: 'operator.invited', target_id: String(created!._id), category: 'operator' })));

      const target = await OperatorSession.create({ _id: 'smoke-4-11-sid', operator_id: created!._id, idle_expires_at: new Date(Date.now() + 600_000) });
      const list = await json(await op(`/operators/${created!._id}/sessions`));
      check('4.11 GET /operators/:id/sessions lists the session as active', list.data.some((s: any) => s.id === target._id && s.active === true), JSON.stringify(list).slice(0, 160));
      check('4.11 revoking a session of another operator id is 404', (await op(`/operators/${me!._id}/sessions/${target._id}`, 'DELETE')).status === 404);
      const del = await op(`/operators/${created!._id}/sessions/${target._id}`, 'DELETE');
      check('4.11 DELETE session revokes it and audits it', del.status === 200 && !!(await OperatorSession.findById(target._id))?.revoked_at && !!(await OperatorAuditEvent.findOne({ action: 'operator.session_revoked', category: 'security' })));

      await OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles: ['support'] } });
      check('4.11 support cannot read /security (403) or invite (403)', (await op('/security')).status === 403 && (await op('/operators/invite', 'POST', { email: 'z@karbexa.test', full_name: 'Z', roles: ['support'] })).status === 403);
      await OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles: ['auditor'] } });
      check('4.11 auditor reads /security (200) and sessions (200) but cannot revoke (403)', (await op('/security')).status === 200 && (await op(`/operators/${created!._id}/sessions`)).status === 200 && (await op(`/operators/${created!._id}/sessions/x`, 'DELETE')).status === 403);
      await OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles: ['platform_admin'] } });
      await OperatorAccount.deleteOne({ _id: created!._id });
    }

    // ── Plan 4.12: typed confirmation, reasons, announcement ──
    {
      const { Announcement, OperatorAuditEvent } = await import('../models');
      const json = async (r: any) => (await r.json()) as any;
      const t = await Company.findOne({ status: 'active' });
      const id = String(t!._id);
      check('4.12 suspend without a reason = 400', (await op(`/orgs/${id}/suspend`, 'POST', { confirm_slug: t!.slug })).status === 400);
      check('4.12 suspend with a wrong slug = 400 CONFIRM_SLUG_MISMATCH', (await json(await op(`/orgs/${id}/suspend`, 'POST', { reason: 'x', confirm_slug: 'nope' }))).code === 'CONFIRM_SLUG_MISMATCH');
      check('4.12 close without the slug = 400 and the tenant is untouched', (await op(`/orgs/${id}/close`, 'POST', { reason: 'x' })).status === 400 && (await Company.findById(id))?.status === 'active');
      check('4.12 reactivate also needs a reason (400)', (await op(`/orgs/${id}/reactivate`, 'POST', {})).status === 400);
      const sus = await op(`/orgs/${id}/suspend`, 'POST', { reason: 'smoke 4.12', confirm_slug: t!.slug });
      check('4.12 suspend with reason and slug = 200 and the reason is audited', sus.status === 200 && !!(await OperatorAuditEvent.findOne({ action: 'org.suspended', target_id: id, reason: 'smoke 4.12' })));
      check('4.12 reactivate with a reason (no slug) = 200', (await op(`/orgs/${id}/reactivate`, 'POST', { reason: 'smoke 4.12 done' })).status === 200 && (await Company.findById(id))?.status === 'active');

      const now = Date.now();
      check('4.12 announcement starts empty', (await json(await op('/announcement'))).data === null);
      const put = await op('/announcement', 'PUT', { message: 'Maintenance tonight', severity: 'warning', ends_at: new Date(now + 3600_000).toISOString() });
      check('4.12 PUT /announcement = 200', put.status === 200);
      check('4.12 GET /announcement returns it', (await json(await op('/announcement'))).data?.message === 'Maintenance tonight');
      check('4.12 a message over 280 characters = 400', (await op('/announcement', 'PUT', { message: 'x'.repeat(281), ends_at: new Date(now + 3600_000).toISOString() })).status === 400);
      await op('/announcement', 'PUT', { message: 'Second', ends_at: new Date(now + 3600_000).toISOString() });
      check('4.12 a second PUT replaces the first (one current)', (await json(await op('/announcement'))).data?.message === 'Second' && (await Announcement.countDocuments({ ends_at: { $gt: new Date() } })) === 1);
      await OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles: ['support'] } });
      check('4.12 support can read the announcement (200) but not set it (403)', (await op('/announcement')).status === 200 && (await op('/announcement', 'PUT', { message: 'x', ends_at: new Date(now + 3600_000).toISOString() })).status === 403);
      await OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles: ['platform_admin'] } });
      check('4.12 DELETE /announcement ends it', (await op('/announcement', 'DELETE')).status === 200 && (await json(await op('/announcement'))).data === null);
    }

    // ── Plan 4.13: products catalogue (read-only) ─────────────────────────────────────────
    {
      const { OrganizationEntitlement: Ent } = await import('../models');
      const r = await op('/products');
      const list = ((await r.json()) as any).data as any[];
      check('4.13 /products lists the four built-in products with manifest facts and role counts', r.status === 200 && ['people', 'projects', 'sign', 'desk'].every((k) => list.some((p) => p.product_key === k && typeof p.name === 'string' && p.roles > 0 && p.status === 'active' && typeof p.category === 'string')), JSON.stringify(list)?.slice(0, 200));
      const closedIds = await Company.find({ status: 'closed' }).distinct('_id');
      const wantActive = await Ent.countDocuments({ product_key: 'people', status: 'active', company_id: { $nin: closedIds } });
      check('4.13 tenants_active matches the active entitlements of non-closed organizations', list.find((p) => p.product_key === 'people')?.tenants_active === wantActive && wantActive > 0, `${list.find((p) => p.product_key === 'people')?.tenants_active} vs ${wantActive}`);
      await OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles: ['auditor'] } });
      check('4.13 every operator role can read the catalogue (auditor = 200)', (await op('/products')).status === 200);
      check('4.13 the catalogue is read-only: POST /products is not a route', (await op('/products', 'POST', {})).status === 404);
      await OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles: ['platform_admin'] } });
    }

    // ── Plan 4.7: seats (SeatUsage, SEAT_LIMIT_REACHED on assignment, widening, not blocked elsewhere) ──
    {
      const { SeatUsage, Department, GroupMember, OrganizationEntitlement: Ent } = await import('../models');
      const { recomputeSeatUsage } = await import('../lib/seats');
      const json = async (r: any) => (await r.json()) as any;
      const prov = await json(await op('/orgs', 'POST', { name: 'Seat Co', slug: 'seat-co', plan_key: 'professional', first_admin: { email: 'admin@seat.test', full_name: 'Sam Seat' } }));
      const cid = prov.data.id as string;
      const admin = (await User.findOne({ company_id: cid, email: 'admin@seat.test' }))!;
      await User.updateOne({ _id: admin._id }, { $set: { lifecycle_state: 'active', is_active: true } });
      const mkUser = async (n: number) => User.create({
        company_id: cid, full_name: `Seat Member ${n}`, email: `m${n}@seat.test`, password_hash: 'x', role: 'Employee', lifecycle_state: 'active', is_active: true,
        employment_type: 'full_time', employee_id: `SEAT-${n}`,
      });
      const [u1, u2, u3] = [await mkUser(1), await mkUser(2), await mkUser(3)];

      // `sign` has no default rule, so nothing holds a seat until an assignment is made. Entitle it with a limit of 2.
      const put = await op(`/orgs/${cid}/entitlements/sign`, 'PUT', { status: 'active', seats_limit: 2, reason: 'Smoke seats' });
      check('4.7 entitle sign with a seat limit of 2', put.status === 200, put.status);
      await recomputeSeatUsage(cid);
      check('4.7 SeatUsage starts at 0', (await SeatUsage.findOne({ company_id: cid, product_key: 'sign' }))?.used === 0);

      const sid = crypto.randomUUID();
      await Session.create({ _id: sid, identity_id: new mongoose.Types.ObjectId(), member_id: admin._id, company_id: cid, realm: 'tenant', idle_expires_at: new Date(Date.now() + 3600e3), absolute_expires_at: new Date(Date.now() + 3600e3), amr: ['pwd'] });
      const tKey = await jose.importJWK(tenantPrivateJwk, 'RS256');
      const tAt = await new jose.SignJWT({ token_use: 'access', org: cid, sid, email: admin.email })
        .setProtectedHeader({ alg: 'RS256', kid: 'tenant-smoke', typ: 'at+jwt' })
        .setIssuer(`${ORIGIN}/realms/tenant`).setAudience('urn:karbexa:admin').setSubject(String(admin._id)).setIssuedAt().setExpirationTime('10m').sign(tKey);
      const tenant = (path: string, method: string, body?: unknown) => fetch(`${ORIGIN}/api/v1${path}`, {
        method, headers: { authorization: `Bearer ${tAt}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
      });
      const signApp = (await App.findOne({ product_key: 'sign', app_type: 'karbexa_product' }))!;
      const role = (await ProductRole.findOne({ product_key: 'sign', assignable: true }).sort({ key: 1 }))!.key;
      const assign = (target_type: string, target_id: string) => tenant(`/apps/${signApp._id}/assign`, 'POST', { target_type, target_id, product_role_key: role });

      check('4.7 first seat: assign to member 1 = 200/201', [200, 201].includes((await assign('user', String(u1._id))).status));
      check('4.7 second seat: assign to member 2 = 200/201', [200, 201].includes((await assign('user', String(u2._id))).status));
      await recomputeSeatUsage(cid);
      check('4.7 SeatUsage counts the two seats', (await SeatUsage.findOne({ company_id: cid, product_key: 'sign' }))?.used === 2);

      const over = await assign('user', String(u3._id));
      const overj = await json(over);
      check('4.7 third seat is refused = 409 SEAT_LIMIT_REACHED with product, limit, used, requested', over.status === 409 && overj.code === 'SEAT_LIMIT_REACHED' && overj.details?.product_key === 'sign' && overj.details?.limit === 2 && overj.details?.used === 2 && overj.details?.requested === 1, JSON.stringify(overj));
      check('4.7 the refused assignment was not created', (await AppAssignment.countDocuments({ company_id: cid, app_id: signApp._id, target_id: u3._id })) === 0);

      const gOk = await Group.create({ company_id: cid, name: 'Existing seats', type: 'static', is_active: true } as never);
      await GroupMember.create([{ group_id: gOk._id, user_id: u1._id, assigned_by: admin._id }, { group_id: gOk._id, user_id: u2._id, assigned_by: admin._id }] as never);
      check('4.7 a group whose members already hold seats adds none = allowed', [200, 201].includes((await assign('group', String(gOk._id))).status));
      const gNew = await Group.create({ company_id: cid, name: 'Needs a seat', type: 'static', is_active: true } as never);
      await GroupMember.create([{ group_id: gNew._id, user_id: u1._id, assigned_by: admin._id }, { group_id: gNew._id, user_id: u3._id, assigned_by: admin._id }] as never);
      const gOver = await assign('group', String(gNew._id));
      check('4.7 a group that would add a new member past the limit = 409 (requested 1)', gOver.status === 409 && (await json(gOver)).details?.requested === 1, gOver.status);

      // Widening an assignment to descendants adds members: checked as well.
      const parent = await Department.create({ company_id: cid, name: 'Parent', slug: 'parent', type: 'department' } as never);
      const child = await Department.create({ company_id: cid, name: 'Child', slug: 'child', type: 'department', parent_id: parent._id } as never);
      await User.updateOne({ _id: u3._id }, { $set: { department_id: child._id } });
      const deptRes = await tenant(`/apps/${signApp._id}/assign`, 'POST', { target_type: 'department', target_id: String(parent._id), product_role_key: role, include_descendants: false });
      check('4.7 a department assignment without descendants adds nobody = allowed', [200, 201].includes(deptRes.status), deptRes.status);
      const deptAsg = await AppAssignment.findOne({ company_id: cid, app_id: signApp._id, target_type: 'department', is_active: true });
      const widen = await tenant(`/apps/assignments/${deptAsg!._id}`, 'PATCH', { include_descendants: true });
      check('4.7 widening to descendants that would exceed the limit = 409', widen.status === 409 && (await json(widen)).code === 'SEAT_LIMIT_REACHED', widen.status);

      // No limit: nothing is checked.
      await Ent.updateOne({ company_id: cid, product_key: 'sign' }, { $unset: { seats_limit: 1 } });
      check('4.7 with no seat limit the same assignment is allowed', [200, 201].includes((await assign('user', String(u3._id))).status));

      // Operator views
      await recomputeSeatUsage(cid);
      const prodRow = (await json(await op(`/orgs/${cid}/products`))).data.find((p: any) => p.product_key === 'sign');
      check('4.7 /products shows seats_used', prodRow.seats_used === 3 && prodRow.seats_limit === null, JSON.stringify(prodRow));
      const detail = (await json(await op(`/orgs/${cid}`))).data;
      check('4.7 org detail has seat_usage[] with used and limit', detail.seat_usage.some((s: any) => s.product_key === 'sign' && s.used === 3 && s.limit === null), JSON.stringify(detail.seat_usage));

      // A suspended tenant holds no seats.
      await Company.updateOne({ _id: cid }, { $set: { status: 'suspended' } });
      await recomputeSeatUsage(cid, ['sign']);
      check('4.7 a suspended tenant counts 0 seats', (await SeatUsage.findOne({ company_id: cid, product_key: 'sign' }))?.used === 0);
      await Company.updateOne({ _id: cid }, { $set: { status: 'active' } });
    }

    // ── Plan 4.6: overrides (reason required, expiry, back to plan state, expiry job) ───────
    {
      const { OrganizationEntitlement: Ent, PlatformEvent } = await import('../models');
      const { expireOverrides } = await import('../operator/overrides');
      const json = async (r: any) => (await r.json()) as any;
      const prov = await json(await op('/orgs', 'POST', { name: 'Override Co', slug: 'override-co', plan_key: 'professional', first_admin: { email: 'admin@override.test', full_name: 'Ora Ride' } }));
      const cid = prov.data.id as string;
      const plan = (await Plan.findOne({ key: 'professional' }))!;
      const inPlan = plan.products[0];
      const outOfPlan = ['people', 'projects', 'sign', 'desk'].find((k) => !plan.products.includes(k))!;
      const put = (key: string, body: Record<string, unknown>) => op(`/orgs/${cid}/entitlements/${key}`, 'PUT', body);

      const noReason = await put(inPlan, { status: 'suspended' });
      check('4.6 PUT without a reason = 400 REASON_REQUIRED', noReason.status === 400 && (await json(noReason)).code === 'REASON_REQUIRED', noReason.status);
      check('4.6 a past expiry = 400', (await put(inPlan, { status: 'active', reason: 'x', expires_at: '2020-01-01T00:00:00Z' })).status === 400);
      check('4.6 a suspended override cannot carry an expiry = 400', (await put(inPlan, { status: 'suspended', reason: 'x', expires_at: new Date(Date.now() + 86400e3).toISOString() })).status === 400);

      const soon = new Date(Date.now() + 3600e3).toISOString();
      const set = await put(outOfPlan, { status: 'active', reason: 'Pilot access', expires_at: soon, seats_limit: 5 });
      const setj = await json(set);
      check('4.6 override stored with source operator, reason, expiry, seats', set.status === 200 && setj.data.source === 'operator' && setj.data.reason === 'Pilot access' && !!setj.data.expires_at && setj.data.seats_limit === 5, JSON.stringify(setj));
      const evt = await PlatformEvent.findOne({ org_id: cid, type: 'entitlement.changed', 'data.product_key': outOfPlan }).sort({ seq: -1 });
      check('4.6 entitlement.changed carries source, seats_limit and expires_at (additive)', (evt as any)?.data?.source === 'operator' && (evt as any)?.data?.seats_limit === 5 && !!(evt as any)?.data?.expires_at, JSON.stringify((evt as any)?.data));
      check('4.6 the override is audited with its reason', !!(await OperatorAuditEvent.findOne({ action: 'entitlement.updated', target_id: `${cid}:${outOfPlan}`, reason: 'Pilot access' })));
      const prodRow = (await json(await op(`/orgs/${cid}/products`))).data.find((p: any) => p.product_key === outOfPlan);
      check('4.6 /products shows the override reason and expiry', prodRow.source === 'operator' && prodRow.reason === 'Pilot access' && !!prodRow.expires_at, JSON.stringify(prodRow));

      const noReasonDel = await op(`/orgs/${cid}/entitlements/${outOfPlan}/override`, 'DELETE');
      check('4.6 DELETE override without a reason = 400', noReasonDel.status === 400);
      check('4.6 DELETE override on a product with none = 404', (await op(`/orgs/${cid}/entitlements/${inPlan}/override?reason=x`, 'DELETE')).status === 404);
      const del = await op(`/orgs/${cid}/entitlements/${outOfPlan}/override?reason=Pilot%20over`, 'DELETE');
      check('4.6 removing an override on a product outside the plan deletes the entitlement', del.status === 200 && (await json(del)).data.status === 'removed' && !(await Ent.findOne({ company_id: cid, product_key: outOfPlan })), del.status);

      await put(inPlan, { status: 'suspended', reason: 'Billing hold' });
      const back = await op(`/orgs/${cid}/entitlements/${inPlan}/override?reason=Resolved`, 'DELETE');
      const row = await Ent.findOne({ company_id: cid, product_key: inPlan });
      check('4.6 removing an override on a plan product returns it to plan state', back.status === 200 && row?.source === 'plan' && row?.status === 'active' && !row?.reason, JSON.stringify(row));
      check('4.6 removal is audited with the reason', !!(await OperatorAuditEvent.findOne({ action: 'entitlement.override_removed', target_id: `${cid}:${inPlan}`, reason: 'Resolved' })));

      // Expiry job: an active override whose date has passed falls back; audited with actor system.
      await put(outOfPlan, { status: 'active', reason: 'Trial extension', expires_at: soon });
      await Ent.updateOne({ company_id: cid, product_key: outOfPlan }, { $set: { expires_at: new Date(Date.now() - 60e3) } });
      await put(inPlan, { status: 'active', reason: 'No expiry' });
      check('4.6 expiry job removes only the expired override', (await expireOverrides()) === 1 && !(await Ent.findOne({ company_id: cid, product_key: outOfPlan })) && (await Ent.findOne({ company_id: cid, product_key: inPlan }))?.source === 'operator');
      const sys = await OperatorAuditEvent.findOne({ action: 'entitlement.override_removed', target_id: `${cid}:${outOfPlan}`, reason: 'Override expired' });
      check('4.6 expiry is audited with actor system', sys?.operator_email === 'system' && !sys.operator_id && sys.reason === 'Override expired', JSON.stringify(sys));
      check('4.6 expiry job is idempotent', (await expireOverrides()) === 0);

      await OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles: ['support'] } });
      check('4.6 support cannot set or remove overrides = 403', (await put(inPlan, { status: 'active', reason: 'x' })).status === 403 && (await op(`/orgs/${cid}/entitlements/${inPlan}/override?reason=x`, 'DELETE')).status === 403);
      await OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles: ['platform_admin'] } });
    }

    // ── Plan 4.5: plans (editor fields, version, apply with preview, one job per tenant, overrides kept) ──
    {
      const { OrganizationEntitlement: Ent, Job } = await import('../models');
      const { processDueJobs } = await import('../lib/jobs');
      const json = async (r: any) => (await r.json()) as any;
      const mk = await op('/plans', 'POST', { key: 'p45', name: 'P45', products: ['people', 'desk'], description: 'Smoke plan', seat_defaults: { people: 25 }, trial_days: 14 });
      const mkj = await json(mk);
      check('4.5 plan created with description, seat defaults, trial days and version 1', mk.status === 201 && mkj.data.version === 1 && mkj.data.seat_defaults.people === 25 && mkj.data.trial_days === 14 && mkj.data.description === 'Smoke plan', JSON.stringify(mkj));
      check('4.5 seat default for an unknown product = 400', (await op('/plans', 'POST', { key: 'p45b', name: 'X', products: [], seat_defaults: { nope: 3 } })).status === 400);

      const prov = await json(await op('/orgs', 'POST', { name: 'Plan45 Co', slug: 'plan45-co', plan_key: 'p45', first_admin: { email: 'admin@plan45.test', full_name: 'Pat Plan' } }));
      const cid = prov.data.id as string;
      const days = ((await Company.findById(cid))!.trial_ends_at!.getTime() - Date.now()) / 86400e3;
      check('4.5 a tenant created on a plan with trial days gets trial_ends_at', days > 13.9 && days < 14.1, days);
      const people = await Ent.findOne({ company_id: cid, product_key: 'people' });
      check('4.5 provisioning stores plan_version and the seat default on the entitlement', people?.plan_version === 1 && people?.seats_limit === 25, JSON.stringify(people));

      await op(`/orgs/${cid}/entitlements/people`, 'PUT', { status: 'suspended', reason: 'Smoke override' }); // an override
      const edit = await json(await op('/plans/p45', 'PATCH', { products: ['people', 'sign'] }));
      check('4.5 every plan edit raises the version', edit.data.version === 2, edit.data.version);

      const dry = await json(await op('/plans/p45/apply?dry_run=true', 'POST'));
      check('4.5 plan dry run reports added, restricted, unchanged and tenants_affected', dry.data.added[0]?.product_key === 'sign' && dry.data.restricted[0]?.product_key === 'desk' && dry.data.unchanged[0]?.product_key === 'people' && dry.data.tenants_affected === 1, JSON.stringify(dry.data));
      check('4.5 dry run writes nothing', (await Ent.findOne({ company_id: cid, product_key: 'desk' }))?.status === 'active' && (await Job.countDocuments({ type: 'plan.apply' })) === 0);
      const dry2 = await json(await op(`/orgs/${cid}?dry_run=true`, 'PATCH', { plan_key: 'p45' }));
      check('4.5 tenant dry run has the same shape and writes nothing', dry2.data.added[0]?.product_key === 'sign' && dry2.data.tenants_affected === 1 && !(await Ent.findOne({ company_id: cid, product_key: 'sign' })), JSON.stringify(dry2.data));

      await OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles: ['operations'] } });
      check('4.5 operations cannot apply a plan = 403', (await op('/plans/p45/apply', 'POST')).status === 403);
      await OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles: ['platform_admin'] } });
      const applied = await op('/plans/p45/apply', 'POST');
      check('4.5 apply queues one job per tenant = 202', applied.status === 202 && (await json(applied)).data.queued === 1 && (await Job.countDocuments({ type: 'plan.apply', status: 'queued' })) === 1, applied.status);
      await processDueJobs();
      const after = new Map((await Ent.find({ company_id: cid })).map((e) => [e.product_key, e]));
      check('4.5 job: the new plan product is active with the plan version', after.get('sign')?.status === 'active' && after.get('sign')?.source === 'plan' && after.get('sign')?.plan_version === 2);
      check('4.5 job: the product that left the plan is restricted (data kept)', after.get('desk')?.status === 'restricted');
      check('4.5 job: the override is untouched', after.get('people')?.status === 'suspended' && after.get('people')?.source === 'operator');
      check('4.5 job finished and the apply is audited with added and restricted', (await Job.countDocuments({ type: 'plan.apply', status: 'done' })) === 1 && !!(await OperatorAuditEvent.findOne({ action: 'org.plan_assigned', target_id: cid, 'after.restricted': 'desk' })));
      const listed = (await json(await op('/plans'))).data.find((x: any) => x.key === 'p45');
      check('4.5 plan list shows the tenant count', listed?.tenant_count === 1, listed?.tenant_count);
      await op('/plans/p45', 'PATCH', { products: ['people', 'desk'] });
      await op(`/orgs/${cid}`, 'PATCH', { plan_key: 'p45' });
      check('4.5 a restricted product that returns to the plan is active again', (await Ent.findOne({ company_id: cid, product_key: 'desk' }))?.status === 'active');
    }

    // ── Plan 4.4: tenant profile (products, admins, notes, tags and trial) ───────────────────
    {
      const { TenantNote } = await import('../models');
      const acme = (await Company.findOne({ slug: 'acme' }))!;
      const id = String(acme._id);
      const json = async (r: any) => (await r.json()) as any;
      const prods = await json(await op(`/orgs/${id}/products`));
      check('4.4 /products lists every registered product with an entitlement state', prods.data.length >= 4 && prods.data.every((p: any) => typeof p.status === 'string') && prods.data.some((p: any) => p.status === 'active' && p.source === 'plan'), JSON.stringify(prods.data)?.slice(0, 160));
      const admins = await json(await op(`/orgs/${id}/admins`));
      check('4.4 /admins lists the first admin with roles, mfa flag and status', admins.data.some((a: any) => a.email === 'admin@acme.test' && a.roles.includes('Super Admin') && a.mfa_enabled === false && typeof a.status === 'string'), JSON.stringify(admins.data)?.slice(0, 160));
      check('4.4 /admins of an unknown org = 404', (await op('/orgs/000000000000000000000000/admins')).status === 404);

      const patch = await op(`/orgs/${id}`, 'PATCH', { tags: ['pilot', 'pilot', ' emea '], trial_ends_at: '2027-01-31T00:00:00Z' });
      const pj = await json(patch);
      check('4.4 PATCH tags and trial (tags de-duplicated and trimmed)', patch.status === 200 && pj.data.tags.join() === 'pilot,emea' && !!pj.data.trial_ends_at, JSON.stringify(pj));
      const upd = await OperatorAuditEvent.findOne({ action: 'org.updated', target_id: id });
      check('4.4 PATCH is audited with before and after', !!upd && (upd.before as any)?.tags?.length === 0 && (upd.after as any)?.tags?.length === 2, JSON.stringify(upd?.after));
      check('4.4 PATCH with nothing to change = 400', (await op(`/orgs/${id}`, 'PATCH', {})).status === 400);
      check('4.4 PATCH with 11 tags = 400', (await op(`/orgs/${id}`, 'PATCH', { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).status === 400);
      check('4.4 PATCH with a 31-character tag = 400', (await op(`/orgs/${id}`, 'PATCH', { tags: ['x'.repeat(31)] })).status === 400);
      check('4.4 PATCH trial_ends_at null clears it', (await json(await op(`/orgs/${id}`, 'PATCH', { trial_ends_at: null }))).data.trial_ends_at === null);
      await Company.updateOne({ _id: acme._id }, { $set: { tags: [] } });

      const mk = await op(`/orgs/${id}/notes`, 'POST', { body: 'Called the admin; waiting on SSO.' });
      const mkj = await json(mk);
      check('4.4 note created = 201 with author', mk.status === 201 && mkj.data.operator_email === 'op@karbexa.test', mk.status);
      check('4.4 empty note = 400', (await op(`/orgs/${id}/notes`, 'POST', { body: '   ' })).status === 400);
      check('4.4 note over 2000 characters = 400', (await op(`/orgs/${id}/notes`, 'POST', { body: 'x'.repeat(2001) })).status === 400);
      check('4.4 notes list shows it', (await json(await op(`/orgs/${id}/notes`))).data.some((n: any) => n.id === mkj.data.id));
      check('4.4 notes are not mirrored into the tenant audit log', (await AuditEvent.countDocuments({ company_id: acme._id, action: { $in: ['org.note_added', 'org.note_deleted'] } })) === 0);
      check('4.4 note creation is operator-audited', !!(await OperatorAuditEvent.findOne({ action: 'org.note_added', target_id: mkj.data.id })));

      const other = await TenantNote.create({ company_id: acme._id, operator_id: new mongoose.Types.ObjectId(), operator_email: 'other@karbexa.test', body: 'someone else' });
      const roleSave = (roles: string[]) => OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles } });
      await roleSave(['support']);
      check('4.4 support cannot delete another operator\'s note = 403', (await op(`/orgs/${id}/notes/${other._id}`, 'DELETE')).status === 403);
      check('4.4 support can delete their own note = 200', (await op(`/orgs/${id}/notes/${mkj.data.id}`, 'DELETE')).status === 200);
      check('4.4 support cannot PATCH tags = 403', (await op(`/orgs/${id}`, 'PATCH', { tags: ['x'] })).status === 403);
      await roleSave(['auditor']);
      check('4.4 auditor can read notes but not write them', (await op(`/orgs/${id}/notes`)).status === 200 && (await op(`/orgs/${id}/notes`, 'POST', { body: 'x' })).status === 403);
      await roleSave(['platform_admin']);
      check('4.4 platform admin can delete another operator\'s note = 200', (await op(`/orgs/${id}/notes/${other._id}`, 'DELETE')).status === 200);
      check('4.4 a deleted note is gone (404)', (await op(`/orgs/${id}/notes/${other._id}`, 'DELETE')).status === 404);
    }

    // ── Plan 4.3: tenant directory (filters, sorts, summary fields, last activity) ───────────
    {
      const { touchCompanyActivity } = await import('../controllers/auth.controller');
      const orgsQ = async (q = '') => { const r = await op(`/orgs${q}`); return { status: r.status, body: (await r.json()) as any }; };
      const acme = await Company.findOne({ slug: 'acme' });
      await Company.updateOne({ _id: acme!._id }, { $set: { tags: ['pilot', 'emea'], trial_ends_at: new Date(Date.now() + 5 * 86400e3), last_activity_at: new Date(Date.now() - 3 * 3600e3) } });
      const all = await orgsQ('?limit=100');
      const row = all.body.data.find((o: any) => o.slug === 'acme');
      check('4.3 summary has members_total, members_active, products, tags, trial_ends_at, last_activity_at', row && typeof row.members_total === 'number' && typeof row.members_active === 'number' && row.members_active <= row.members_total && Array.isArray(row.products) && row.tags.includes('pilot') && !!row.trial_ends_at && !!row.last_activity_at && row.last_activity === row.last_activity_at, JSON.stringify(row)?.slice(0, 200));
      check('4.3 filter tag=pilot returns only acme', (await orgsQ('?tag=pilot')).body.data.map((o: any) => o.slug).join() === 'acme');
      check('4.3 filter trial=true returns only tenants with a trial end', (await orgsQ('?trial=true')).body.data.every((o: any) => !!o.trial_ends_at) && (await orgsQ('?trial=true')).body.data.some((o: any) => o.slug === 'acme'));
      check('4.3 filter plan=professional returns only that plan', (await orgsQ('?plan=professional')).body.data.every((o: any) => o.plan_key === 'professional'));
      const byName = (await orgsQ('?sort=name&limit=100')).body.data.map((o: any) => o.name);
      check('4.3 sort=name is alphabetical', byName.join('|') === [...byName].sort((a: string, b: string) => a.localeCompare(b, 'en')).join('|'), byName.join('|'));
      check('4.3 sort=last_activity puts the active tenant first', (await orgsQ('?sort=last_activity&limit=100')).body.data[0].slug === 'acme');
      const byMembers = (await orgsQ('?sort=members&limit=100')).body.data.map((o: any) => o.members_total);
      check('4.3 sort=members is descending', byMembers.every((n: number, i: number) => i === 0 || byMembers[i - 1] >= n), byMembers.join());
      const p1 = await orgsQ('?sort=name&limit=1');
      const p2 = await orgsQ(`?sort=name&limit=1&cursor=${p1.body.meta.next_cursor}`);
      check('4.3 offset paging for non-default sorts walks forward', !!p1.body.meta.next_cursor && p2.body.data.length === 1 && p2.body.data[0].id !== p1.body.data[0].id);
      check('4.3 invalid sort = 400', (await orgsQ('?sort=bogus')).status === 400);
      await Company.updateOne({ _id: acme!._id }, { $set: { last_activity_at: new Date(Date.now() - 5 * 60e3) } });
      await touchCompanyActivity(acme!._id as any);
      check('4.3 last activity is not rewritten within the hour', Date.now() - (await Company.findById(acme!._id))!.last_activity_at!.getTime() > 4 * 60e3);
      await Company.updateOne({ _id: acme!._id }, { $set: { last_activity_at: new Date(Date.now() - 2 * 3600e3) } });
      await touchCompanyActivity(acme!._id as any);
      check('4.3 last activity is rewritten after an hour', Date.now() - (await Company.findById(acme!._id))!.last_activity_at!.getTime() < 60e3);
      check('4.3 tag longer than 30 characters is rejected by the model', await Company.updateOne({ _id: acme!._id }, { $set: { tags: ['x'.repeat(31)] } }, { runValidators: true }).then(() => false, () => true));
      await Company.updateOne({ _id: acme!._id }, { $set: { tags: [], trial_ends_at: null } });
    }

    // ── Plan 4.2: operator audit (category, before/after, filters, CSV export) ──────────────
    {
      const list = async (q = '') => ((await (await op(`/audit${q}`)).json()) as any).data as any[];
      const supEvent = (await list('?action=org.suspended'))[0];
      check('4.2 audit entries carry category, result, before and after', supEvent?.category === 'tenant' && supEvent.result === 'success' && supEvent.before?.status === 'active' && supEvent.after?.status === 'suspended', JSON.stringify(supEvent)?.slice(0, 160));
      check('4.2 operator.created is categorised operator', (await list('?action=operator.created')).every((e) => e.category === 'operator'));
      const byCat = await list('?category=entitlement');
      check('4.2 category filter returns only that category', byCat.length > 0 && byCat.every((e) => e.category === 'entitlement'), byCat.length);
      const opId = (await list())[0].operator_id;
      check('4.2 operator_id filter', (await list(`?operator_id=${opId}`)).length > 0 && (await list('?operator_id=000000000000000000000000')).length === 0);
      check('4.2 from/to filter: a future window is empty, a past-to-future window is not', (await list('?from=2099-01-01T00:00:00Z')).length === 0 && (await list('?from=2000-01-01T00:00:00Z&to=2099-01-01T00:00:00Z')).length > 0);
      check('4.2 invalid category = 400', (await op('/audit?category=nope')).status === 400);
      const before = await OperatorAuditEvent.countDocuments({ action: 'audit.exported' });
      const exp = await op('/audit/export?category=tenant');
      const csv = await exp.text();
      check('4.2 export = 200 text/csv with a header and tenant rows only', exp.status === 200 && (exp.headers.get('content-type') || '').startsWith('text/csv') && /"created_at","operator_email"/.test(csv) && csv.includes('org.provisioned') && !csv.includes('entitlement.updated'), exp.status);
      check('4.2 the export is itself audited (category security)', (await OperatorAuditEvent.countDocuments({ action: 'audit.exported', category: 'security' })) === before + 1);
      const roleSave = (roles: string[]) => OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles } });
      await roleSave(['support']);
      check('4.2 support cannot export = 403', (await op('/audit/export')).status === 403);
      await roleSave(['auditor']);
      check('4.2 auditor can export = 200', (await op('/audit/export')).status === 200);
      await roleSave(['platform_admin']);
    }

    // ── Plan 4.1: operator roles (the same token, the account's roles changed in the database) ──
    {
      const setRoles = (roles: string[]) => OperatorAccount.updateOne({ email: 'op@karbexa.test' }, { $set: { roles } });
      const meOf = async () => ((await (await op('/me')).json()) as any).data;
      const me = await meOf();
      check('4.1 /me returns the operator with permissions', me?.email === 'op@karbexa.test' && me.permissions.includes('tenants.close') && me.permissions.includes('operators.write'), JSON.stringify(me)?.slice(0, 120));
      await setRoles(['support']);
      check('4.1 support: /me lists notes.write, not tenants.write', (await meOf()).permissions.includes('notes.write') && !(await meOf()).permissions.includes('tenants.write'));
      check('4.1 support can read tenants = 200', (await op('/orgs')).status === 200);
      check('4.1 support cannot create a plan = 403', (await op('/plans', 'POST', { key: 'sup-plan', name: 'X', products: [] })).status === 403);
      check('4.1 support cannot read the audit log = 403', (await op('/audit')).status === 403);
      check('4.1 support cannot create an operator = 403', (await op('/operators', 'POST', { email: 'x@karbexa.test', full_name: 'X', password: 'x'.repeat(14) })).status === 403);
      await setRoles(['auditor']);
      check('4.1 auditor can read the audit log = 200', (await op('/audit')).status === 200);
      check('4.1 auditor can list operators = 200', (await op('/operators')).status === 200);
      check('4.1 auditor cannot suspend a tenant = 403', (await op('/orgs/000000000000000000000000/suspend', 'POST', {})).status === 403);
      await setRoles(['operations']);
      check('4.1 operations cannot close a tenant = 403', (await op('/orgs/000000000000000000000000/close', 'POST', {})).status === 403);
      check('4.1 operations cannot read the audit log = 403', (await op('/audit')).status === 403);
      await setRoles(['nonsense']);
      check('4.1 an account with no operator role is rejected = 401', (await op('/me')).status === 401);
      await setRoles(['platform_admin']);
      check('4.1 platform_admin restored = 200', (await op('/audit')).status === 200);
    }

    // ── Plan 5.2: active sessions read Session and revoke through the session service, scoped by company ──
    {
      const json = async (r: any) => (await r.json()) as any;
      const mk = async (slug: string) => {
        const prov = await json(await op('/orgs', 'POST', { name: `Sess ${slug}`, slug, plan_key: 'professional', first_admin: { email: `admin@${slug}.test`, full_name: `Admin ${slug}` } }));
        const cid = prov.data.id as string;
        const admin = (await User.findOne({ company_id: cid, email: `admin@${slug}.test` }))!;
        await User.updateOne({ _id: admin._id }, { $set: { lifecycle_state: 'active', is_active: true } });
        return { cid, admin };
      };
      const a = await mk('sess-a');
      const b = await mk('sess-b');
      const tKey = await jose.importJWK(tenantPrivateJwk, 'RS256');
      const mkSess = async (cid: string, memberId: unknown, extra: Record<string, unknown> = {}) => {
        const sid = crypto.randomUUID();
        await Session.create({ _id: sid, identity_id: new mongoose.Types.ObjectId(), member_id: memberId, company_id: cid, realm: 'tenant', idle_expires_at: new Date(Date.now() + 3600e3), absolute_expires_at: new Date(Date.now() + 3600e3), amr: ['pwd'], ip: '10.0.0.7', user_agent: 'smoke-agent', ...extra });
        return sid;
      };
      const adminSid = await mkSess(a.cid, a.admin._id);
      const at = await new jose.SignJWT({ token_use: 'access', org: a.cid, sid: adminSid, email: a.admin.email })
        .setProtectedHeader({ alg: 'RS256', kid: 'tenant-smoke', typ: 'at+jwt' })
        .setIssuer(`${ORIGIN}/realms/tenant`).setAudience('urn:karbexa:admin').setSubject(String(a.admin._id)).setIssuedAt().setExpirationTime('10m').sign(tKey);
      const tenant = (path: string, method = 'GET') => fetch(`${ORIGIN}/api/v1${path}`, { method, headers: { authorization: `Bearer ${at}` } });

      const target = await mkSess(a.cid, a.admin._id);
      const revokedSid = await mkSess(a.cid, a.admin._id, { revoked_at: new Date(), revoked_reason: 'x' });
      const idleSid = await mkSess(a.cid, a.admin._id, { idle_expires_at: new Date(Date.now() - 1000) });
      const absSid = await mkSess(a.cid, a.admin._id, { absolute_expires_at: new Date(Date.now() - 1000) });
      const otherTenantSid = await mkSess(b.cid, b.admin._id);

      const list = await json(await tenant('/security/sessions'));
      const ids = (list.data as any[]).map((s) => s._id);
      check('5.2 lists the live sessions of this company with ip, agent and the user', ids.includes(target) && ids.includes(adminSid) && (list.data as any[]).find((s) => s._id === target)?.ip_address === '10.0.0.7' && (list.data as any[]).find((s) => s._id === target)?.user?.email === a.admin.email, ids);
      check('5.2 does not list revoked or expired (idle or absolute) sessions', ![revokedSid, idleSid, absSid].some((x) => ids.includes(x)), ids);
      check('5.2 does not list a session of another company', !ids.includes(otherTenantSid), ids);

      const cross = await tenant(`/security/sessions/${otherTenantSid}`, 'DELETE');
      check('5.2 terminating a session of another company = 404 and it stays live', cross.status === 404 && !(await Session.findById(otherTenantSid))!.revoked_at, cross.status);
      check('5.2 terminating an already revoked session = 404', (await tenant(`/security/sessions/${revokedSid}`, 'DELETE')).status === 404);

      const eventsBefore = await PlatformEvent.countDocuments({ type: 'session.revoked', org_id: a.cid });
      const del = await tenant(`/security/sessions/${target}`, 'DELETE');
      const after = (await Session.findById(target))!;
      check('5.2 terminate = 200, revoked_at set with the admin reason', del.status === 200 && !!after.revoked_at && after.revoked_reason === 'admin_terminated', del.status);
      check('5.2 terminate emits session.revoked', (await PlatformEvent.countDocuments({ type: 'session.revoked', org_id: a.cid })) === eventsBefore + 1);
      check('5.2 terminate is audited', (await AuditEvent.countDocuments({ company_id: a.cid, action: 'security.session_terminated' })) === 1);
      check('5.2 the terminated session no longer lists', !((await json(await tenant('/security/sessions'))).data as any[]).some((s) => s._id === target));
    }

    // Phase 5 helper: a provisioned organisation with an active first admin and a signed tenant call.
    const tenantCtx = async (slug: string) => {
      const prov = (await (await op('/orgs', 'POST', { name: `P5 ${slug}`, slug, plan_key: 'professional', first_admin: { email: `admin@${slug}.test`, full_name: `Admin ${slug}` } })).json()) as any;
      const cid = prov.data.id as string;
      const admin = (await User.findOne({ company_id: cid, email: `admin@${slug}.test` }))!;
      await User.updateOne({ _id: admin._id }, { $set: { lifecycle_state: 'active', is_active: true } });
      const sid = crypto.randomUUID();
      await Session.create({ _id: sid, identity_id: new mongoose.Types.ObjectId(), member_id: admin._id, company_id: cid, realm: 'tenant', idle_expires_at: new Date(Date.now() + 3600e3), absolute_expires_at: new Date(Date.now() + 3600e3), amr: ['pwd'] });
      const key = await jose.importJWK(tenantPrivateJwk, 'RS256');
      const at = await new jose.SignJWT({ token_use: 'access', org: cid, sid, email: admin.email })
        .setProtectedHeader({ alg: 'RS256', kid: 'tenant-smoke', typ: 'at+jwt' })
        .setIssuer(`${ORIGIN}/realms/tenant`).setAudience('urn:karbexa:admin').setSubject(String(admin._id)).setIssuedAt().setExpirationTime('10m').sign(key);
      const call = (path: string, method = 'GET', body?: unknown) => fetch(`${ORIGIN}/api/v1${path}`, { method, headers: { authorization: `Bearer ${at}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { cid, admin, call };
    };

    // ── Plan 5.3: exports check seeded permission modules (audit_logs, locations) ──
    {
      const t = await tenantCtx('exports');
      const csv = await t.call('/audit-logs/export/csv');
      check('5.3 Super Admin can export the audit log as CSV = 200 text/csv', csv.status === 200 && (csv.headers.get('content-type') || '').includes('csv'), csv.status);
      const js = await t.call('/audit-logs/export/json');
      check('5.3 Super Admin can export the audit log as JSON = 200', js.status === 200, js.status);
      const { Permission, RolePermission, Role } = await import('../models');
      const perm = await Permission.findOne({ module: 'locations', action: 'export', data_scope: 'all' });
      check('5.3 the locations:export:all permission exists in the seed (holiday export checks it)', !!perm);
      const opsAdminRole = await Role.findOne({ company_id: t.cid, name: 'Ops Admin' });
      check('5.3 Ops Admin holds locations:export:all', !!opsAdminRole && !!(await RolePermission.findOne({ role_id: opsAdminRole._id, permission_id: perm!._id, granted: true })));
    }

    // ── Plan 5.4: subscription products (seats, locked) and effective-access reasons ──
    {
      const t = await tenantCtx('apps54');
      const { SeatUsage, Plan: PlanModel } = await import('../models');
      const sub = (await (await t.call('/organization/subscription')).json()) as any;
      const prods: any[] = sub.data.products;
      check('5.4 subscription keeps the existing entitlements array and adds products', Array.isArray(sub.data.entitlements) && prods.length >= 4, Object.keys(sub.data));
      const people = prods.find((p) => p.product_key === 'people');
      check('5.4 an entitled product reports entitled, seat limit, seats_used and the default role', people?.entitled === true && 'seats_limit' in people && typeof people.seats_used === 'number' && 'default_role' in people, JSON.stringify(people));
      await SeatUsage.updateOne({ company_id: t.cid, product_key: 'people' }, { $set: { used: 3, computed_at: new Date() } }, { upsert: true });
      check('5.4 seats_used reads the stored SeatUsage', ((await (await t.call('/organization/subscription')).json()) as any).data.products.find((p: any) => p.product_key === 'people').seats_used === 3);
      const locked = prods.find((p) => !p.entitled);
      if (locked) {
        const inc = await PlanModel.findOne({ products: locked.product_key, status: 'active' });
        check('5.4 a locked product has seats_used 0 and lists the plans that include it', locked.seats_used === 0 && (inc ? locked.included_in_plans.some((x: any) => x.key === inc.key) : locked.included_in_plans.length === 0), JSON.stringify(locked));
      } else {
        check('5.4 (no locked product on this plan; locked case not exercised)', true);
      }
      const ea = (await (await t.call(`/people/${t.admin._id}/effective-access`)).json()) as any;
      check('5.4 effective-access keeps products and denials and adds reasons', ea.data.products && ea.data.denials && ea.data.reasons && Object.keys(ea.data.reasons).every((k) => k in ea.data.products), Object.keys(ea.data));
      const withReason = Object.entries(ea.data.reasons as Record<string, any[]>).find(([, r]) => r.length > 0);
      check('5.4 a granted product explains itself with a target type and name', !withReason || (!!withReason[1][0].target_type && !!withReason[1][0].target_name), JSON.stringify(withReason));
      const other = await tenantCtx('apps54b');
      check('5.4 effective-access of a member of another company = 404', (await t.call(`/people/${other.admin._id}/effective-access`)).status === 404);
    }

    // ── Plan 5.5: subscription shows the plan, the trial end and the override expiry ──
    {
      const t = await tenantCtx('sub55');
      const get = async () => ((await (await t.call('/organization/subscription')).json()) as any).data;
      const d = await get();
      check('5.5 plan is the plan the plan-sourced entitlements came from', d.plan?.key === 'professional' && typeof d.plan?.name === 'string', JSON.stringify(d.plan));
      check('5.5 every entitlement carries source, plan_key and expires_at', d.entitlements.length > 0 && d.entitlements.every((e: any) => 'source' in e && 'plan_key' in e && 'expires_at' in e));
      const trial = new Date(Date.now() + 5 * 86400e3);
      await Company.updateOne({ _id: t.cid }, { $set: { trial_ends_at: trial } });
      check('5.5 trial_ends_at is returned', new Date((await get()).trial_ends_at).getTime() === trial.getTime());
      const exp = new Date(Date.now() + 7 * 86400e3);
      await OrganizationEntitlement.updateOne({ company_id: t.cid, product_key: 'sign' }, { $set: { source: 'operator', expires_at: exp, status: 'active' } }, { upsert: true });
      const ov = (await get()).entitlements.find((e: any) => e.product_key === 'sign');
      check('5.5 an override reports source operator and its expiry', ov?.source === 'operator' && new Date(ov.expires_at).getTime() === exp.getTime(), JSON.stringify(ov));
      const other = await tenantCtx('sub55b');
      await Company.updateOne({ _id: other.cid }, { $set: { trial_ends_at: null } });
      check('5.5 another organisation sees only its own trial (tenant isolation)', (await ((await other.call('/organization/subscription')).json() as Promise<any>)).data.trial_ends_at === null);
    }

    // ── Plan 5.7: setup checklist derived from live data, scoped by company ──
    {
      const t = await tenantCtx('check57');
      const { Department, SecurityPolicy: SecPol } = await import('../models');
      const get = async () => ((await (await t.call('/overview/setup-progress')).json()) as any).data.checklist as Array<{ key: string; done: boolean }>;
      const done = (c: Array<{ key: string; done: boolean }>, k: string) => c.find((x) => x.key === k)?.done;
      let c = await get();
      check('5.7 checklist has the four steps in order', c.map((x) => x.key).join() === 'organization,security_policy,invite_people,assign_apps', JSON.stringify(c));
      check('5.7 a fresh tenant has the people and apps steps open', done(c, 'invite_people') === false && done(c, 'assign_apps') === false, JSON.stringify(c));
      await Department.create({ company_id: t.cid, name: 'Ops', slug: 'ops-57', type: 'department', is_active: true } as never);
      await User.create({ company_id: t.cid, full_name: 'Second Member', email: 'second@check57.test', password_hash: 'x', role: 'Employee', lifecycle_state: 'active', is_active: true, employment_type: 'full_time', employee_id: 'C57-2' });
      await SecPol.updateOne({ company_id: t.cid }, { $set: { updated_at: new Date(Date.now() + 60_000) } }, { timestamps: false });
      c = await get();
      check('5.7 department, second member and an edited security policy complete their steps', done(c, 'organization') && done(c, 'invite_people') && done(c, 'security_policy'), JSON.stringify(c));
      const { AppAssignment: Asg, App: AppM } = await import('../models');
      const anyApp = await AppM.findOne({ app_type: 'karbexa_product' });
      await Asg.create({ company_id: t.cid, app_id: anyApp!._id, target_type: 'user', target_id: (await User.findOne({ email: 'second@check57.test' }))!._id, granted_by: t.admin._id, is_active: true } as never);
      check('5.7 an assignment made by the admin completes the apps step', done(await get(), 'assign_apps') === true);
      const other = await tenantCtx('check57b');
      const oc = ((await (await other.call('/overview/setup-progress')).json()) as any).data.checklist as Array<{ key: string; done: boolean }>;
      check('5.7 another tenant is unaffected: its organization and invite steps stay open', done(oc, 'organization') === false && done(oc, 'invite_people') === false, JSON.stringify(oc));
    }

    // ── Plan 7.3: tenant isolation for each new company_id collection (Invitation, EmailDelivery, SeatUsage, TenantNote, TenantDailyStat, AttentionItem) ──
    {
      const { Invitation: InvIso, SeatUsage: SeatIso, TenantNote: NoteIso, TenantDailyStat: StatIso, AttentionItem: AttIso, EmailDelivery: DelIso } = await import('../models');
      const json = async (r: Response) => (await r.json()) as any;
      const A = await tenantCtx('iso73a');
      const B = await tenantCtx('iso73b');
      await B.call('/people/invite', 'POST', { full_name: 'Iso Member', email: 'iso.member@iso73b.test' });
      const bm = await User.findOne({ company_id: B.cid, email: 'iso.member@iso73b.test' });
      const bInv = bm ? await InvIso.findOne({ company_id: B.cid, user_id: bm._id }) : null;
      check('7.3 setup: tenant B has a pending invitation and a delivery row', !!bInv && bInv.state === 'pending' && (await DelIso.countDocuments({ company_id: B.cid })) > 0);
      const invCountB = await InvIso.countDocuments({ company_id: B.cid });
      const delCountB = await DelIso.countDocuments({ company_id: B.cid });

      // Invitation + EmailDelivery: tenant A addresses B's member by id.
      check('7.3 Invitation: A cannot read the invitation panel of B\'s member = 404', (await A.call(`/people/${bm?._id}/invitation`)).status === 404);
      check('7.3 Invitation: A cannot revoke B\'s invitation = 404 and it stays pending', (await A.call(`/people/${bm?._id}/invitation/revoke`, 'POST')).status === 404 && (await InvIso.findById(bInv?._id))?.state === 'pending');
      check('7.3 Invitation: A cannot resend B\'s invitation = 404; no row or delivery is added to B', (await A.call(`/people/${bm?._id}/resend-invite`, 'POST')).status === 404 && (await InvIso.countDocuments({ company_id: B.cid })) === invCountB && (await DelIso.countDocuments({ company_id: B.cid })) === delCountB);
      check('7.3 Invitation: nothing was written to A by those calls', (await InvIso.countDocuments({ company_id: A.cid, user_id: bm?._id })) === 0);

      // SeatUsage: each tenant sees only its own count.
      await SeatIso.updateOne({ company_id: A.cid, product_key: 'people' }, { $set: { used: 2, computed_at: new Date() } }, { upsert: true });
      await SeatIso.updateOne({ company_id: B.cid, product_key: 'people' }, { $set: { used: 7, computed_at: new Date() } }, { upsert: true });
      const seatsOf = async (t: typeof A) => ((await (await t.call('/organization/subscription')).json()) as any).data.products.find((p: any) => p.product_key === 'people').seats_used;
      // A fire-and-forget recompute (lib/seats.ts) can still be running after provisioning and overwrite the stored count, so wait for the counts to settle.
      let sa = -1, sb = -1;
      for (let n = 0; n < 10 && !(sa === 2 && sb === 7); n++) {
        await SeatIso.updateOne({ company_id: A.cid, product_key: 'people' }, { $set: { used: 2, computed_at: new Date() } });
        await SeatIso.updateOne({ company_id: B.cid, product_key: 'people' }, { $set: { used: 7, computed_at: new Date() } });
        [sa, sb] = [await seatsOf(A), await seatsOf(B)];
      }
      check('7.3 SeatUsage: each subscription shows only its own seats_used (2 and 7)', sa === 2 && sb === 7, `A=${sa} B=${sb}`);

      // Operator side: notes, products and seats are per organisation.
      const nA = await op(`/orgs/${A.cid}/notes`, 'POST', { body: 'note for A' });
      const nAj = await json(nA);
      const listB = (await json(await op(`/orgs/${B.cid}/notes`))).data as any[];
      check('7.3 TenantNote: a note on A is not in the list for B', nA.status === 201 && !listB.some((n) => n.id === nAj.data.id));
      check('7.3 TenantNote: deleting A\'s note through B = 404 and the note stays', (await op(`/orgs/${B.cid}/notes/${nAj.data.id}`, 'DELETE')).status === 404 && !!(await NoteIso.findById(nAj.data.id)));
      const prodB = ((await json(await op(`/orgs/${B.cid}/products`))).data as any[]).find((p) => p.product_key === 'people');
      check('7.3 SeatUsage: operator products view of B shows B\'s seats (7), not A\'s', JSON.stringify(prodB).includes('7') && !JSON.stringify(prodB).includes('"used":2'), JSON.stringify(prodB));

      // TenantDailyStat and AttentionItem have no tenant-facing reader: a tenant token must not reach the operator API.
      await StatIso.updateOne({ company_id: B.cid, day: new Date(Date.UTC(2026, 0, 1)) }, { $set: { admins_without_mfa: 1 } }, { upsert: true });
      await AttIso.updateOne({ kind: 'admins_without_mfa', company_id: B.cid, open: true }, { $set: { severity: 'warning', summary: 'iso', first_seen_at: new Date(), last_seen_at: new Date() } }, { upsert: true });
      const tenantToOp = await op('/overview', 'GET', undefined, 'not-an-operator-token');
      check('7.3 TenantDailyStat/AttentionItem: no tenant-facing route; a non-operator token gets 401 from /operator/v1', tenantToOp.status === 401, tenantToOp.status);
      check('7.3 TenantDailyStat/AttentionItem: rows are keyed by company_id (A has none of B\'s)', (await StatIso.countDocuments({ company_id: A.cid, admins_without_mfa: { $gt: 0 } })) === 0 && (await AttIso.countDocuments({ company_id: A.cid, open: true })) === 0);
    }

    // ── Phase 7.4 follow-up: GET /people is paged (default 50, cursor, first-page total and counts) ──
    {
      const json = async (r: Response) => (await r.json()) as any;
      const A = await tenantCtx('page74a');
      const B = await tenantCtx('page74b');
      const base = Date.now() - 3_600_000;
      const mk = (cid: any, i: number, tag: string) => ({
        company_id: cid, full_name: `Pg74 ${tag} ${i}`, email: `pg74.${tag}.${i}@page74.test`, password_hash: 'x', employee_id: `PG74-${tag}-${i}`, role: 'Employee',
        lifecycle_state: i % 2 ? 'invited' : 'active', is_active: i % 2 === 0, created_at: new Date(base + Math.floor(i / 3) * 1000), // three members share each timestamp: the id breaks the tie
      });
      await User.collection.insertMany([...Array.from({ length: 120 }, (_, i) => mk(A.cid, i, 'a')), ...Array.from({ length: 3 }, (_, i) => mk(B.cid, i, 'b'))].map((u) => ({ ...u, _id: new mongoose.Types.ObjectId(), company_id: new mongoose.Types.ObjectId(String(u.company_id)), updated_at: new Date() })));
      const walk = async (t: typeof A, query: string, limit: number) => {
        const ids: string[] = [];
        let cursor = '';
        let pages = 0;
        do {
          const r = await json(await t.call(`/people?limit=${limit}${query}${cursor ? `&cursor=${cursor}` : ''}`));
          ids.push(...r.data.map((u: any) => String(u._id)));
          cursor = r.meta?.next_cursor ?? '';
          pages += 1;
        } while (cursor && pages < 50);
        return ids;
      };

      const d = await json(await A.call('/people'));
      check('7.4 GET /people with no params returns the first 50 and a next cursor', d.data.length === 50 && typeof d.meta?.next_cursor === 'string' && d.meta.limit === 50, `${d.data.length} ${JSON.stringify(d.meta)?.slice(0, 120)}`);
      check('7.4 first page reports total (121) and counts_by_state for the whole company', d.meta?.total === 121 && d.meta?.counts_by_state?.active === 61 && d.meta?.counts_by_state?.invited === 60, JSON.stringify(d.meta));
      const all = await json(await A.call('/people?limit=200'));
      check('7.4 limit=200 returns every member (121) and no next cursor', all.data.length === 121 && all.meta?.next_cursor === null, `${all.data.length} ${all.meta?.next_cursor}`);
      check('7.4 limit above 200 is capped at 200', (await json(await A.call('/people?limit=1000'))).meta?.limit === 200);
      const bad = await Promise.all(['abc', '0', '-5', '2.5'].map(async (l) => (await json(await A.call(`/people?limit=${l}`))).meta?.limit));
      check('7.4 a missing, zero, negative, fractional or non-numeric limit falls back to 50', bad.every((l) => l === 50), bad);

      const ids = await walk(A, '', 25);
      const expected = (await User.find({ company_id: A.cid }).sort({ created_at: -1, _id: -1 }).select('_id').lean()).map((u) => String(u._id));
      check('7.4 walking the cursor at limit 25 gives every member once, in created_at then _id order (ties included)', ids.length === 121 && new Set(ids).size === 121 && ids.join() === expected.join(), `${ids.length}/${new Set(ids).size}`);
      const p2 = await json(await A.call(`/people?limit=25&cursor=${d.meta.next_cursor}`));
      check('7.4 later pages omit total and counts (only the first page computes them)', p2.meta && !('total' in p2.meta) && !('counts_by_state' in p2.meta), JSON.stringify(p2.meta));
      const badCursor = await A.call('/people?cursor=not-a-cursor');
      check('7.4 an invalid cursor = 400', badCursor.status === 400, badCursor.status);

      const inv = await json(await A.call('/people?lifecycle_state=invited&limit=25'));
      check('7.4 a filter keeps working with paging: invited total is 60 and every row is invited', inv.meta?.total === 60 && inv.data.every((u: any) => u.lifecycle_state === 'invited'), inv.meta?.total);
      check('7.4 filter + cursor walk returns all 60 invited once', (await walk(A, '&lifecycle_state=invited', 25)).length === 60);
      const srch = await json(await A.call('/people?search=Pg74&limit=40'));
      check('7.4 search works with paging: 120 matches, 40 returned', srch.meta?.total === 120 && srch.data.length === 40 && !!srch.meta?.next_cursor, srch.meta?.total);

      const bAll = await walk(B, '', 50);
      const aSet = new Set(ids);
      check('7.4 tenant isolation: B sees only its own 4 members and none of A\'s', bAll.length === 4 && !bAll.some((i) => aSet.has(i)), bAll.length);
      check('7.4 B\'s counts do not include A\'s members', (await json(await B.call('/people?limit=1'))).meta?.total === 4);
    }

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
