// server/src/identity/interactions.ts
// Hosted login for the tenant realm (03 §4.1, §4.2; contract "Hosted login"). Express routes that
// run BEFORE the provider mount. CSRF posture: the interaction cookie is SameSite=Lax and path-scoped
// to /realms/tenant/interaction/<uid>; every form posts back to that same uid and the uid in the URL
// must match the cookie's interaction. Body parsing is route-local (never global before the provider).
import express, { Express, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as jose from 'jose';
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';
import QRCode from 'qrcode';
import { Identity, IIdentity } from '../models/Identity.model';
import { User, IUser } from '../models/User.model';
import { IdentityProviderConnection } from '../models/IdentityProviderConnection.model';
import { encrypt, decrypt } from '../lib/cryptoService';
import { authLimiter } from '../middleware/rateLimiter';
import {
  logSecurityEvent, recordUnknownEmailFailure, evaluateLoginIpPolicy, isLocked, recordPasswordFailure,
  recordLockedAttempt, checkPasswordExpired, recordLoginSuccess,
} from '../controllers/auth.controller';
import { getIdentityConfig, ADMIN_AUDIENCE, ADMIN_SPA_CLIENT_ID, PRODUCTS_AUDIENCE, PRODUCTS_SPA_CLIENT_ID } from './config';
import { loadAccessContext, pickMembership } from './accounts';
import { resolveFederatedIdentity } from './federationLink';
import { deniedPage, escapeHtml, newNonce, pageCsp, pageShell, shellForClient } from './html';
import { evaluateGate, keyFromClientId, resourceForStandaloneClient, STANDALONE_SCOPE } from '../lib/standalonePortals';
import { consumeRecoveryCode } from './recoveryCodes';
import type { OidcProvider } from './providers';

const BASE = '/realms/tenant';
const ENTRA_AUTHORITY = 'https://login.microsoftonline.com/organizations/oauth2/v2.0';
const ENTRA_JWKS_URL = 'https://login.microsoftonline.com/common/discovery/v2.0/keys';
const ENTRA_COOKIE = 'tenant_entra';
const MAX_OTP_ATTEMPTS = 5;
const GENERIC_LOGIN_ERROR = 'Incorrect email or password.';
// Equalises timing for unknown emails (bcrypt of a random value, cost 12).
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

/** Per-interaction progress, persisted on the oidc-provider Interaction (`result.karbexa`). */
interface Pending {
  stage: 'totp' | 'enrol';
  member_id: string;
  identity_id: string;
  amr_first: string[]; // ['pwd'] or ['fed']
  attempts: number;
  enrol_secret_enc?: string;
}

interface EntraPending { uid: string; state: string; nonce: string; verifier: string; exp: number }

let entraJwks: ReturnType<typeof jose.createRemoteJWKSet> | undefined;

const RESOURCE_FOR_CLIENT: Record<string, string> = { [ADMIN_SPA_CLIENT_ID]: ADMIN_AUDIENCE, [PRODUCTS_SPA_CLIENT_ID]: PRODUCTS_AUDIENCE };

export function send(res: Response, title: string, body: string, status = 200) {
  const nonce = newNonce();
  res.status(status);
  res.setHeader('Content-Security-Policy', pageCsp(nonce));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Skin is set by details() from the interaction's OIDC client (shellForClient); unset = follow the browser.
  res.type('html').send(pageShell(nonce, title, body, res.locals.karbexaShell));
}

export const errBox = (msg?: string) => (msg ? `<p class="err" role="alert">${escapeHtml(msg)}</p>` : '');

function renderLogin(res: Response, uid: string, opts: { error?: string; email?: string; status?: number } = {}) {
  const cfg = getIdentityConfig();
  const entra = cfg.entra.clientId && cfg.entra.clientSecret
    ? `<p class="or">or</p><a class="btn alt" href="${BASE}/interaction/${uid}/entra">Sign in with Microsoft</a>`
    : '';
  send(res, 'Sign in', `<h1>Sign in to Karbexa</h1><p class="sub">Use your work email.</p>${errBox(opts.error)}
<form method="post" action="${BASE}/interaction/${uid}/login" autocomplete="on">
<label for="email">Email</label><input id="email" name="email" type="email" required autofocus autocomplete="username" value="${escapeHtml(opts.email || '')}">
<label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="current-password">
<button type="submit">Continue</button></form>${entra}
<p class="links"><a href="${escapeHtml(cfg.adminSpaOrigin)}/forgot-password">Forgot password?</a> · <a href="${BASE}/interaction/${uid}/abort">Cancel</a></p>`, opts.status);
}

function renderTotp(res: Response, uid: string, error?: string) {
  send(res, 'Verify', `<h1>Two-step verification</h1><p class="sub">Enter the 6-digit code from your authenticator app, or a recovery code.</p>${errBox(error)}
<form method="post" action="${BASE}/interaction/${uid}/totp" autocomplete="off">
<label for="code">Verification code</label><input id="code" class="otp" name="code" type="text" maxlength="15" placeholder="000000" required autofocus autocomplete="one-time-code">
<button type="submit">Verify</button></form><p class="links"><a href="${BASE}/interaction/${uid}/abort">Cancel</a></p>`);
}

/** Setup key in 4-character blocks for manual entry (authenticator apps ignore the spaces). */
export const formatSetupKey = (secret: string) => secret.replace(/\s+/g, '').match(/.{1,4}/g)?.join(' ') ?? '';

/** QR code for the otpauth URI, rendered locally as a PNG data URI (no external calls; CSP img-src allows data:). */
export const totpQrDataUri = (otpauthUri: string) =>
  QRCode.toDataURL(otpauthUri, { width: 200, margin: 2, errorCorrectionLevel: 'M' });

/**
 * QR code + "enter key manually" block of an authenticator enrolment page. Shared by the tenant and operator
 * realms so both offer the same scan-or-type setup. The raw secret is in `data-copy` (copy button; smokes read it).
 */
export async function totpEnrolSection(otpauthUri: string, secret: string, open: boolean): Promise<string> {
  const qr = await totpQrDataUri(otpauthUri);
  return `<section class="qr" aria-labelledby="scan-title">
<div><p class="section-title" id="scan-title">Scan with your phone</p>
<p class="hint">Open Microsoft Authenticator, Google Authenticator, or 1Password and scan this QR code.</p></div>
<img src="${qr}" width="200" height="200" alt="QR code to add Karbexa to your authenticator app">
</section>
<details class="manual"${open ? ' open' : ''}><summary>Can’t scan? Enter key manually</summary>
<div class="manual-body"><p class="hint">In your authenticator app, choose “Enter a setup key” and use this key (time-based):</p>
<div class="key-row"><code class="key" id="setup-key">${escapeHtml(formatSetupKey(secret))}</code>
<button type="button" class="copy" data-copy="${escapeHtml(secret)}" aria-describedby="setup-key">Copy key</button></div>
<span class="sr-only" id="copy-status" role="status" aria-live="polite"></span>
<a class="deeplink" href="${escapeHtml(otpauthUri)}">On this phone? Open in authenticator app</a></div></details>`;
}

async function renderEnrol(res: Response, uid: string, email: string, secret: string, error?: string) {
  const uri = generateURI({ issuer: 'Karbexa', label: email, secret });
  send(res, 'Set up verification', `<h1>Set up two-step verification</h1>
<p class="sub">Protect your account with an authenticator app. You’ll only need to do this once.</p>${errBox(error)}
${await totpEnrolSection(uri, secret, !!error)}
<form method="post" action="${BASE}/interaction/${uid}/enrol" autocomplete="off">
<label for="code">Enter the 6-digit code from your app</label><input id="code" class="otp" name="code" type="text" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7" placeholder="000000" required autofocus autocomplete="one-time-code">
<button type="submit">Confirm &amp; Complete Setup</button></form><p class="links"><a href="${BASE}/interaction/${uid}/abort">Cancel</a></p>`);
}

function renderExpired(res: Response) {
  const { adminSpaOrigin } = getIdentityConfig();
  send(res, 'Sign-in expired', `<h1>This sign-in has expired</h1><p class="sub">Go back to the application and start again.</p>
<a class="btn" href="${escapeHtml(adminSpaOrigin)}/login">Back to sign in</a>`, 400);
}

const readCookie = (req: Request, name: string): string | undefined => {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
};

export const normaliseCode = (raw: unknown) => String(raw ?? '').replace(/\s+/g, '');

/** RFC 6238 time step the code belongs to (±1 step of drift), or null when the code is not valid. */
export async function totpStep(secret: string, code: string): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const result: any = await verifyTotp({ secret, token: code, epochTolerance: 30 });
  return result.valid && typeof result.timeStep === 'number' ? result.timeStep : null;
}

export async function totpValid(secret: string, code: string): Promise<boolean> {
  return (await totpStep(secret, code)) !== null;
}

/**
 * Records `step` as the account's last used code step. False when a code of this step or a later one was already
 * accepted (replay, RFC 6238 §5.2). One conditional write, so two parallel submissions of the same code cannot both win.
 */
export async function claimTotpStep(model: { updateOne: (...a: any[]) => any }, id: unknown, field: string, step: number): Promise<boolean> {
  const r = await model.updateOne(
    { _id: id, $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: { $lt: step } }] },
    { $set: { [field]: step } },
  );
  return (r?.modifiedCount ?? 0) === 1;
}

export function registerTenantInteractions(app: Express, provider: OidcProvider): void {
  const cfg = getIdentityConfig();
  const form = express.urlencoded({ extended: false, limit: '10kb' });

  /** Interaction for this request; its uid must equal the URL uid (CSRF / mix-up guard). */
  async function details(req: Request, res: Response) {
    const d = await provider.interactionDetails(req, res);
    if (d.uid !== req.params.uid) {
      const err = new Error('interaction mismatch');
      err.name = 'SessionNotFound';
      throw err;
    }
    res.locals.karbexaShell = shellForClient(d.params.client_id);
    return d;
  }

  const pendingOf = (d: any): Pending | undefined => d.result?.karbexa;
  const savePending = (req: Request, res: Response, p: Pending) =>
    provider.interactionResult(req, res, { karbexa: p }, { mergeWithLastSubmission: false });
  const backToInteraction = (res: Response, uid: string) => res.redirect(303, `${BASE}/interaction/${uid}`);

  /** Wrap a handler: expired/missing interactions render a friendly page; other errors are logged. */
  const handle = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (err: any) {
      if (err?.name === 'SessionNotFound') return renderExpired(res);
      console.error('[identity] interaction error', err);
      if (!res.headersSent) send(res, 'Error', '<h1>Something went wrong</h1><p class="sub">Please go back to the application and try again.</p>', 500);
    }
  };

  /** Second factor satisfied (or accepted upstream): finish the login. */
  async function finishLogin(req: Request, res: Response, user: IUser, identity: IIdentity, amr: string[]) {
    await recordLoginSuccess(req, user, identity, amr);
    await provider.interactionFinished(req, res, { login: { accountId: user._id.toString(), amr } }, { mergeWithLastSubmission: false });
  }

  /** Password / federation step passed: move to TOTP verify, or enrolment on first login. */
  async function startSecondFactor(req: Request, res: Response, uid: string, user: IUser, identity: IIdentity, amrFirst: string[]) {
    const enrolled = identity.mfa?.totp_enabled && identity.mfa?.totp_secret_enc;
    const pending: Pending = {
      stage: enrolled ? 'totp' : 'enrol',
      member_id: user._id.toString(),
      identity_id: identity._id.toString(),
      amr_first: amrFirst,
      attempts: 0,
      ...(enrolled ? {} : { enrol_secret_enc: encrypt(generateSecret()) }),
    };
    await savePending(req, res, pending);
    await logSecurityEvent({
      company_id: user.company_id, user_id: user._id, email: identity.email, event_type: 'mfa_challenge',
      ip_address: req.ip, user_agent: req.headers['user-agent'], req, metadata: { method: 'totp', stage: pending.stage },
    });
    backToInteraction(res, uid);
  }

  async function loadPendingPrincipal(p: Pending) {
    const [user, identity] = await Promise.all([User.findById(p.member_id), Identity.findById(p.identity_id)]);
    return user && identity && identity.status === 'active' ? { user, identity } : null;
  }

  // ── GET interaction: render the current step ──────────────────────────────────────────────
  app.get(`${BASE}/interaction/:uid`, handle(async (req, res) => {
    const d = await details(req, res);
    const uid = d.uid as string;
    if (d.prompt?.name === 'consent') {
      // First-party clients never show consent (loadExistingGrant builds the grant); defensive fallback.
      const clientId = d.params.client_id as string;
      const grant = new provider.Grant({ accountId: d.session?.accountId, clientId });
      const resource = RESOURCE_FOR_CLIENT[clientId] ?? resourceForStandaloneClient(clientId);
      grant.addOIDCScope(resourceForStandaloneClient(clientId) ? STANDALONE_SCOPE : 'openid profile email');
      if (resource) grant.addResourceScope(resource, 'api');
      const grantId = await grant.save();
      return provider.interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true });
    }
    if (d.prompt?.name === 'product_access') {
      // The access gate (providers.ts policy) stopped this request: say why, never issue a code (DRD §8.4).
      const key = keyFromClientId(d.params.client_id);
      const accountId = d.session?.accountId as string | undefined;
      const gate = key && accountId ? await evaluateGate(key, accountId, d.params.redirect_uri as string | undefined) : undefined;
      if (gate?.outcome.allowed) return provider.interactionFinished(req, res, {}, { mergeWithLastSubmission: true }); // access appeared meanwhile
      const name = gate?.app?.name ?? 'this product';
      res.locals.karbexaShell = { theme: 'auto', app: name };
      const page = deniedPage(gate && !gate.outcome.allowed ? gate.outcome.page : 'unavailable', name, { abort: `${BASE}/interaction/${uid}/abort`, home: cfg.adminSpaOrigin });
      return send(res, page.title, page.body, page.status);
    }
    const pending = pendingOf(d);
    if (pending?.stage === 'totp') return renderTotp(res, uid);
    if (pending?.stage === 'enrol' && pending.enrol_secret_enc) {
      const identity = await Identity.findById(pending.identity_id).select('email');
      return renderEnrol(res, uid, identity?.email || '', decrypt(pending.enrol_secret_enc));
    }
    return renderLogin(res, uid, { email: typeof d.params.login_hint === 'string' ? d.params.login_hint : '' });
  }));

  // ── POST password ─────────────────────────────────────────────────────────────────────────
  app.post(`${BASE}/interaction/:uid/login`, authLimiter, form, handle(async (req, res) => {
    const d = await details(req, res);
    const uid = d.uid as string;
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!email || !password) return renderLogin(res, uid, { error: 'Enter your email and password.', email, status: 400 });

    // 03 §4.1.1: identical response whether or not the identity exists (constant-time-ish).
    const identity = await Identity.findOne({ email });
    if (!identity || !identity.password_hash) {
      await bcrypt.compare(password, DUMMY_HASH);
      await recordUnknownEmailFailure(req, email);
      return renderLogin(res, uid, { error: GENERIC_LOGIN_ERROR, email, status: 401 });
    }
    const passwordOk = await bcrypt.compare(password, identity.password_hash);
    const user = await pickMembership(identity._id);
    if (!user) {
      if (!passwordOk) await recordUnknownEmailFailure(req, email);
      return renderLogin(res, uid, { error: passwordOk ? 'Your account has no active access. Contact your administrator.' : GENERIC_LOGIN_ERROR, email, status: 401 });
    }

    // 03 §4.1.2: SSO enforcement — active membership in an org with active connection where enforce_sso=true and domain is verified.
    const emailDomain = email.split('@')[1];
    if (emailDomain) {
      const ssoConn = await IdentityProviderConnection.findOne({
        company_id: user.company_id,
        status: 'active',
        enforce_sso: true,
        domains: { $elemMatch: { domain: emailDomain, verified_at: { $exists: true, $ne: null } } },
      });
      if (ssoConn) {
        return renderLogin(res, uid, {
          error: 'Single sign-on is required for your organisation. Please sign in with Microsoft.',
          email,
          status: 403,
        });
      }
    }

    await logSecurityEvent({
      company_id: user.company_id, user_id: user._id, email, event_type: 'login_attempt',
      ip_address: req.ip, user_agent: req.headers['user-agent'], req, metadata: { reason: 'login_attempt_logged' },
    });

    const ipDenial = await evaluateLoginIpPolicy(req, user, email);
    if (ipDenial) return renderLogin(res, uid, { error: passwordOk ? ipDenial.message : GENERIC_LOGIN_ERROR, email, status: 403 });

    if (isLocked(user, identity)) {
      await recordLockedAttempt(req, user, email);
      const msg = passwordOk ? 'Your account is locked after too many failed attempts. Reset your password or contact your administrator.' : GENERIC_LOGIN_ERROR;
      return renderLogin(res, uid, { error: msg, email, status: 403 });
    }
    if (!passwordOk) {
      await recordPasswordFailure(req, user, identity);
      return renderLogin(res, uid, { error: GENERIC_LOGIN_ERROR, email, status: 401 });
    }

    const expired = await checkPasswordExpired(req, user, identity);
    if (expired) return renderLogin(res, uid, { error: `${expired.message} Use "Forgot password?" below.`, email, status: 403 });

    if (!(await loadAccessContext(user._id.toString()))) {
      return renderLogin(res, uid, { error: 'Your account has no active access. Contact your administrator.', email, status: 403 });
    }

    // 03 §4.1.4: MFA always required for local login (TOTP).
    return startSecondFactor(req, res, uid, user, identity, ['pwd']);
  }));

  // ── POST TOTP verify ──────────────────────────────────────────────────────────────────────
  app.post(`${BASE}/interaction/:uid/totp`, authLimiter, form, handle(async (req, res) => {
    const d = await details(req, res);
    const uid = d.uid as string;
    const pending = pendingOf(d);
    if (!pending || pending.stage !== 'totp') return backToInteraction(res, uid);
    const principal = await loadPendingPrincipal(pending);
    if (!principal || !principal.identity.mfa?.totp_secret_enc) {
      return provider.interactionFinished(req, res, { error: 'access_denied', error_description: 'sign-in no longer possible' }, { mergeWithLastSubmission: false });
    }
    const { user, identity } = principal;

    const step = await totpStep(decrypt(identity.mfa.totp_secret_enc!), normaliseCode(req.body?.code));
    if (step !== null && await claimTotpStep(Identity, identity._id, 'mfa.totp_last_step', step)) {
      await logSecurityEvent({ company_id: user.company_id, user_id: user._id, email: identity.email, event_type: 'mfa_verified', ip_address: req.ip, user_agent: req.headers['user-agent'], req });
      return finishLogin(req, res, user, identity, [...pending.amr_first, 'otp']);
    }

    if (consumeRecoveryCode(identity, String(req.body?.code ?? ''))) {
      await identity.save();
      await logSecurityEvent({ company_id: user.company_id, user_id: user._id, email: identity.email, event_type: 'mfa_verified', ip_address: req.ip, user_agent: req.headers['user-agent'], req, metadata: { method: 'recovery_code' } });
      return finishLogin(req, res, user, identity, [...pending.amr_first, 'mfa_recovery']);
    }

    pending.attempts += 1;
    await logSecurityEvent({ company_id: user.company_id, user_id: user._id, email: identity.email, event_type: 'mfa_failed', ip_address: req.ip, user_agent: req.headers['user-agent'], req, metadata: { reason: 'invalid_totp', attempts: pending.attempts } });
    if (pending.attempts >= MAX_OTP_ATTEMPTS) {
      return provider.interactionFinished(req, res, { error: 'access_denied', error_description: 'too many invalid verification codes' }, { mergeWithLastSubmission: false });
    }
    await savePending(req, res, pending);
    return renderTotp(res, uid, 'That code is not valid. Try again.');
  }));

  // ── POST TOTP enrolment (first login) ─────────────────────────────────────────────────────
  app.post(`${BASE}/interaction/:uid/enrol`, authLimiter, form, handle(async (req, res) => {
    const d = await details(req, res);
    const uid = d.uid as string;
    const pending = pendingOf(d);
    if (!pending || pending.stage !== 'enrol' || !pending.enrol_secret_enc) return backToInteraction(res, uid);
    const principal = await loadPendingPrincipal(pending);
    if (!principal) {
      return provider.interactionFinished(req, res, { error: 'access_denied', error_description: 'sign-in no longer possible' }, { mergeWithLastSubmission: false });
    }
    const { user, identity } = principal;
    const secret = decrypt(pending.enrol_secret_enc);

    const enrolStep = await totpStep(secret, normaliseCode(req.body?.code));
    if (enrolStep !== null) {
      identity.mfa.totp_secret_enc = pending.enrol_secret_enc;
      identity.mfa.totp_enabled = true;
      identity.mfa.totp_last_step = enrolStep; // the enrolment code cannot be replayed at the next sign-in
      await identity.save();
      await logSecurityEvent({ company_id: user.company_id, user_id: user._id, email: identity.email, event_type: 'mfa_verified', ip_address: req.ip, user_agent: req.headers['user-agent'], req, metadata: { totp_enrolled: true } });
      return finishLogin(req, res, user, identity, [...pending.amr_first, 'otp']);
    }

    pending.attempts += 1;
    if (pending.attempts >= MAX_OTP_ATTEMPTS) {
      return provider.interactionFinished(req, res, { error: 'access_denied', error_description: 'too many invalid verification codes' }, { mergeWithLastSubmission: false });
    }
    await savePending(req, res, pending);
    return renderEnrol(res, uid, identity.email, secret, 'That code is not valid. Check the time on your phone and try again.');
  }));

  // ── Cancel ────────────────────────────────────────────────────────────────────────────────
  app.get(`${BASE}/interaction/:uid/abort`, handle(async (req, res) => {
    await details(req, res);
    await provider.interactionFinished(req, res, { error: 'access_denied', error_description: 'End-User aborted interaction' }, { mergeWithLastSubmission: false });
  }));

  // ── Microsoft Entra federation (03 §4.2) ──────────────────────────────────────────────────
  const entraEnabled = () => !!(cfg.entra.clientId && cfg.entra.clientSecret);
  const entraRedirectUri = `${cfg.tenantIssuer}/federation/entra/callback`;
  const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, secure: cfg.secureCookies, path: BASE };

  const readEntraPending = (req: Request): EntraPending | undefined => {
    const raw = readCookie(req, ENTRA_COOKIE);
    if (!raw) return undefined;
    try {
      const p = JSON.parse(decrypt(raw)) as EntraPending;
      return p.exp > Date.now() ? p : undefined;
    } catch {
      return undefined;
    }
  };

  app.get(`${BASE}/interaction/:uid/entra`, handle(async (req, res) => {
    const d = await details(req, res);
    if (!entraEnabled()) return renderLogin(res, d.uid, { error: 'Microsoft sign-in is not available.', status: 404 });
    const pending: EntraPending = {
      uid: d.uid,
      state: crypto.randomBytes(24).toString('base64url'),
      nonce: crypto.randomBytes(24).toString('base64url'),
      verifier: crypto.randomBytes(32).toString('base64url'),
      exp: Date.now() + 10 * 60 * 1000,
    };
    res.cookie(ENTRA_COOKIE, encrypt(JSON.stringify(pending)), { ...cookieOpts, maxAge: 10 * 60 * 1000 });
    const url = `${ENTRA_AUTHORITY}/authorize?${new URLSearchParams({
      client_id: cfg.entra.clientId!,
      response_type: 'code',
      response_mode: 'query',
      redirect_uri: entraRedirectUri,
      scope: 'openid profile email',
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: crypto.createHash('sha256').update(pending.verifier).digest('base64url'),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    })}`;
    res.redirect(303, url);
  }));

  // The interaction cookie is path-scoped to /interaction/<uid>, so bounce back under that path.
  app.get(`${BASE}/federation/entra/callback`, (req, res) => {
    const pending = readEntraPending(req);
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!pending || !state || state !== pending.state) return renderExpired(res);
    const forward = new URLSearchParams();
    for (const k of ['code', 'state', 'error', 'error_description']) {
      const v = req.query[k];
      if (typeof v === 'string') forward.set(k, v);
    }
    res.redirect(303, `${BASE}/interaction/${encodeURIComponent(pending.uid)}/entra/return?${forward}`);
  });

  app.get(`${BASE}/interaction/:uid/entra/return`, handle(async (req, res) => {
    const d = await details(req, res);
    const uid = d.uid as string;
    const pending = readEntraPending(req);
    res.clearCookie(ENTRA_COOKIE, cookieOpts);
    if (!entraEnabled() || !pending || pending.uid !== uid || req.query.state !== pending.state) return renderExpired(res);
    const deny = (msg: string) => renderLogin(res, uid, { error: msg, status: 403 });
    if (typeof req.query.error === 'string' || typeof req.query.code !== 'string') {
      return deny('Microsoft sign-in was cancelled or failed. Try again.');
    }

    const tokenRes = await fetch(`${ENTRA_AUTHORITY}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.entra.clientId!,
        client_secret: cfg.entra.clientSecret!,
        grant_type: 'authorization_code',
        code: req.query.code,
        redirect_uri: entraRedirectUri,
        code_verifier: pending.verifier,
        scope: 'openid profile email',
      }),
    });
    const tokenBody = (await tokenRes.json().catch(() => ({}))) as { id_token?: string; error?: string };
    if (!tokenRes.ok || !tokenBody.id_token) {
      console.warn('[identity] Entra token exchange failed', tokenRes.status, tokenBody.error);
      return deny('Microsoft sign-in failed. Try again.');
    }

    let claims: jose.JWTPayload;
    try {
      const unverified = jose.decodeJwt(tokenBody.id_token);
      const tid = typeof unverified.tid === 'string' ? unverified.tid : '';
      if (!/^[0-9a-f-]{36}$/i.test(tid)) throw new Error('missing tid');
      entraJwks ??= jose.createRemoteJWKSet(new URL(ENTRA_JWKS_URL));
      ({ payload: claims } = await jose.jwtVerify(tokenBody.id_token, entraJwks, {
        audience: cfg.entra.clientId!,
        issuer: `https://login.microsoftonline.com/${tid}/v2.0`,
        algorithms: ['RS256'],
      }));
      if (claims.tid !== tid || claims.nonce !== pending.nonce || typeof claims.oid !== 'string') throw new Error('claim mismatch');
    } catch (err) {
      console.warn('[identity] Entra id_token rejected', (err as Error).message);
      return deny('Microsoft sign-in failed. Try again.');
    }

    const tid = String(claims.tid);
    const oid = String(claims.oid);
    const issuer = String(claims.iss);
    const connection = await IdentityProviderConnection.findOne({ type: 'entra', status: 'active', 'config.tenant_id': tid.toLowerCase() });
    if (!connection) return deny('Your organisation is not set up for Microsoft sign-in with Karbexa.');

    // 03 §4.2.3–5 as amended by elevation 5.11: identity resolved by the (issuer, oid) link; with no link, a first-sign-in
    // link is made only for a verified domain and an existing active member (federationLink.ts). JIT stays deferred.
    const noAccount = 'No Karbexa account is linked to this Microsoft account. Ask your administrator for an invitation.';
    const claimEmail = typeof claims.email === 'string' ? claims.email : typeof claims.preferred_username === 'string' ? claims.preferred_username : undefined;
    const fail = async (reason: string, msg: string) => {
      await logSecurityEvent({
        company_id: connection.company_id, email: claimEmail?.toLowerCase(),
        event_type: 'login_failure', ip_address: req.ip, user_agent: req.headers['user-agent'], req,
        metadata: { reason, method: 'entra', tid },
      });
      return deny(msg);
    };
    const resolved = await resolveFederatedIdentity({ connection, issuer, oid, email: claimEmail });
    if (!resolved.ok) {
      return fail(resolved.reason, resolved.reason === 'identity_inactive' ? 'Your account is not active. Contact your administrator.' : noAccount);
    }
    const identity = resolved.identity;
    if (identity.status !== 'active') return fail('identity_inactive', 'Your account is not active. Contact your administrator.');

    const user = await pickMembership(identity._id, connection.company_id);
    if (!user || !(await loadAccessContext(user._id.toString()))) {
      return fail('no_access', 'Your account has no active access. Contact your administrator.');
    }
    const ipDenial = await evaluateLoginIpPolicy(req, user, identity.email);
    if (ipDenial) return deny(ipDenial.message);

    // 03 §4.2.6: accept upstream MFA, otherwise step up with TOTP.
    const upstreamAmr = Array.isArray(claims.amr) ? (claims.amr as unknown[]).map(String) : [];
    if (upstreamAmr.includes('mfa')) return finishLogin(req, res, user, identity, ['fed', 'mfa']);
    return startSecondFactor(req, res, uid, user, identity, ['fed']);
  }));
}
