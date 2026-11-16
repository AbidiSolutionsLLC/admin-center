// server/src/operator/signInGuard.ts
// Operator sign-in lockout and security events (Plan 0.4). Same policy as the tenant default:
// 5 failures lock the account for 30 minutes (auth.controller.ts recordPasswordFailure).
import type { Request } from 'express';
import { OperatorAccount, IOperatorAccount } from '../models/OperatorAccount.model';
import { logSecurityEvent } from '../controllers/auth.controller';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 30 * 60 * 1000;

export const isOperatorLocked = (a: Pick<IOperatorAccount, 'locked_until'>): boolean =>
  !!a.locked_until && a.locked_until > new Date();

const event = (req: Request, email: string, event_type: string, is_suspicious: boolean, metadata: Record<string, unknown> = {}) =>
  logSecurityEvent({
    company_id: null,
    email,
    event_type,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    req,
    is_suspicious,
    metadata: { realm: 'operator', ...metadata },
  }).catch((err) => console.error('[operator] security event failed', err));

/**
 * Wrong password or wrong TOTP code: count it, lock at the limit. `locked` records an attempt against an already
 * locked account without counting. Returns true when this failure locked the account.
 */
export async function recordOperatorFailure(req: Request, acct: IOperatorAccount, reason: 'invalid_password' | 'invalid_code' | 'locked'): Promise<boolean> {
  if (reason === 'locked') {
    await event(req, acct.email, 'login_failure', true, { reason: 'account_locked' });
    return false;
  }
  const updated = await OperatorAccount.findOneAndUpdate({ _id: acct._id }, { $inc: { failed_attempts: 1 } }, { returnDocument: 'after' });
  const count = updated?.failed_attempts ?? 0;
  if (count >= MAX_FAILED_ATTEMPTS) {
    await OperatorAccount.updateOne({ _id: acct._id }, { $set: { failed_attempts: 0, locked_until: new Date(Date.now() + LOCKOUT_MS) } });
    await event(req, acct.email, 'account_locked', true, { reason, failure_count: count });
    return true;
  }
  await event(req, acct.email, reason === 'invalid_code' ? 'mfa_failed' : 'login_failure', false, { reason, failure_count: count });
  return false;
}

/** Full sign-in (password and code) succeeded: reset the counter and record it. */
export async function recordOperatorSuccess(req: Request, acct: IOperatorAccount): Promise<void> {
  await OperatorAccount.updateOne({ _id: acct._id }, { $set: { failed_attempts: 0 }, $unset: { locked_until: 1 } });
  await event(req, acct.email, 'login_success', false);
}
