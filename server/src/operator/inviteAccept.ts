// server/src/operator/inviteAccept.ts
// Plan 04 C2 (closes plan 03 §14, 4.11): an invited operator sets a password from the e-mail link.
//   POST /operator/v1/invite/verify   { token }            → { email, full_name, roles, expires_at } or an INVITE_* problem
//   POST /operator/v1/invite/accept   { token, password }  → the account becomes active; TOTP is enrolled at first sign-in
// Public (no operator token) and mounted before requireOperator. In production /operator/v1 is behind the operator IP
// allow-list (app.ts), so these are too. The raw token is never stored; it is matched by hash, as for member invitations.
import bcrypt from 'bcryptjs';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { OperatorAccount } from '../models/OperatorAccount.model';
import { consumeOperatorInvitation, findOperatorInvitationByToken, invitationProblem } from '../lib/invitations';
import { runInTransaction } from '../lib/platformEvents';
import { authLimiter } from '../middleware/rateLimiter';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { writeAudit } from './audit';
import { publicRoute } from './permissions';
import { revokeAllOperatorSessions } from './sessions';

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/, 'Invalid link');
const NOT_FOUND = { status: 404, code: 'INVITE_NOT_FOUND', message: 'This link is not valid. Check that you copied the whole link.' } as const;

function problemResponse(res: Response, p: { status: number; code: string; message: string; at?: Date }) {
  return res.status(p.status).json({ success: false, error: p.message, code: p.code, ...(p.at ? { data: { at: p.at } } : {}) });
}

export function operatorInviteRoutes(): Router {
  const router = Router();

  router.post('/invite/verify', publicRoute, authLimiter, asyncHandler(async (req: Request, res: Response) => {
    const parsed = tokenSchema.safeParse(req.body?.token);
    if (!parsed.success) return problemResponse(res, NOT_FOUND);
    const inv = await findOperatorInvitationByToken(parsed.data);
    const problem = invitationProblem(inv);
    if (problem) return problemResponse(res, problem);
    const acct = await OperatorAccount.findOne({ _id: inv!.user_id, status: 'invited' }).select('email full_name roles').lean();
    if (!acct) return problemResponse(res, { status: 410, code: 'INVITE_REVOKED', message: 'This invitation was cancelled. Contact a platform administrator.' });
    res.json({ success: true, data: { email: acct.email, full_name: acct.full_name, roles: acct.roles, expires_at: inv!.expires_at } });
  }));

  router.post('/invite/accept', publicRoute, authLimiter, asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({ token: tokenSchema, password: z.string().min(12, 'Use at least 12 characters').max(200) }).safeParse(req.body);
    if (!body.success) {
      const pw = body.error.issues.find((i) => i.path[0] === 'password');
      if (pw) throw new AppError(pw.message, 400, 'WEAK_PASSWORD');
      return problemResponse(res, NOT_FOUND);
    }
    const { token, password } = body.data;
    const passwordHash = await bcrypt.hash(password, 12);

    const acct = await runInTransaction(async (session) => {
      const inv = await consumeOperatorInvitation(session, token);
      if (!inv) return null;
      const account = await OperatorAccount.findOne({ _id: inv.user_id, status: 'invited' }).session(session ?? null);
      if (!account) throw new AppError('This invitation was cancelled. Contact a platform administrator.', 410, 'INVITE_REVOKED');
      if (password.toLowerCase().includes(account.email.split('@')[0].toLowerCase())) {
        throw new AppError('The password must not contain your e-mail name', 400, 'WEAK_PASSWORD');
      }
      account.password_hash = passwordHash;
      account.status = 'active';
      account.mfa = { enabled: false }; // the first sign-in enrols TOTP (operator/interactions.ts)
      await account.save({ session: session ?? undefined });
      await writeAudit(
        { operator: { _id: account._id, email: account.email }, correlation_id: (req as any).correlationId, ip: req.ip },
        { action: 'operator.invite_accepted', target_type: 'Operator', target_id: String(account._id), category: 'operator', after: { status: 'active', roles: account.roles } },
        session ?? undefined,
      );
      return account;
    });

    if (!acct) {
      // Consumed by someone else, expired, superseded or never valid: answer with the reason.
      return problemResponse(res, invitationProblem(await findOperatorInvitationByToken(token)) ?? NOT_FOUND);
    }
    await revokeAllOperatorSessions(acct._id, 'invite_accepted'); // none expected; defensive
    res.json({ success: true, data: { email: acct.email, mfa_enrolment_required: true } });
  }));

  return router;
}
