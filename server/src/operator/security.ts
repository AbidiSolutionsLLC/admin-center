// server/src/operator/security.ts
// Operator security (Plan 4.11, DRD 4.2, PRD CC-SE-1, CC-OP-3).
//   GET    /security                         the Security page blocks (each computed on its own; a failing one is { error: true })
//   GET    /operators/:id/sessions           that operator's recent sessions
//   DELETE /operators/:id/sessions/:sid      revoke one (the next request with that token is refused)
//   POST   /operators/invite                 an `invited` operator plus a `kind: 'operator'` invitation and its e-mail
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Router, Request, Response } from 'express';
import { ClientSession, Types } from 'mongoose';
import { z } from 'zod';
import { OperatorAccount } from '../models/OperatorAccount.model';
import { OperatorSession } from '../models/OperatorSession.model';
import { OperatorAuditEvent } from '../models/OperatorAuditEvent.model';
import { SecurityEvent } from '../models/SecurityEvent.model';
import { AttentionItem } from '../models/Signals.model';
import { createInvitation, operatorInviteLink } from '../lib/invitations';
import { sendEmail } from '../lib/emailService';
import { runInTransaction } from '../lib/platformEvents';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { requirePermission, operatorRolesSchema } from './permissions';
import { revokeOperatorSession } from './sessions';
import type { AuditInput } from './audit';

interface Helpers {
  ok: (res: Response, data: unknown, status?: number, meta?: unknown) => unknown;
  oid: (id: string, what?: string) => string;
  audit: (req: Request, p: AuditInput, session?: ClientSession) => Promise<void>;
}

const DAY = 24 * 3600_000;
export const OPERATOR_INVITE_TTL_HOURS = 72;

async function block<T>(fn: () => Promise<T>): Promise<T | { error: true }> {
  try {
    return await fn();
  } catch (err) {
    console.error('[security]', String((err as Error)?.message ?? err));
    return { error: true };
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export function securityRoutes(h: Helpers): Router {
  const router = Router();

  router.get('/security', requirePermission('security.read'), asyncHandler(async (_req: Request, res: Response) => {
    const now = new Date();
    const since = new Date(now.getTime() - DAY);
    const failureTypes = ['login_failure', 'mfa_failed', 'account_locked'];
    const [without_mfa, failed_sign_ins, locked, sessions, tenants_without_mfa, role_changes] = await Promise.all([
      block(async () => (await OperatorAccount.find({ status: 'active', 'mfa.enabled': { $ne: true } }).select('email full_name roles').lean())
        .map((a) => ({ id: String(a._id), email: a.email, full_name: a.full_name, roles: a.roles }))),
      block(async () => {
        const filter: Record<string, unknown> = { company_id: null, 'metadata.realm': 'operator', event_type: { $in: failureTypes }, created_at: { $gte: since } };
        const [count, recent] = await Promise.all([
          SecurityEvent.countDocuments(filter),
          SecurityEvent.find(filter).sort({ created_at: -1 }).limit(20).select('email event_type ip_address created_at').lean(),
        ]);
        return { count, recent: recent.map((e) => ({ email: e.email ?? null, event_type: e.event_type, ip: e.ip_address ?? null, at: e.created_at })) };
      }),
      block(async () => (await OperatorAccount.find({ locked_until: { $gt: now } }).select('email full_name locked_until').lean())
        .map((a) => ({ id: String(a._id), email: a.email, full_name: a.full_name, locked_until: a.locked_until }))),
      block(async () => {
        const rows = await OperatorSession.find({ revoked_at: { $exists: false }, idle_expires_at: { $gt: now } }).sort({ last_seen_at: -1 }).limit(100).lean();
        const accts = new Map((await OperatorAccount.find({ _id: { $in: rows.map((r) => String(r.operator_id)) } }).select('email').lean()).map((a) => [String(a._id), a.email]));
        return rows.map((r) => ({
          id: r._id, operator_id: String(r.operator_id), operator_email: accts.get(String(r.operator_id)) ?? null,
          ip: r.ip ?? null, user_agent: r.user_agent ?? null, created_at: r.created_at, last_seen_at: r.last_seen_at,
        }));
      }),
      block(async () => (await AttentionItem.find({ kind: 'admins_without_mfa', open: true }).sort({ first_seen_at: 1 }).limit(50).select('company_id summary link').lean())
        .map((i) => ({ company_id: i.company_id ? String(i.company_id) : null, summary: i.summary, link: i.link }))),
      block(async () => (await OperatorAuditEvent.find({
        $or: [{ action: { $in: ['operator.created', 'operator.invited'] } }, { action: 'operator.updated', 'details.fields': 'roles' }],
      }).sort({ created_at: -1 }).limit(20).select('operator_email action target_id details created_at').lean())
        .map((e) => ({ id: String(e._id), by: e.operator_email, action: e.action, target_id: e.target_id ?? null, at: e.created_at }))),
    ]);
    h.ok(res, { operators_without_mfa: without_mfa, failed_sign_ins, locked_accounts: locked, active_sessions: sessions, tenants_without_mfa, recent_role_changes: role_changes });
  }));

  router.get('/operators/:id/sessions', requirePermission('operators.read'), asyncHandler(async (req: Request, res: Response) => {
    const id = h.oid(String(req.params.id));
    const now = new Date();
    const rows = await OperatorSession.find({ operator_id: new Types.ObjectId(id) } as never).sort({ created_at: -1 }).limit(20).lean();
    h.ok(res, rows.map((r) => ({
      id: r._id, ip: r.ip ?? null, user_agent: r.user_agent ?? null, created_at: r.created_at, last_seen_at: r.last_seen_at,
      active: !r.revoked_at && r.idle_expires_at > now, revoked_at: r.revoked_at ?? null, revoked_reason: r.revoked_reason ?? null,
    })));
  }));

  router.delete('/operators/:id/sessions/:sid', requirePermission('operators.write'), asyncHandler(async (req: Request, res: Response) => {
    const id = h.oid(String(req.params.id));
    const sid = String(req.params.sid);
    const row = await OperatorSession.findOne({ _id: sid, operator_id: new Types.ObjectId(id) } as never).lean();
    if (!row) throw new AppError('Session not found', 404, 'NOT_FOUND');
    await revokeOperatorSession(sid, 'revoked_by_operator');
    await h.audit(req, {
      action: 'operator.session_revoked', target_type: 'Operator', target_id: id, category: 'security',
      details: { session_id: sid, ip: row.ip ?? null, by_self: String(req.operator!._id) === id },
    });
    h.ok(res, { revoked: true });
  }));

  router.post('/operators/invite', requirePermission('operators.write'), asyncHandler(async (req: Request, res: Response) => {
    const b = z.object({
      email: z.string().trim().email().toLowerCase(), full_name: z.string().trim().min(1).max(120), roles: operatorRolesSchema,
    }).parse(req.body);
    if (await OperatorAccount.exists({ email: b.email })) throw new AppError('An operator with this email already exists', 409, 'DUPLICATE');

    const acct = await runInTransaction(async (session) => {
      // The password hash is required by the model; a random value nobody knows keeps the account unusable until it is invited through.
      const [created] = await OperatorAccount.create([{
        email: b.email, full_name: b.full_name, roles: b.roles, status: 'invited', invited_by: req.operator!._id,
        password_hash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
      }], { session: session ?? undefined });
      const { rawToken } = await createInvitation(session, {
        kind: 'operator', company_id: null, user_id: created._id, email: b.email,
        created_by: { type: 'operator', id: req.operator!._id }, ttl_hours: OPERATOR_INVITE_TTL_HOURS,
      });
      const link = operatorInviteLink(rawToken, b.email); // plan 04 C2: the Command Center accept page
      await sendEmail({
        to: b.email,
        subject: 'You have been invited to the Karbexa Command Center',
        html: `<p>Hi ${esc(b.full_name)},</p><p>You have been invited to the Karbexa Command Center. Use this link within ${OPERATOR_INVITE_TTL_HOURS} hours to set up your account:</p><p><a href="${esc(link)}">${esc(link)}</a></p>`,
        text: `Hi ${b.full_name},\n\nYou have been invited to the Karbexa Command Center. Use this link within ${OPERATOR_INVITE_TTL_HOURS} hours to set up your account:\n${link}\n`,
        meta: { template: 'operator_invite', related: { type: 'operator', id: String(created._id) }, session },
      });
      await h.audit(req, {
        action: 'operator.invited', target_type: 'Operator', target_id: String(created._id), category: 'operator',
        details: { email: b.email, roles: b.roles }, after: { status: 'invited', roles: b.roles },
      }, session ?? undefined);
      return created;
    });
    h.ok(res, { id: String(acct._id), email: acct.email, full_name: acct.full_name, roles: acct.roles, status: acct.status }, 201);
  }));

  return router;
}
