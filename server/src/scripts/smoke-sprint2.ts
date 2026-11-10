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
import { MongoMemoryServer } from 'mongodb-memory-server';
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
  const mongo = await MongoMemoryServer.create();
  const server = http.createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const ORIGIN = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const gen = async () => jose.exportJWK((await jose.generateKeyPair('RS256', { extractable: true })).privateKey);
  const backend = await jose.generateKeyPair('RS256', { extractable: true });
  const backendPublic = { ...(await jose.exportJWK(backend.publicKey)), kid: 'smoke-backend-1', alg: 'RS256', use: 'sig' };
  Object.assign(process.env, {
    NODE_ENV: 'development', MONGODB_URI: mongo.getUri(), DB_NAME: 'smoke_s2',
    ID_ISSUER_ORIGIN: ORIGIN, ADMIN_SPA_ORIGIN: ORIGIN, OPERATOR_SPA_ORIGIN: ORIGIN, PRODUCTS_SPA_ORIGIN: ORIGIN, CLIENT_URL: ORIGIN,
    TRUST_PROXY: '0', AUTH_RATE_LIMIT: '10000', GLOBAL_RATE_LIMIT: '10000',
    ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    OIDC_COOKIE_KEYS: crypto.randomBytes(32).toString('base64url'),
    IDENTITY_TENANT_KEY: JSON.stringify({ ...(await gen()), kid: 'tenant-smoke' }),
    IDENTITY_SERVICES_KEY: JSON.stringify({ ...(await gen()), kid: 'services-smoke' }),
    IDENTITY_OPERATOR_KEY: JSON.stringify({ ...(await gen()), kid: 'operator-smoke' }),
    SERVICES_PRODUCTS_BACKEND_JWKS: JSON.stringify({ keys: [backendPublic] }),
  });
  delete process.env.ENTRA_CLIENT_ID;

  const { connectDB } = await import('../config/db');
  await connectDB();
  const { createServer } = await import('../app');
  const app = await createServer();
  server.on('request', app);
  const { OperatorAccount, Company, User, Plan, App, AppAssignment, ProductRole, OrganizationEntitlement, OperatorAuditEvent, Group } = await import('../models');
  const { seedProductRegistry } = await import('../lib/productCatalog');
  const { computeEffectiveAccess } = await import('../lib/effectiveAccess');

  try {
    // ── E3: product registry ─────────────────────────────────────────────────────────────
    await seedProductRegistry();
    await seedProductRegistry(); // idempotent
    const apps = await App.find({ app_type: 'karbexa_product' });
    check('E3 registry seeds people/projects/sign/desk', apps.map((a) => a.product_key).sort().join() === 'desk,people,projects,sign', apps.map((a) => a.product_key));
    const deskRoles = await ProductRole.find({ product_key: 'desk' });
    check('E3 desk catalog (4 roles, default requester)', deskRoles.length === 4 && deskRoles.find((r) => r.is_default)?.key === 'requester', deskRoles.map((r) => r.key));
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

    // ── E3: effective access ──────────────────────────────────────────────────────────────
    const people = await App.findOne({ product_key: 'people', app_type: 'karbexa_product' });
    const projects = await App.findOne({ product_key: 'projects', app_type: 'karbexa_product' });
    const desk = await App.findOne({ product_key: 'desk', app_type: 'karbexa_product' });
    const me = admin!;
    await User.updateOne({ _id: me._id }, { lifecycle_state: 'active', is_active: true });
    const grp = await Group.create({ company_id: orgId, name: 'All Members', type: 'dynamic', dynamic_rules: {}, is_active: true } as never);
    const mk = (app: typeof people, role: string, target: object) => AppAssignment.create({
      company_id: orgId, app_id: app!._id, granted_by: me._id, is_active: true, product_role_key: role, ...target,
    } as never);
    await mk(people, 'employee', { target_type: 'group', target_id: grp._id });
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
    res = await op(`/orgs/${orgId}/entitlements/projects`, 'PUT', { status: 'suspended' });
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
