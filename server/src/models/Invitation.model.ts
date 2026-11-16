// server/src/models/Invitation.model.ts
// Plan 2.1, DRD §5.1. Replaces InviteToken (fresh start: the old collection is not migrated).
// There is deliberately NO TTL index: a TTL would erase the evidence of what happened to a link.
// `expired` is derived (state = 'pending' and expires_at <= now). Finished rows are removed by the retention job (2.7).
import { Schema, model, Document, Types } from 'mongoose';

export type InvitationKind = 'member' | 'first_admin' | 'external' | 'operator';
export type InvitationState = 'pending' | 'accepted' | 'revoked' | 'superseded';
export type InvitationCreatorType = 'member' | 'operator' | 'system';

export interface IInvitation extends Document {
  kind: InvitationKind;
  company_id: Types.ObjectId | null;   // null for operator invitations
  user_id: Types.ObjectId;             // User or OperatorAccount
  email: string;                       // lower-cased copy at send time
  token_hash: string;                  // SHA-256 of 32 random bytes
  state: InvitationState;
  expires_at: Date;
  accepted_at?: Date;
  revoked_at?: Date;
  revoked_by?: Types.ObjectId;
  superseded_by?: Types.ObjectId;
  sent_count: number;
  last_sent_at?: Date;
  reminder_sent_at?: Date;
  created_by: { type: InvitationCreatorType; id?: Types.ObjectId };
  createdAt: Date;
  updatedAt: Date;                     // "last change" for the 180-day retention rule
}

const InvitationSchema = new Schema<IInvitation>({
  kind:          { type: String, enum: ['member', 'first_admin', 'external', 'operator'], required: true },
  company_id:    { type: Schema.Types.ObjectId, ref: 'Company', default: null },
  user_id:       { type: Schema.Types.ObjectId, required: true },
  email:         { type: String, required: true, lowercase: true, trim: true },
  token_hash:    { type: String, required: true, unique: true },
  state:         { type: String, enum: ['pending', 'accepted', 'revoked', 'superseded'], required: true, default: 'pending' },
  expires_at:    { type: Date, required: true },
  accepted_at:   Date,
  revoked_at:    Date,
  revoked_by:    { type: Schema.Types.ObjectId },
  superseded_by: { type: Schema.Types.ObjectId },
  sent_count:    { type: Number, default: 0 },
  last_sent_at:  Date,
  reminder_sent_at: Date,
  created_by: {
    type: { type: String, enum: ['member', 'operator', 'system'], required: true },
    id:   { type: Schema.Types.ObjectId },
  },
}, { timestamps: true });

InvitationSchema.index({ user_id: 1, state: 1 });
InvitationSchema.index({ company_id: 1, state: 1, expires_at: 1 });
InvitationSchema.index({ state: 1, expires_at: 1 }); // reminder job

export const Invitation = model<IInvitation>('Invitation', InvitationSchema);
