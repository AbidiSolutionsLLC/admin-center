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
