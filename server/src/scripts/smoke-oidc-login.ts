// server/src/scripts/smoke-oidc-login.ts
// End-to-end smoke test of the embedded identity service + Admin API auth (Sprint 1, E1/E2).
// In-memory MongoDB, the full app in-process on a random port, a cookie-jar fetch client.
//   npm run smoke:login
import http from 'http';
import crypto from 'crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import * as jose from 'jose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { generateSecret, generate as generateTotp } from 'otplib';

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: unknown, detail: unknown = '') => {
  results.push({ name, ok: !!ok, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
};

// ── tiny cookie jar (ignores Path/Domain; one host) ─────────────────────────────────────────
const jar = new Map<string, string>();
async function jarFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
  const res = await fetch(url, { ...init, headers, redirect: 'manual' });
  for (const c of res.headers.getSetCookie()) {
    const [kv, ...attrs] = c.split(';');
    const i = kv.indexOf('=');
    const name = kv.slice(0, i).trim();
    const value = kv.slice(i + 1).trim();
    const expired = attrs.some((a) => {
      const [k, v] = a.trim().split('=');
      return (k.toLowerCase() === 'max-age' && Number(v) <= 0) || (k.toLowerCase() === 'expires' && new Date(v).getTime() < Date.now());
    });
    if (!value || expired) jar.delete(name);
    else jar.set(name, value);
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
  const port = (server.address() as { port: number }).port;
  const ORIGIN = `http://127.0.0.1:${port}`;

  // Env BEFORE identity config loads (Node fetch cannot resolve *.localhost subdomains on Windows).
  const tenantKey = await jose.exportJWK((await jose.generateKeyPair('RS256', { extractable: true })).privateKey);
  const servicesKey = await jose.exportJWK((await jose.generateKeyPair('RS256', { extractable: true })).privateKey);
  const backend = await jose.generateKeyPair('RS256', { extractable: true });
  const backendPublic = { ...(await jose.exportJWK(backend.publicKey)), kid: 'smoke-backend-1', alg: 'RS256', use: 'sig' };
  Object.assign(process.env, {
    NODE_ENV: 'development',
    MONGODB_URI: mongo.getUri(),
    DB_NAME: 'smoke_oidc',
    ID_ISSUER_ORIGIN: ORIGIN,
    ADMIN_SPA_ORIGIN: ORIGIN,
    PRODUCTS_SPA_ORIGIN: ORIGIN,
    CLIENT_URL: ORIGIN,
    TRUST_PROXY: '0',
    AUTH_RATE_LIMIT: '10000',
    GLOBAL_RATE_LIMIT: '10000',
    ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    OIDC_COOKIE_KEYS: crypto.randomBytes(32).toString('base64url'),
    IDENTITY_TENANT_KEY: JSON.stringify({ ...tenantKey, kid: 'tenant-smoke' }),
    IDENTITY_SERVICES_KEY: JSON.stringify({ ...servicesKey, kid: 'services-smoke' }),
    SERVICES_PRODUCTS_BACKEND_JWKS: JSON.stringify({ keys: [backendPublic] }),
  });
  delete process.env.ENTRA_CLIENT_ID;

  // Load app modules only now (static imports would be fine too; config is read lazily).
  const { connectDB } = await import('../config/db');
  await connectDB();
  const { createServer } = await import('../app');
  const app = await createServer();
  server.on('request', app);

  const { Company, Role, User, UserRole, Identity, Session } = await import('../models');
  const { encrypt } = await import('../lib/cryptoService');

  // ── seed ──────────────────────────────────────────────────────────────────────────────────
  const EMAIL = 'smoke.admin@smoke.test';
  const PASSWORD = 'Smoke-Passw0rd!x';
  const totpSecret = generateSecret();
  const company = await Company.create({ name: 'Smoke Co', slug: `smoke-${Date.now()}` });
  const role = await Role.create({ company_id: company._id, name: 'IT Admin', type: 'system' });
  const identity = await Identity.create({
    email: EMAIL,
    full_name: 'Smoke Admin',
    password_hash: await bcrypt.hash(PASSWORD, 12),
    password_changed_at: new Date(),
    email_verified_at: new Date(),
    mfa: { totp_secret_enc: encrypt(totpSecret), totp_enabled: true, recovery_codes_hash: [], email_otp_enabled: false },
    status: 'active',
  });
  const user = await User.create({
    company_id: company._id,
    identity_id: identity._id,
    full_name: 'Smoke Admin',
    email: EMAIL,
    password_hash: 'legacy-unused',
    role: 'IT Admin',
    lifecycle_state: 'active',
    is_active: true,
  });
  await UserRole.create({ user_id: user._id, role_id: role._id, company_id: company._id, assigned_by: user._id });

  const TENANT = `${ORIGIN}/realms/tenant`;
  const REDIRECT = `${ORIGIN}/auth/callback`;
  const CLIENT = 'karbexa-admin-spa';
  const RESOURCE = 'urn:karbexa:admin';

  try {
    // ── discovery ─────────────────────────────────────────────────────────────────────────
    const disc = await (await fetch(`${TENANT}/.well-known/openid-configuration`)).json() as Record<string, string>;
    check('discovery issuer = tenant realm', disc.issuer === TENANT, disc.issuer);

    // ── authorize (PKCE, resource) → interaction ─────────────────────────────────────────
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    let res = await jarFetch(`${TENANT}/oauth/authorize?${new URLSearchParams({
      client_id: CLIENT, response_type: 'code', redirect_uri: REDIRECT, scope: 'openid profile email',
      code_challenge: challenge, code_challenge_method: 'S256', state: 'st-1', nonce: 'n-1', resource: RESOURCE,
    })}`);
    const interactionLoc = res.headers.get('location') || '';
    const uid = /\/interaction\/([^/?#]+)/.exec(interactionLoc)?.[1];
    check('authorize redirects to hosted interaction', res.status === 303 && uid, `${res.status} ${interactionLoc}`);
    const IX = `${TENANT}/interaction/${uid}`;

    res = await jarFetch(IX);
    const loginHtml = await res.text();
    const csp = res.headers.get('content-security-policy') || '';
    check('login page renders with nonce CSP', res.status === 200 && /name="password"/.test(loginHtml) && /script-src 'nonce-/.test(csp), `${res.status} csp=${csp.slice(0, 60)}`);
    check('Microsoft button hidden when ENTRA_CLIENT_ID unset', !/Sign in with Microsoft/.test(loginHtml));

    // ── negative: wrong password and unknown email give the identical response ───────────
    const wrong = await jarFetch(`${IX}/login`, form({ email: EMAIL, password: 'wrong-password' }));
    const wrongHtml = await wrong.text();
    const unknown = await jarFetch(`${IX}/login`, form({ email: 'nobody@smoke.test', password: 'wrong-password' }));
    const unknownHtml = await unknown.text();
    const errOf = (h: string) => /<p class="err"[^>]*>([^<]*)</.exec(h)?.[1];
    check('unknown email response identical to wrong password', wrong.status === unknown.status && errOf(wrongHtml) && errOf(wrongHtml) === errOf(unknownHtml), `${wrong.status}/${unknown.status} "${errOf(wrongHtml)}" vs "${errOf(unknownHtml)}"`);

    // ── password → TOTP ───────────────────────────────────────────────────────────────────
    res = await jarFetch(`${IX}/login`, form({ email: EMAIL, password: PASSWORD }));
    check('password step accepted (303 back to interaction)', res.status === 303 && (res.headers.get('location') || '').endsWith(`/interaction/${uid}`), `${res.status} ${res.headers.get('location')}`);
    res = await jarFetch(IX);
    const totpHtml = await res.text();
    check('TOTP step rendered', res.status === 200 && /action="[^"]*\/totp"/.test(totpHtml), res.status);

    const badTotp = await jarFetch(`${IX}/totp`, form({ code: '000000' }));
    check('invalid TOTP rejected', badTotp.status === 200 && /not valid/.test(await badTotp.text()), badTotp.status);

    res = await jarFetch(`${IX}/totp`, form({ code: await generateTotp({ secret: totpSecret }) }));
    check('TOTP accepted → resume', res.status === 303, `${res.status} ${res.headers.get('location')}`);

    // ── follow resume → redirect_uri?code= ────────────────────────────────────────────────
    let code: string | null = null;
    for (let hops = 0; hops < 10 && res.status >= 300 && res.status < 400; hops++) {
      const loc = new URL(res.headers.get('location')!, ORIGIN);
      if (loc.pathname === '/auth/callback') {
        code = loc.searchParams.get('code');
        check('callback state preserved', loc.searchParams.get('state') === 'st-1', loc.search);
        if (!code) console.log('AUTHZ ERROR', loc.search);
        break;
      }
      res = await jarFetch(loc.toString());
    }
    check('authorization code issued', code, `last status ${res.status}`);

    // ── token exchange ────────────────────────────────────────────────────────────────────
    const tokenRes = await fetch(`${TENANT}/oauth/token`, form({
      grant_type: 'authorization_code', code: code || '', redirect_uri: REDIRECT, client_id: CLIENT, code_verifier: verifier, resource: RESOURCE,
    }));
    const tokens = await tokenRes.json() as Record<string, string>;
    check('code exchange returns access + refresh + id token', tokenRes.status === 200 && tokens.access_token && tokens.refresh_token && tokens.id_token, `${tokenRes.status} ${JSON.stringify(tokens).slice(0, 160)}`);

    const jwks = jose.createRemoteJWKSet(new URL(`${TENANT}/oauth/jwks`));
    let sid = '';
    try {
      const { payload: p, protectedHeader: h } = await jose.jwtVerify(tokens.access_token, jwks, { issuer: TENANT, audience: RESOURCE, algorithms: ['RS256'] });
      sid = String(p.sid || '');
      check('AT header typ at+jwt, kid tenant-*', h.typ === 'at+jwt' && String(h.kid).startsWith('tenant-'), h);
      check('AT aud single urn:karbexa:admin', p.aud === RESOURCE || (Array.isArray(p.aud) && p.aud.length === 1 && p.aud[0] === RESOURCE), p.aud);
      check('AT sub = User._id', p.sub === user._id.toString(), p.sub);
      check('AT idn = Identity._id', p.idn === identity._id.toString(), p.idn);
      check('AT org = company_id', p.org === company._id.toString(), p.org);
      check('AT token_use = access', p.token_use === 'access', p.token_use);
      check('AT org_roles / apps / authz_ver / amr / email', Array.isArray(p.org_roles) && (p.org_roles as string[]).includes('IT Admin') && Array.isArray(p.apps) && p.authz_ver === 1
        && JSON.stringify(p.amr) === JSON.stringify(['pwd', 'otp']) && p.email === EMAIL, { org_roles: p.org_roles, amr: p.amr, authz_ver: p.authz_ver });
      check('AT TTL 600 s', (p.exp as number) - (p.iat as number) === 600, (p.exp as number) - (p.iat as number));
      const sess = await Session.findById(sid);
      check('Session row upserted (_id = sid)', sess && !sess.revoked_at && sess.member_id.toString() === user._id.toString() && sess.amr.join() === 'pwd,otp', sess?.toObject());
    } catch (e) {
      check('AT verifies against tenant JWKS', false, (e as Error).message);
    }

    // ── Admin API ─────────────────────────────────────────────────────────────────────────
    const me = (at: string) => fetch(`${ORIGIN}/api/v1/auth/me`, { headers: { authorization: `Bearer ${at}` } });
    res = await me(tokens.access_token);
    const meBody = await res.json() as { data?: { user?: { _id?: string } } };
    check('GET /api/v1/auth/me with Bearer = 200', res.status === 200 && meBody.data?.user?._id === user._id.toString(), res.status);
    {
      // L3-9: allow-list projection, never the raw user document
      const u = (meBody.data?.user ?? {}) as Record<string, unknown>;
      check('GET /auth/me returns exactly _id, company_id, role, email, full_name, company_name', Object.keys(u).sort().join() === '_id,company_id,company_name,email,full_name,role', Object.keys(u));
      check('GET /auth/me carries no secrets (password hash/history, MFA counters, risk score, tokens)', !Object.keys(u).some((k) => /pass|hash|mfa|risk|token|secret|otp|locked|refresh/i.test(k)), Object.keys(u));
      check('GET /auth/me company_name is the member\'s company name and company_id matches', u.company_name === 'Smoke Co' && String(u.company_id) === company._id.toString(), { company_name: u.company_name, company_id: u.company_id });
    }
    res = await fetch(`${ORIGIN}/api/v1/auth/me`);
    check('GET /auth/me without token = 401 NO_TOKEN', res.status === 401 && (await res.json() as { code: string }).code === 'NO_TOKEN', res.status);

    // ── refresh rotation ──────────────────────────────────────────────────────────────────
    const refresh = (rt: string) => fetch(`${TENANT}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: rt, client_id: CLIENT, resource: RESOURCE }));
    res = await refresh(tokens.refresh_token);
    const r1 = await res.json() as Record<string, string>;
    check('refresh rotates the refresh token', res.status === 200 && r1.refresh_token && r1.refresh_token !== tokens.refresh_token, `${res.status} ${JSON.stringify(r1).slice(0, 120)}`);
    if (r1.access_token) {
      const { payload } = await jose.jwtVerify(r1.access_token, jwks, { issuer: TENANT, audience: RESOURCE });
      check('refreshed AT keeps sid + amr', payload.sid === sid && JSON.stringify(payload.amr) === JSON.stringify(['pwd', 'otp']), { sid: payload.sid, amr: payload.amr });
      res = await me(r1.access_token);
      check('refreshed AT accepted by Admin API', res.status === 200, res.status);
    }
    const latestAt = r1.access_token || tokens.access_token;
    const latestRt = r1.refresh_token || tokens.refresh_token;

    // ── services realm token rejected by requireAuth ─────────────────────────────────────
    const SERVICES = `${ORIGIN}/realms/services`;
    const assertion = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'smoke-backend-1' })
      .setIssuer('karbexa-products-backend').setSubject('karbexa-products-backend')
      .setAudience(SERVICES).setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('2m')
      .sign(backend.privateKey);
    res = await fetch(`${SERVICES}/oauth/token`, form({
      grant_type: 'client_credentials', client_id: 'karbexa-products-backend',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion,
      scope: 'platform.members.read', resource: 'urn:karbexa:platform-api',
    }));
    const svc = await res.json() as Record<string, string>;
    check('services realm issues client_credentials token', res.status === 200 && svc.access_token, `${res.status} ${JSON.stringify(svc).slice(0, 120)}`);
    if (svc.access_token) {
      res = await me(svc.access_token);
      check('services-realm token rejected by requireAuth (401 INVALID_TOKEN)', res.status === 401 && (await res.json() as { code: string }).code === 'INVALID_TOKEN', res.status);
    }

    // ── logout ────────────────────────────────────────────────────────────────────────────
    res = await fetch(`${ORIGIN}/api/v1/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${latestAt}` } });
    const lo = await res.json() as { data?: { end_session_url?: string } };
    const endUrl = lo.data?.end_session_url || '';
    check('POST /auth/logout = 200 with end_session_url', res.status === 200 && endUrl.startsWith(`${TENANT}/oauth/end_session?client_id=${CLIENT}&post_logout_redirect_uri=`), `${res.status} ${endUrl}`);
    check('L3-9 end_session_url redirects back to /login?signed_out=1', new URL(endUrl).searchParams.get('post_logout_redirect_uri') === `${ORIGIN}/login?signed_out=1`, endUrl);
    const revoked = await Session.findById(sid);
    check('Session revoked (user_logout)', revoked?.revoked_at && revoked.revoked_reason === 'user_logout', revoked?.revoked_reason);

    res = await me(latestAt);
    const meAfter = await res.json() as { code?: string };
    check('GET /auth/me after logout = 401 SESSION_REVOKED', res.status === 401 && meAfter.code === 'SESSION_REVOKED', `${res.status} ${meAfter.code}`);

    res = await refresh(latestRt);
    check('refresh with latest refresh token fails after logout', res.status === 400, `${res.status} ${(await res.text()).slice(0, 100)}`);

    if (endUrl) {
      res = await jarFetch(endUrl);
      check('end_session URL accepted by provider', res.status === 200, res.status);
    }

    // ── first login without TOTP → enrolment ──────────────────────────────────────────────
    jar.clear();
    const EMAIL2 = 'smoke.new@smoke.test';
    const identity2 = await Identity.create({ email: EMAIL2, full_name: 'Smoke New', password_hash: await bcrypt.hash(PASSWORD, 12), password_changed_at: new Date(), status: 'active' });
    await User.create({ company_id: company._id, identity_id: identity2._id, full_name: 'Smoke New', email: EMAIL2, password_hash: 'legacy-unused', lifecycle_state: 'onboarding', is_active: true });
    res = await jarFetch(`${TENANT}/oauth/authorize?${new URLSearchParams({
      client_id: CLIENT, response_type: 'code', redirect_uri: REDIRECT, scope: 'openid profile email',
      code_challenge: challenge, code_challenge_method: 'S256', state: 'st-2', resource: RESOURCE,
    })}`);
    const uid2 = /\/interaction\/([^/?#]+)/.exec(res.headers.get('location') || '')?.[1];
    const IX2 = `${TENANT}/interaction/${uid2}`;
    await jarFetch(IX2);
    await jarFetch(`${IX2}/login`, form({ email: EMAIL2, password: PASSWORD }));
    res = await jarFetch(IX2);
    const enrolHtml = await res.text();
    const enrolSecret = /<label>Setup key<\/label><code>([A-Z2-7]+)<\/code>/.exec(enrolHtml)?.[1];
    check('first login shows TOTP enrolment (secret + otpauth URI)', enrolSecret && /otpauth:\/\/totp\//.test(enrolHtml), res.status);
    res = await jarFetch(`${IX2}/enrol`, form({ code: await generateTotp({ secret: enrolSecret || 'AAAA' }) }));
    let code2: string | null = null;
    for (let hops = 0; hops < 10 && res.status >= 300 && res.status < 400; hops++) {
      const loc = new URL(res.headers.get('location')!, ORIGIN);
      if (loc.pathname === '/auth/callback') { code2 = loc.searchParams.get('code'); break; }
      res = await jarFetch(loc.toString());
    }
    const enrolled = await Identity.findById(identity2._id);
    check('enrolment confirmed → code issued, TOTP saved encrypted', code2 && enrolled?.mfa.totp_enabled && enrolled.mfa.totp_secret_enc && enrolled.mfa.totp_secret_enc !== enrolSecret, { code2: !!code2, enabled: enrolled?.mfa.totp_enabled });

    // ── RP-initiated logout with a live provider session revokes our Session ─────────────
    const t2 = await (await fetch(`${TENANT}/oauth/token`, form({
      grant_type: 'authorization_code', code: code2 || '', redirect_uri: REDIRECT, client_id: CLIENT, code_verifier: verifier, resource: RESOURCE,
    }))).json() as Record<string, string>;
    const sid2 = t2.access_token ? String(jose.decodeJwt(t2.access_token).sid) : '';
    res = await jarFetch(`${TENANT}/oauth/end_session?client_id=${CLIENT}&post_logout_redirect_uri=${encodeURIComponent(`${ORIGIN}/login?signed_out=1`)}`);
    const logoutHtml = await res.text();
    const action = /<form id="op.logoutForm" method="post" action="([^"]+)"/.exec(logoutHtml)?.[1];
    const xsrf = /name="xsrf" value="([^"]+)"/.exec(logoutHtml)?.[1];
    check('end_session renders auto-submitting logout form', res.status === 200 && action && xsrf && /name="logout" value="yes"/.test(logoutHtml) && /<script nonce=/.test(logoutHtml), res.status);
    res = await jarFetch(new URL(action || '/', ORIGIN).toString(), form({ xsrf: xsrf || '', logout: 'yes' }));
    check('logout confirm redirects to the registered post_logout_redirect_uri (/login?signed_out=1)', res.status === 303 && (res.headers.get('location') || '').startsWith(`${ORIGIN}/login?signed_out=1`), `${res.status} ${res.headers.get('location')}`);
    await new Promise((r) => setTimeout(r, 200)); // revoke runs from the end_session.success event
    const s2 = await Session.findById(sid2);
    check('end_session revokes the Session (reason end_session)', sid2 && s2?.revoked_at && s2.revoked_reason === 'end_session', s2?.revoked_reason);
    res = await jarFetch(`${TENANT}/oauth/end_session?client_id=${CLIENT}&post_logout_redirect_uri=${encodeURIComponent(`${ORIGIN}/login`)}`);
    check('L3-9 the plain /login post_logout_redirect_uri stays registered (no error page)', res.status === 200 || (res.status === 303 && (res.headers.get('location') || '').startsWith(`${ORIGIN}/login`)), `${res.status} ${res.headers.get('location')}`);
    res = await me(t2.access_token || '');
    check('AT from logged-out session rejected (SESSION_REVOKED)', res.status === 401 && (await res.json() as { code?: string }).code === 'SESSION_REVOKED', res.status);
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongo.stop();
  }

  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  (got ${r.detail})`}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`\nSMOKE OIDC LOGIN: ${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('SMOKE CRASH', e);
  process.exit(2);
});
