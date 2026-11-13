// server/src/operator/interactions.ts
// Hosted login for the operator realm (09 §2, §7): /login (email + password) then /mfa (TOTP, mandatory;
// first login enrols). Same machinery/CSRF posture as identity/interactions.ts (tenant).
import express, { Express, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { generateSecret, generateURI } from 'otplib';
import { OperatorAccount, IOperatorAccount } from '../models/OperatorAccount.model';
import { encrypt, decrypt } from '../lib/cryptoService';
import { authLimiter } from '../middleware/rateLimiter';
import { getIdentityConfig } from '../identity/config';
import { escapeHtml, OPERATOR_SHELL } from '../identity/html';
import { send, errBox, normaliseCode, totpValid, totpEnrolSection } from '../identity/interactions';
import type { OidcProvider } from '../identity/providers';
import { OPERATOR_ROLE } from './accounts';

const BASE = '/realms/operator';
const MAX_OTP_ATTEMPTS = 5;
const GENERIC_LOGIN_ERROR = 'Incorrect email or password.';
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

interface Pending {
  stage: 'totp' | 'enrol';
  operator_id: string;
  attempts: number;
  enrol_secret_enc?: string;
}

function renderLogin(res: Response, uid: string, opts: { error?: string; email?: string; status?: number } = {}) {
  send(res, 'Operator sign in', `<h1>Karbexa Operator</h1><p class="sub">Staff sign-in. This is not the tenant login.</p>${errBox(opts.error)}
<form method="post" action="${BASE}/interaction/${uid}/login" autocomplete="on">
<label for="email">Email</label><input id="email" name="email" type="email" required autofocus autocomplete="username" value="${escapeHtml(opts.email || '')}">
<label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="current-password">
<button type="submit">Continue</button></form>
<p class="links"><a href="${BASE}/interaction/${uid}/abort">Cancel</a></p>`, opts.status);
}

function renderMfa(res: Response, uid: string, error?: string) {
  send(res, 'Verify', `<h1>Two-step verification</h1><p class="sub">Enter the 6-digit code from your authenticator app.</p>${errBox(error)}
<form method="post" action="${BASE}/interaction/${uid}/mfa" autocomplete="off">
<label for="code">Code</label><input id="code" name="code" type="text" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7" required autofocus autocomplete="one-time-code">
<button type="submit">Verify</button></form><p class="links"><a href="${BASE}/interaction/${uid}/abort">Cancel</a></p>`);
}

async function renderEnrol(res: Response, uid: string, email: string, secret: string, error?: string) {
  const uri = generateURI({ issuer: 'Karbexa Operator', label: email, secret });
  send(res, 'Set up verification', `<h1>Set up two-step verification</h1>
<p class="sub">Operator accounts require an authenticator app. Scan the code, then enter the 6-digit code it shows.</p>${errBox(error)}
${await totpEnrolSection(uri, secret, !!error)}
<form method="post" action="${BASE}/interaction/${uid}/mfa" autocomplete="off">
<label for="code">Enter the 6-digit code from your app</label><input id="code" class="otp" name="code" type="text" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7" placeholder="000000" required autofocus autocomplete="one-time-code">
<button type="submit">Confirm and continue</button></form><p class="links"><a href="${BASE}/interaction/${uid}/abort">Cancel</a></p>`);
}

function renderExpired(res: Response) {
  const { operatorSpaOrigin } = getIdentityConfig();
  send(res, 'Sign-in expired', `<h1>This sign-in has expired</h1><p class="sub">Go back to the console and start again.</p>
<a class="btn" href="${escapeHtml(operatorSpaOrigin)}/operator">Back to sign in</a>`, 400);
}

export function registerOperatorInteractions(app: Express, provider: OidcProvider): void {
  const form = express.urlencoded({ extended: false, limit: '10kb' });

  async function details(req: Request, res: Response) {
    const d = await provider.interactionDetails(req, res);
    if (d.uid !== req.params.uid) {
      const err = new Error('interaction mismatch');
      err.name = 'SessionNotFound';
      throw err;
    }
    return d;
  }

  const pendingOf = (d: any): Pending | undefined => d.result?.karbexa;
  const savePending = (req: Request, res: Response, p: Pending) =>
    provider.interactionResult(req, res, { karbexa: p }, { mergeWithLastSubmission: false });
  const denied = (req: Request, res: Response, description: string) =>
    provider.interactionFinished(req, res, { error: 'access_denied', error_description: description }, { mergeWithLastSubmission: false });

  const handle = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    res.locals.karbexaShell = OPERATOR_SHELL;
    try {
      await fn(req, res);
    } catch (err: any) {
      if (err?.name === 'SessionNotFound') return renderExpired(res);
      console.error('[identity:operator] interaction error', err);
      if (!res.headersSent) send(res, 'Error', '<h1>Something went wrong</h1><p class="sub">Please go back to the console and try again.</p>', 500);
    }
  };

  const eligible = (a: IOperatorAccount | null): a is IOperatorAccount => !!a && a.status === 'active' && a.roles.includes(OPERATOR_ROLE);

  app.get(`${BASE}/interaction/:uid`, handle(async (req, res) => {
    const d = await details(req, res);
    const uid = d.uid as string;
    if (d.prompt?.name === 'consent') {
      const grant = new provider.Grant({ accountId: d.session?.accountId, clientId: d.params.client_id });
      grant.addOIDCScope('openid profile email');
      grant.addResourceScope('urn:karbexa:operator', 'api');
      const grantId = await grant.save();
      return provider.interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true });
    }
    const pending = pendingOf(d);
    if (pending?.stage === 'totp') return renderMfa(res, uid);
    if (pending?.stage === 'enrol' && pending.enrol_secret_enc) {
      const acct = await OperatorAccount.findById(pending.operator_id).select('email');
      return renderEnrol(res, uid, acct?.email || '', decrypt(pending.enrol_secret_enc));
    }
    return renderLogin(res, uid, { email: typeof d.params.login_hint === 'string' ? d.params.login_hint : '' });
  }));

  app.post(`${BASE}/interaction/:uid/login`, authLimiter, form, handle(async (req, res) => {
    const d = await details(req, res);
    const uid = d.uid as string;
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!email || !password) return renderLogin(res, uid, { error: 'Enter your email and password.', email, status: 400 });

    const acct = await OperatorAccount.findOne({ email });
    const ok = await bcrypt.compare(password, acct?.password_hash || DUMMY_HASH);
    if (!acct || !ok || !eligible(acct)) return renderLogin(res, uid, { error: GENERIC_LOGIN_ERROR, email, status: 401 });

    const enrolled = acct.mfa?.enabled && acct.mfa?.secret_enc;
    await savePending(req, res, {
      stage: enrolled ? 'totp' : 'enrol',
      operator_id: acct._id.toString(),
      attempts: 0,
      ...(enrolled ? {} : { enrol_secret_enc: encrypt(generateSecret()) }),
    });
    res.redirect(303, `${BASE}/interaction/${uid}`);
  }));

  app.post(`${BASE}/interaction/:uid/mfa`, authLimiter, form, handle(async (req, res) => {
    const d = await details(req, res);
    const uid = d.uid as string;
    const pending = pendingOf(d);
    if (!pending) return res.redirect(303, `${BASE}/interaction/${uid}`);
    const acct = await OperatorAccount.findById(pending.operator_id);
    if (!eligible(acct)) return denied(req, res, 'sign-in no longer possible');

    const enrolling = pending.stage === 'enrol';
    let secret: string;
    if (enrolling) {
      if (!pending.enrol_secret_enc) return res.redirect(303, `${BASE}/interaction/${uid}`);
      secret = decrypt(pending.enrol_secret_enc);
    } else {
      if (!acct.mfa?.secret_enc) return denied(req, res, 'sign-in no longer possible');
      secret = decrypt(acct.mfa.secret_enc);
    }

    if (await totpValid(secret, normaliseCode(req.body?.code))) {
      if (enrolling) {
        acct.mfa = { enabled: true, secret_enc: pending.enrol_secret_enc, verified_at: new Date() };
      }
      acct.last_login_at = new Date();
      await acct.save();
      return provider.interactionFinished(req, res, { login: { accountId: acct._id.toString(), amr: ['pwd', 'otp'] } }, { mergeWithLastSubmission: false });
    }

    pending.attempts += 1;
    if (pending.attempts >= MAX_OTP_ATTEMPTS) return denied(req, res, 'too many invalid verification codes');
    await savePending(req, res, pending);
    return enrolling
      ? renderEnrol(res, uid, acct.email, secret, 'That code is not valid. Check the time on your phone and try again.')
      : renderMfa(res, uid, 'That code is not valid. Try again.');
  }));

  app.get(`${BASE}/interaction/:uid/abort`, handle(async (req, res) => {
    await details(req, res);
    await denied(req, res, 'End-User aborted interaction');
  }));
}
