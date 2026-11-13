// server/src/identity/account.ts
// Central Identity Account Page: /realms/tenant/account (03 §4.4, D-8).
// Server-rendered with pageShell / nonce-CSP. Requires an authenticated tenant session.
import express, { Express, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as jose from 'jose';
import { generateSecret, generateURI } from 'otplib';
import { Identity, IIdentity } from '../models/Identity.model';
import { User, IUser } from '../models/User.model';
import { Company } from '../models/Company.model';
import { Session, ISession } from '../models/Session.model';
import { encrypt, decrypt } from '../lib/cryptoService';
import { authLimiter } from '../middleware/rateLimiter';
import { logSecurityEvent, setIdentityPassword } from '../controllers/auth.controller';
import { getIdentityConfig, ADMIN_AUDIENCE } from './config';
import { getPublicJwks, loadCookieKeys } from './keys';
import { findLiveSession, revokeSession } from './sessions';
import { escapeHtml, newNonce, pageCsp, pageShell } from './html';
import { totpValid, normaliseCode } from './interactions';
import { generateRecoveryCodes, consumeRecoveryCode } from './recoveryCodes';
import type { OidcProvider } from './providers';

const BASE = '/realms/tenant/account';
const PENDING_TOTP_COOKIE = 'tenant_account_totp_pending';

interface PendingTotpCookie {
  secret: string;
  identity_id: string;
  exp: number;
}

const readCookie = (req: Request, name: string): string | undefined => {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
};

function setEncryptedCookie(res: Response, name: string, data: unknown, maxAgeMs = 600000) {
  const cfg = getIdentityConfig();
  const enc = encrypt(JSON.stringify(data));
  const secure = cfg.secureCookies ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(enc)}; Path=${BASE}; Max-Age=${Math.floor(maxAgeMs / 1000)}; HttpOnly; SameSite=Lax${secure}`);
}

function clearCookie(res: Response, name: string) {
  const cfg = getIdentityConfig();
  const secure = cfg.secureCookies ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${name}=; Path=${BASE}; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
}

function readEncryptedCookie<T>(req: Request, name: string): T | undefined {
  const raw = readCookie(req, name);
  if (!raw) return undefined;
  try {
    return JSON.parse(decrypt(raw)) as T;
  } catch {
    return undefined;
  }
}

function getCsrfSecret(): string {
  const keys = loadCookieKeys();
  return keys[0] || process.env.ENCRYPTION_KEY || 'karbexa-account-csrf-secret';
}

/** CSRF token bound to the session uid and issued timestamp. */
function createCsrfToken(sid: string): string {
  const ts = Date.now().toString();
  const secret = getCsrfSecret();
  const sig = crypto.createHmac('sha256', secret).update(`${sid}:${ts}`).digest('base64url');
  return `${sid}.${ts}.${sig}`;
}

function verifyCsrfToken(sid: string, token?: unknown): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [tokenSid, tsStr, sig] = parts;
  if (tokenSid !== sid) return false;
  const ts = Number(tsStr);
  if (isNaN(ts) || Date.now() - ts > 2 * 60 * 60 * 1000) return false; // 2 hour max age
  const secret = getCsrfSecret();
  const expected = crypto.createHmac('sha256', secret).update(`${sid}:${tsStr}`).digest('base64url');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

let tenantKeySet: ReturnType<typeof jose.createLocalJWKSet> | undefined;

/** Resolve authenticated tenant session from provider session cookie or Bearer token fallback. */
async function resolveAccountSession(req: Request, res: Response, provider: OidcProvider): Promise<{
  user: IUser;
  identity: IIdentity;
  sid: string;
} | null> {
  // 1. Try provider session from cookies
  try {
    const ctx = provider.createContext(req, res);
    const oidcSession = await provider.Session.get(ctx);
    if (oidcSession?.accountId && oidcSession?.uid) {
      const live = await findLiveSession(oidcSession.uid);
      if (live) {
        const [user, identity] = await Promise.all([
          User.findById(oidcSession.accountId),
          Identity.findById(live.identity_id),
        ]);
        if (user && user.is_active && user.lifecycle_state === 'active' && identity && identity.status === 'active') {
          return { user, identity, sid: oidcSession.uid };
        }
      }
    }
  } catch {
    // Ignore and attempt Bearer fallback
  }

  // 2. Fallback: Bearer token in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      tenantKeySet ??= jose.createLocalJWKSet(getPublicJwks('tenant'));
      // Same checks as requireAuth: only Admin access tokens. A products or id token from the same issuer must not work here.
      const { payload } = await jose.jwtVerify(token, tenantKeySet, {
        issuer: getIdentityConfig().tenantIssuer,
        audience: ADMIN_AUDIENCE,
        algorithms: ['RS256'],
        typ: 'at+jwt',
      });
      if (payload.token_use !== 'access') return null;
      const sid = String(payload.sid || '');
      const sub = String(payload.sub || '');
      if (sid && sub) {
        const live = await findLiveSession(sid);
        if (live && live.member_id.toString() === sub) {
          const [user, identity] = await Promise.all([
            User.findById(sub),
            Identity.findById(live.identity_id),
          ]);
          if (user && user.is_active && user.lifecycle_state === 'active' && identity && identity.status === 'active') {
            return { user, identity, sid };
          }
        }
      }
    } catch {
      // invalid token
    }
  }

  return null;
}

interface PageOptions {
  error?: string;
  success?: string;
  newRecoveryCodes?: string[];
  pendingTotpSecret?: string;
  status?: number;
}

async function renderAccountPage(
  res: Response,
  user: IUser,
  identity: IIdentity,
  sid: string,
  options: PageOptions = {},
) {
  const nonce = newNonce();
  const cfg = getIdentityConfig();
  const csrf = createCsrfToken(sid);
  const company = await Company.findById(user.company_id).select('name');
  const sessions = await Session.find({ identity_id: identity._id, revoked_at: { $exists: false } }).sort({ last_seen_at: -1 });

  const isFederated = Boolean(identity.federated_links && identity.federated_links.length > 0);
  const unusedCodesCount = identity.mfa?.recovery_codes_hash?.length || 0;
  const totpEnabled = Boolean(identity.mfa?.totp_enabled && identity.mfa?.totp_secret_enc);

  const alertBox = options.error
    ? `<div class="alert-err" role="alert">${escapeHtml(options.error)}</div>`
    : options.success
    ? `<div class="alert-success" role="status">${escapeHtml(options.success)}</div>`
    : '';

  // Password section
  const passwordSection = isFederated
    ? `<div class="card">
        <h2>Change Password</h2>
        <p class="sub">Your account is federated with Microsoft Entra. Passwords are managed directly by your organisation's identity provider.</p>
       </div>`
    : `<div class="card">
        <h2>Change Password</h2>
        <p class="sub">Updating your password signs you out of all other devices and sessions.</p>
        <form method="post" action="${BASE}/password">
          <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
          <label for="current_password">Current password</label>
          <input id="current_password" name="current_password" type="password" required autocomplete="current-password">
          <label for="new_password">New password</label>
          <input id="new_password" name="new_password" type="password" required autocomplete="new-password">
          <label for="confirm_password">Confirm new password</label>
          <input id="confirm_password" name="confirm_password" type="password" required autocomplete="new-password">
          <button type="submit" class="btn-primary" style="margin-top: 16px;">Update password</button>
        </form>
       </div>`;

  // TOTP section
  let totpSection = '';
  if (options.pendingTotpSecret) {
    const uri = generateURI({ issuer: 'Karbexa', label: identity.email, secret: options.pendingTotpSecret });
    totpSection = `<div class="card">
      <h2>Two-Step Verification (Confirm New Key)</h2>
      <p class="sub">Scan this key with your authenticator app (Microsoft Authenticator, Google Authenticator, 1Password…), then enter the 6-digit code it displays.</p>
      <label>Setup key</label><code>${escapeHtml(options.pendingTotpSecret)}</code>
      <label>Authenticator link</label><code><a href="${escapeHtml(uri)}">${escapeHtml(uri)}</a></code>
      <form method="post" action="${BASE}/totp/confirm" autocomplete="off" style="margin-top: 16px;">
        <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
        <label for="totp_confirm_code">Verification code</label>
        <input id="totp_confirm_code" name="code" type="text" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7" required autofocus autocomplete="one-time-code">
        <div style="display: flex; gap: 8px; margin-top: 16px;">
          <button type="submit" class="btn-primary">Confirm and activate</button>
          <a href="${BASE}" class="btn-secondary" style="text-decoration:none; padding: 8px 16px; border-radius: 6px; font-size: 14px; text-align: center;">Cancel</a>
        </div>
      </form>
    </div>`;
  } else {
    totpSection = `<div class="card">
      <h2>Two-Step Verification</h2>
      <p class="sub">Status: <strong>${totpEnabled ? '<span class="badge badge-success">Enabled</span>' : '<span class="badge">Not configured</span>'}</strong></p>
      ${totpEnabled
        ? `<p class="sub" style="margin-top: 8px;">To re-enrol your authenticator app, enter your current 6-digit verification code or an unused recovery code.</p>
           <form method="post" action="${BASE}/totp/initiate" autocomplete="off">
             <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
             <label for="verification_code">Current code or recovery code</label>
             <input id="verification_code" name="verification_code" type="text" maxlength="15" required placeholder="6-digit code or XXXXX-XXXXX">
             <button type="submit" class="btn-primary" style="margin-top: 16px;">Re-enrol authenticator app</button>
           </form>`
        : `<form method="post" action="${BASE}/totp/initiate" autocomplete="off">
             <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
             <button type="submit" class="btn-primary">Set up authenticator app</button>
           </form>`}
    </div>`;
  }

  // Recovery codes section
  let recoveryCodesSection = '';
  if (options.newRecoveryCodes && options.newRecoveryCodes.length > 0) {
    const codesGrid = options.newRecoveryCodes.map((c) => `<div>${escapeHtml(c)}</div>`).join('');
    recoveryCodesSection = `<div class="card">
      <h2>Recovery Codes</h2>
      <div class="alert-success" style="margin-top: 8px;">
        <strong>Save these 10 recovery codes now.</strong> They will not be displayed again. Each code can be used once if you lose access to your authenticator app.
      </div>
      <div class="codes-box">${codesGrid}</div>
      <p class="sub">Store them in a secure password manager or offline location.</p>
      <a href="${BASE}" class="btn-secondary" style="display: inline-block; text-decoration:none; margin-top: 12px;">Done</a>
    </div>`;
  } else {
    recoveryCodesSection = `<div class="card">
      <h2>Recovery Codes</h2>
      <p class="sub">You have <strong>${unusedCodesCount}</strong> unused recovery codes available.</p>
      <form method="post" action="${BASE}/recovery-codes">
        <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
        <button type="submit" class="btn-secondary">Generate 10 new recovery codes</button>
      </form>
    </div>`;
  }

  // Sessions section
  const otherSessions = sessions.filter((s) => s._id !== sid);
  const sessionRows = sessions.map((s) => {
    const isCurrent = s._id === sid;
    const lastActive = new Date(s.last_seen_at || s.created_at).toLocaleString();
    const ua = s.user_agent ? escapeHtml(s.user_agent.slice(0, 70)) : 'Unknown device';
    const ip = s.ip ? escapeHtml(s.ip) : 'Unknown IP';
    const currentBadge = isCurrent ? '<span class="badge badge-current" style="margin-left: 8px;">Current session</span>' : '';

    const revokeBtn = isCurrent
      ? ''
      : `<form method="post" action="${BASE}/sessions/revoke" style="margin: 0;">
          <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
          <input type="hidden" name="session_id" value="${escapeHtml(s._id)}">
          <button type="submit" class="btn-danger">Sign out</button>
        </form>`;

    return `<div class="session-row">
      <div>
        <div><strong>${ua}</strong>${currentBadge}</div>
        <div style="color: #64748b; font-size: 13px; margin-top: 2px;">IP: ${ip} · Last seen: ${lastActive}</div>
      </div>
      <div>${revokeBtn}</div>
    </div>`;
  }).join('');

  const revokeOthersForm = otherSessions.length > 0
    ? `<form method="post" action="${BASE}/sessions/revoke-others" style="margin-top: 16px;">
        <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
        <button type="submit" class="btn-secondary" style="color: #b91c1c; border-color: #fca5a5;">Sign out all other sessions</button>
       </form>`
    : '';

  const sessionsSection = `<div class="card">
    <h2>Active Sessions</h2>
    <p class="sub">Review all active browser sessions signed in to your Karbexa account.</p>
    <div style="margin-top: 12px;">${sessionRows}</div>
    ${revokeOthersForm}
  </div>`;

  const body = `
<style nonce="${nonce}">
  main { width: 100% !important; max-width: 680px !important; margin: 40px auto !important; padding: 24px !important; box-shadow: none !important; background: transparent !important; border: 0 !important; }
  .header-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,.04); }
  .card h2 { font-size: 17px; margin: 0 0 4px; color: #0f172a; }
  .card p.sub { font-size: 14px; color: #64748b; margin: 0 0 16px; }
  .alert-success { background: #ebfbee; color: #2b8a3e; border: 1px solid #b2f2bb; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 14px; }
  .alert-err { background: #fdecec; color: #a61b1b; border: 1px solid #ffc9c9; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 14px; }
  .codes-box { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 15px; letter-spacing: 1px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 16px 0; text-align: center; }
  .session-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
  .badge-success { background: #dcfce7; color: #15803d; }
  .badge-current { background: #e0e7ff; color: #3730a3; }
  .btn-danger { background: #fff; color: #dc2626; border: 1px solid #fca5a5; border-radius: 6px; padding: 6px 12px; font-size: 13px; font-weight: 500; cursor: pointer; }
  .btn-danger:hover { background: #fee2e2; }
  .btn-secondary { display: inline-block; background: #fff; color: #334155; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 16px; font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; }
  .btn-secondary:hover { background: #f8fafc; }
  .btn-primary { display: inline-block; background: #3b5bdb; color: #fff; border: 0; border-radius: 6px; padding: 9px 18px; font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none; }
  .btn-primary:hover { background: #364fc7; }
</style>
<div class="header-bar">
  <div>
    <h1 style="font-size: 22px; margin: 0 0 4px 0;">Account &amp; Security</h1>
    <div style="color: #64748b; font-size: 14px;">${escapeHtml(user.full_name)} (${escapeHtml(identity.email)}) · ${escapeHtml(company?.name || '')}</div>
  </div>
  <div>
    <a href="${escapeHtml(cfg.adminSpaOrigin)}" class="btn-secondary">&larr; Back to Admin</a>
  </div>
</div>
${alertBox}
${passwordSection}
${totpSection}
${recoveryCodesSection}
${sessionsSection}
`;

  res.status(options.status || 200);
  res.setHeader('Content-Security-Policy', pageCsp(nonce));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.type('html').send(pageShell(nonce, 'Account Settings', body));
}

/**
 * Register account routes under `/realms/tenant/account`.
 * Must be registered BEFORE the oidc-provider tenant callback.
 */
export function registerAccountRoutes(app: Express, provider: OidcProvider): void {
  const form = express.urlencoded({ extended: false, limit: '20kb' });

  // ── GET /realms/tenant/account ─────────────────────────────────────────────────────────────
  app.get(BASE, async (req: Request, res: Response) => {
    const sessionContext = await resolveAccountSession(req, res, provider);
    if (!sessionContext) {
      const { adminSpaOrigin } = getIdentityConfig();
      return res.redirect(302, `${adminSpaOrigin}/login`);
    }

    const { user, identity, sid } = sessionContext;
    const pending = readEncryptedCookie<PendingTotpCookie>(req, PENDING_TOTP_COOKIE);
    const pendingSecret = (pending && pending.identity_id === identity._id.toString() && pending.exp > Date.now())
      ? pending.secret
      : undefined;

    const success = typeof req.query.success === 'string' ? req.query.success : undefined;
    const error = typeof req.query.error === 'string' ? req.query.error : undefined;

    return renderAccountPage(res, user, identity, sid, {
      success,
      error,
      pendingTotpSecret: pendingSecret,
    });
  });

  // ── POST /realms/tenant/account/password ───────────────────────────────────────────────────
  app.post(`${BASE}/password`, authLimiter, form, async (req: Request, res: Response) => {
    const sessionContext = await resolveAccountSession(req, res, provider);
    if (!sessionContext) {
      const { adminSpaOrigin } = getIdentityConfig();
      return res.redirect(302, `${adminSpaOrigin}/login`);
    }
    const { user, identity, sid } = sessionContext;

    if (!verifyCsrfToken(sid, req.body?.csrf)) {
      return renderAccountPage(res, user, identity, sid, { error: 'Invalid or missing CSRF token.', status: 403 });
    }

    if (identity.federated_links && identity.federated_links.length > 0) {
      return renderAccountPage(res, user, identity, sid, {
        error: 'Password management is not available for federated Microsoft Entra accounts.',
        status: 400,
      });
    }

    const currentPassword = String(req.body?.current_password ?? '');
    const newPassword = String(req.body?.new_password ?? '');
    const confirmPassword = String(req.body?.confirm_password ?? '');

    if (!currentPassword || !newPassword || !confirmPassword) {
      return renderAccountPage(res, user, identity, sid, { error: 'All fields are required.', status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return renderAccountPage(res, user, identity, sid, { error: 'New passwords do not match.', status: 400 });
    }

    const currentOk = await bcrypt.compare(currentPassword, identity.password_hash || '');
    if (!currentOk) {
      return renderAccountPage(res, user, identity, sid, { error: 'Current password is incorrect.', status: 400 });
    }

    try {
      await setIdentityPassword(user, identity, newPassword);
      await identity.save();
    } catch (err: any) {
      return renderAccountPage(res, user, identity, sid, {
        error: err.message || 'Password does not meet policy requirements.',
        status: 400,
      });
    }

    // Revoke all other active sessions for this identity (03 §4.4)
    const otherSessions = await Session.find({
      identity_id: identity._id,
      _id: { $ne: sid },
      revoked_at: { $exists: false },
    }).select('_id');

    for (const s of otherSessions) {
      await revokeSession(s._id, 'password_change');
    }

    await logSecurityEvent({
      company_id: user.company_id,
      user_id: user._id,
      email: identity.email,
      event_type: 'password_reset_complete',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      req,
      metadata: { reason: 'account_page_change', other_sessions_revoked: otherSessions.length },
    });

    return renderAccountPage(res, user, identity, sid, {
      success: 'Password changed successfully. All other sessions have been signed out.',
    });
  });

  // ── POST /realms/tenant/account/totp/initiate ───────────────────────────────────────────────
  app.post(`${BASE}/totp/initiate`, authLimiter, form, async (req: Request, res: Response) => {
    const sessionContext = await resolveAccountSession(req, res, provider);
    if (!sessionContext) {
      const { adminSpaOrigin } = getIdentityConfig();
      return res.redirect(302, `${adminSpaOrigin}/login`);
    }
    const { user, identity, sid } = sessionContext;

    if (!verifyCsrfToken(sid, req.body?.csrf)) {
      return renderAccountPage(res, user, identity, sid, { error: 'Invalid or missing CSRF token.', status: 403 });
    }

    const totpEnrolled = Boolean(identity.mfa?.totp_enabled && identity.mfa?.totp_secret_enc);
    if (totpEnrolled) {
      const verificationCode = String(req.body?.verification_code ?? '').trim();
      if (!verificationCode) {
        return renderAccountPage(res, user, identity, sid, {
          error: 'Current authenticator code or recovery code is required.',
          status: 400,
        });
      }

      const currentSecret = decrypt(identity.mfa.totp_secret_enc!);
      const isTotpValid = await totpValid(currentSecret, normaliseCode(verificationCode));
      let isRecoveryValid = false;

      if (!isTotpValid) {
        isRecoveryValid = consumeRecoveryCode(identity, verificationCode);
        if (isRecoveryValid) {
          await identity.save();
        }
      }

      if (!isTotpValid && !isRecoveryValid) {
        return renderAccountPage(res, user, identity, sid, {
          error: 'Current authenticator code or recovery code is not valid.',
          status: 400,
        });
      }
    }

    const newSecret = generateSecret();
    const cookieData: PendingTotpCookie = {
      secret: newSecret,
      identity_id: identity._id.toString(),
      exp: Date.now() + 10 * 60 * 1000,
    };
    setEncryptedCookie(res, PENDING_TOTP_COOKIE, cookieData);

    return renderAccountPage(res, user, identity, sid, {
      pendingTotpSecret: newSecret,
    });
  });

  // ── POST /realms/tenant/account/totp/confirm ────────────────────────────────────────────────
  app.post(`${BASE}/totp/confirm`, authLimiter, form, async (req: Request, res: Response) => {
    const sessionContext = await resolveAccountSession(req, res, provider);
    if (!sessionContext) {
      const { adminSpaOrigin } = getIdentityConfig();
      return res.redirect(302, `${adminSpaOrigin}/login`);
    }
    const { user, identity, sid } = sessionContext;

    if (!verifyCsrfToken(sid, req.body?.csrf)) {
      return renderAccountPage(res, user, identity, sid, { error: 'Invalid or missing CSRF token.', status: 403 });
    }

    const pending = readEncryptedCookie<PendingTotpCookie>(req, PENDING_TOTP_COOKIE);
    if (!pending || pending.identity_id !== identity._id.toString() || pending.exp < Date.now()) {
      clearCookie(res, PENDING_TOTP_COOKIE);
      return renderAccountPage(res, user, identity, sid, {
        error: 'Two-step verification setup session expired. Please start again.',
        status: 400,
      });
    }

    const code = normaliseCode(req.body?.code);
    if (!code || !(await totpValid(pending.secret, code))) {
      return renderAccountPage(res, user, identity, sid, {
        error: 'That code is not valid. Check your authenticator app and try again.',
        pendingTotpSecret: pending.secret,
        status: 400,
      });
    }

    identity.mfa.totp_secret_enc = encrypt(pending.secret);
    identity.mfa.totp_enabled = true;
    await identity.save();
    clearCookie(res, PENDING_TOTP_COOKIE);

    await logSecurityEvent({
      company_id: user.company_id,
      user_id: user._id,
      email: identity.email,
      event_type: 'mfa_verified',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      req,
      metadata: { totp_re_enrolled: true },
    });

    return renderAccountPage(res, user, identity, sid, {
      success: 'Two-step verification has been successfully updated.',
    });
  });

  // ── POST /realms/tenant/account/recovery-codes ──────────────────────────────────────────────
  app.post(`${BASE}/recovery-codes`, authLimiter, form, async (req: Request, res: Response) => {
    const sessionContext = await resolveAccountSession(req, res, provider);
    if (!sessionContext) {
      const { adminSpaOrigin } = getIdentityConfig();
      return res.redirect(302, `${adminSpaOrigin}/login`);
    }
    const { user, identity, sid } = sessionContext;

    if (!verifyCsrfToken(sid, req.body?.csrf)) {
      return renderAccountPage(res, user, identity, sid, { error: 'Invalid or missing CSRF token.', status: 403 });
    }

    const { plaintext, hashed } = generateRecoveryCodes(10);
    identity.mfa.recovery_codes_hash = hashed;
    await identity.save();

    await logSecurityEvent({
      company_id: user.company_id,
      user_id: user._id,
      email: identity.email,
      event_type: 'mfa_verified',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      req,
      metadata: { recovery_codes_generated: true },
    });

    return renderAccountPage(res, user, identity, sid, {
      newRecoveryCodes: plaintext,
      success: '10 new recovery codes generated.',
    });
  });

  // ── POST /realms/tenant/account/sessions/revoke ─────────────────────────────────────────────
  app.post(`${BASE}/sessions/revoke`, authLimiter, form, async (req: Request, res: Response) => {
    const sessionContext = await resolveAccountSession(req, res, provider);
    if (!sessionContext) {
      const { adminSpaOrigin } = getIdentityConfig();
      return res.redirect(302, `${adminSpaOrigin}/login`);
    }
    const { user, identity, sid } = sessionContext;

    if (!verifyCsrfToken(sid, req.body?.csrf)) {
      return renderAccountPage(res, user, identity, sid, { error: 'Invalid or missing CSRF token.', status: 403 });
    }

    const targetSid = String(req.body?.session_id ?? '').trim();
    if (!targetSid) {
      return renderAccountPage(res, user, identity, sid, { error: 'Session ID is required.', status: 400 });
    }

    const targetSession = await Session.findOne({ _id: targetSid, identity_id: identity._id });
    if (!targetSession) {
      return renderAccountPage(res, user, identity, sid, { error: 'Session not found.', status: 404 });
    }

    await revokeSession(targetSid, 'user_revoked');

    if (targetSid === sid) {
      // User revoked their own active session
      const { adminSpaOrigin } = getIdentityConfig();
      return res.redirect(302, `${adminSpaOrigin}/login`);
    }

    return renderAccountPage(res, user, identity, sid, {
      success: 'Session signed out successfully.',
    });
  });

  // ── POST /realms/tenant/account/sessions/revoke-others ──────────────────────────────────────
  app.post(`${BASE}/sessions/revoke-others`, authLimiter, form, async (req: Request, res: Response) => {
    const sessionContext = await resolveAccountSession(req, res, provider);
    if (!sessionContext) {
      const { adminSpaOrigin } = getIdentityConfig();
      return res.redirect(302, `${adminSpaOrigin}/login`);
    }
    const { user, identity, sid } = sessionContext;

    if (!verifyCsrfToken(sid, req.body?.csrf)) {
      return renderAccountPage(res, user, identity, sid, { error: 'Invalid or missing CSRF token.', status: 403 });
    }

    const otherSessions = await Session.find({
      identity_id: identity._id,
      _id: { $ne: sid },
      revoked_at: { $exists: false },
    }).select('_id');

    for (const s of otherSessions) {
      await revokeSession(s._id, 'user_revoked');
    }

    return renderAccountPage(res, user, identity, sid, {
      success: `Signed out of ${otherSessions.length} other session${otherSessions.length === 1 ? '' : 's'}.`,
    });
  });
}
