// server/src/platform/streamTickets.ts — Single-use SSE stream tickets and stream re-check (05 §3, 03 §7)
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { StreamTicket, STREAM_TICKET_TTL_MS } from '../models/StreamTicket.model';
import { User } from '../models/User.model';
import { Company } from '../models/Company.model';
import { findLiveSession } from '../identity/sessions';

export const RECHECK_MS = 30000;
export const TICKET_TTL_SECONDS = STREAM_TICKET_TTL_MS / 1000;

export const sha256hex = (value: string): string =>
  crypto.createHash('sha256').update(value, 'utf8').digest('hex');

export class StreamAuthError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'StreamAuthError';
    this.status = status;
    this.code = code;
  }
}

export interface StreamBinding {
  member: Types.ObjectId | string;
  company: Types.ObjectId | string;
  sid: string;
}

/** True while the member, org and session still allow the stream. Any lookup failure denies. */
export async function streamAllowed(binding: StreamBinding): Promise<boolean> {
  const [user, org, session] = await Promise.all([
    User.findOne({ _id: binding.member, company_id: binding.company })
      .select('lifecycle_state is_active locked_until')
      .lean(),
    Company.findOne({ _id: binding.company })
      .select('status is_active')
      .lean(),
    findLiveSession(binding.sid),
  ]);

  const now = new Date();
  const userOk = Boolean(
    user &&
    user.is_active !== false &&
    user.lifecycle_state === 'active' &&
    (!user.locked_until || user.locked_until <= now)
  );

  const orgOk = Boolean(
    org &&
    (org.status === 'active' || (org as any).is_active !== false)
  );

  const sessionOk = Boolean(
    session &&
    session.member_id.toString() === binding.member.toString() &&
    !session.revoked_at
  );

  return Boolean(userOk && orgOk && sessionOk);
}

/**
 * POST /api/v1/stream-tickets (requires requireAuth)
 * Issues a single-use 60s stream ticket bound to member, company, and sid.
 */
export async function issueStreamTicket(req: Request, res: Response, next?: NextFunction): Promise<void> {
  try {
    const user = req.user;
    const sid = user?.sid;
    if (!user || !user.userId || !user.company_id || !sid) {
      throw new StreamAuthError(401, 'NO_SESSION', 'A signed-in session is required.');
    }

    const ticket = crypto.randomBytes(32).toString('base64url');
    await StreamTicket.create({
      ticketHash: sha256hex(ticket),
      member: new Types.ObjectId(user.userId),
      company: new Types.ObjectId(user.company_id),
      sid,
      expiresAt: new Date(Date.now() + STREAM_TICKET_TTL_MS),
    });

    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      success: true,
      data: {
        ticket,
        expires_in: TICKET_TTL_SECONDS,
      },
    });
  } catch (err) {
    if (next) return next(err);
    if (err instanceof StreamAuthError) {
      res.status(err.status).json({ success: false, error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to issue stream ticket', code: 'INTERNAL_ERROR' });
  }
}

/**
 * Atomically consumes and validates a stream ticket.
 * Single use: deletes the ticket immediately so reuse fails.
 */
export async function consumeStreamTicket(
  ticket: string,
  now: () => number = () => Date.now()
): Promise<StreamBinding> {
  if (!ticket || typeof ticket !== 'string') {
    throw new StreamAuthError(401, 'INVALID_STREAM_TICKET', 'A stream ticket is required.');
  }

  const row = await StreamTicket.findOneAndDelete({
    ticketHash: sha256hex(ticket),
    expiresAt: { $gt: new Date(now()) },
  }).lean();

  if (!row) {
    throw new StreamAuthError(401, 'INVALID_STREAM_TICKET', 'Invalid or expired stream ticket.');
  }

  const binding: StreamBinding = {
    member: row.member,
    company: row.company,
    sid: row.sid,
  };

  const allowed = await streamAllowed(binding);
  if (!allowed) {
    throw new StreamAuthError(401, 'SESSION_REVOKED', 'This session is no longer active.');
  }

  return binding;
}
