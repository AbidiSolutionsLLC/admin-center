// server/src/lib/invitations.ts
// Plan 2.1, DRD §5.2: the one place that creates an invitation. Every path (people, operator, bulk, scripts) calls
// createInvitation / createInvitations so that "one pending link per user" and the link format hold everywhere.
import crypto from 'crypto';
import { ClientSession, Types } from 'mongoose';
import { Invitation, IInvitation, InvitationKind, InvitationCreatorType } from '../models/Invitation.model';

export const DEFAULT_INVITE_TTL_HOURS = 72;

type Id = string | Types.ObjectId;

export interface InvitationInput {
  kind: InvitationKind;
  company_id: Id | null;
  user_id: Id;
  email: string;
  created_by: { type: InvitationCreatorType; id?: Id };
  ttl_hours?: number;
}

export interface CreatedInvitation {
  invitation: IInvitation;
  /** Exists only here: put it in the e-mail (or the one "copy link" response) and drop it. */
  rawToken: string;
}

type Session = ClientSession | null | undefined;

const hashToken = (raw: string): string => crypto.createHash('sha256').update(raw).digest('hex');
const oid = (v: Id): Types.ObjectId => (typeof v === 'string' ? new Types.ObjectId(v) : v);

function buildDoc(input: InvitationInput, now: Date) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const _id = new Types.ObjectId();
  const doc = {
    _id,
    kind: input.kind,
    company_id: input.company_id ? oid(input.company_id) : null,
    user_id: oid(input.user_id),
    email: input.email.toLowerCase(),
    token_hash: hashToken(rawToken),
    state: 'pending' as const,
    expires_at: new Date(now.getTime() + (input.ttl_hours ?? DEFAULT_INVITE_TTL_HOURS) * 3600 * 1000),
    sent_count: 0,
    created_by: { type: input.created_by.type, ...(input.created_by.id ? { id: oid(input.created_by.id) } : {}) },
  };
  return { doc, rawToken };
}

/**
 * Supersedes the user's pending invitation(s), inserts a new one and returns it with its raw token.
 * Pass the caller's transaction session so the swap commits (or rolls back) with the rest of the change.
 */
export async function createInvitation(session: Session, input: InvitationInput): Promise<CreatedInvitation> {
  const [created] = await createInvitations(session, [input]);
  return created;
}

/** Batched variant for bulk import: one supersede query and one insert for all rows. Result order matches `rows`. */
export async function createInvitations(session: Session, rows: InvitationInput[]): Promise<CreatedInvitation[]> {
  if (rows.length === 0) return [];
  const opts = { session: session ?? undefined };
  const now = new Date();
  const built = rows.map((r) => buildDoc(r, now));

  // A user appears in at most one row; if a caller passes two, the last one wins the supersede link.
  const newIdByUser = new Map<string, Types.ObjectId>();
  for (const { doc } of built) newIdByUser.set(String(doc.user_id), doc._id);

  for (const [userId, newId] of newIdByUser) {
    await Invitation.updateMany(
      { user_id: new Types.ObjectId(userId), state: 'pending', _id: { $ne: newId } },
      { $set: { state: 'superseded', superseded_by: newId } },
      opts,
    );
  }

  const docs = await Invitation.insertMany(built.map((b) => b.doc), opts);
  return docs.map((invitation, i) => ({ invitation, rawToken: built[i].rawToken }));
}

/** The one invitation URL format. `origin` defaults to CLIENT_URL (as every site did before). */
export function inviteLink(rawToken: string, email: string, origin: string = String(process.env.CLIENT_URL)): string {
  return `${origin.replace(/\/+$/, '')}/onboarding?token=${rawToken}&email=${encodeURIComponent(email)}`;
}

// ── Verify / accept outcomes (Plan 2.2, DRD §5.2) ────────────────────────────

export type InvitationProblemCode = 'INVITE_EXPIRED' | 'INVITE_SUPERSEDED' | 'INVITE_ALREADY_USED' | 'INVITE_REVOKED' | 'INVITE_NOT_FOUND';

export interface InvitationProblem {
  status: 404 | 409 | 410;
  code: InvitationProblemCode;
  message: string;
  /** The date the page quotes: expiry for INVITE_EXPIRED, the time the newer link was sent for INVITE_SUPERSEDED. */
  at?: Date;
}

/** Looks an invitation up by its raw token. Operator invitations are not served by the member endpoints. */
export async function findInvitationByToken(rawToken: string): Promise<IInvitation | null> {
  return Invitation.findOne({ token_hash: hashToken(rawToken), kind: { $ne: 'operator' } });
}

/** Maps a row (or none) to the failure the caller must return; null means the invitation can be used. */
export function invitationProblem(
  inv: Pick<IInvitation, 'state' | 'expires_at' | 'updatedAt'> | null,
  now: Date = new Date(),
): InvitationProblem | null {
  if (!inv) return { status: 404, code: 'INVITE_NOT_FOUND', message: 'This link is not valid. Check that you copied the whole link.' };
  switch (inv.state) {
    case 'pending':
      return inv.expires_at.getTime() > now.getTime()
        ? null
        : { status: 410, code: 'INVITE_EXPIRED', message: 'This link has expired.', at: inv.expires_at };
    case 'superseded':
      return { status: 410, code: 'INVITE_SUPERSEDED', message: 'A newer link was sent. Use the latest e-mail.', at: inv.updatedAt };
    case 'accepted':
      return { status: 409, code: 'INVITE_ALREADY_USED', message: 'This account is already set up.' };
    case 'revoked':
      return { status: 410, code: 'INVITE_REVOKED', message: 'This invitation was cancelled. Contact your administrator.' };
    default:
      return { status: 404, code: 'INVITE_NOT_FOUND', message: 'This link is not valid. Check that you copied the whole link.' };
  }
}

/**
 * The accept step: one atomic update that only matches a pending, unexpired invitation. Returns the consumed row,
 * or null when somebody else consumed it first (or it was never usable); the caller then re-reads for the reason.
 */
export async function consumeInvitation(session: Session, rawToken: string, now: Date = new Date()): Promise<IInvitation | null> {
  return Invitation.findOneAndUpdate(
    { token_hash: hashToken(rawToken), kind: { $ne: 'operator' }, state: 'pending', expires_at: { $gt: now } },
    { $set: { state: 'accepted', accepted_at: now } },
    { session: session ?? undefined, returnDocument: 'after' },
  );
}

/** Hides the local part of an address for the external-invitation page: `jane.doe@x.com` becomes `j•••@x.com`. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  return `${local.slice(0, 1)}•••@${domain}`;
}
