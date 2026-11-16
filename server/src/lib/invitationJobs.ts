// server/src/lib/invitationJobs.ts
// Plan 2.7, DRD §5.2: the invitation reminder and the retention clean-up. Both are plain functions (testable with a
// fixed clock); startInvitationJobs() schedules them with periodic.every, so one Admin instance runs them at a time.
import { Invitation } from '../models/Invitation.model';
import { User } from '../models/User.model';
import { Company } from '../models/Company.model';
import { sendInviteReminderEmail } from './emailService';
import { every } from './periodic';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
export const REMINDER_EVERY_MS = 30 * 60 * 1000;
export const RETENTION_EVERY_MS = DAY;
/** Accepted, revoked and superseded invitations are deleted this long after their last change. */
export const RETENTION_DAYS = 180;

/**
 * Queues one reminder for each pending invitation that expires between 23 and 24 hours from now and has not been
 * reminded. The row is stamped first (an atomic claim), so two instances or two ticks never send twice; the stamp is
 * removed again when queueing fails, so the next tick retries. Returns how many reminders were queued.
 */
export async function sendInvitationReminders(now: Date = new Date()): Promise<number> {
  const due = await Invitation.find({
    state: 'pending',
    kind: { $ne: 'operator' },
    reminder_sent_at: null,
    expires_at: { $gt: new Date(now.getTime() + 23 * HOUR), $lte: new Date(now.getTime() + 24 * HOUR) },
  }).select('_id').lean();

  let queued = 0;
  for (const { _id } of due) {
    const inv = await Invitation.findOneAndUpdate(
      { _id, state: 'pending', reminder_sent_at: null },
      { $set: { reminder_sent_at: now } },
      { returnDocument: 'after' },
    );
    if (!inv) continue; // another instance claimed it, or it changed state meanwhile

    try {
      const user = await User.findOne({ _id: inv.user_id, company_id: inv.company_id, lifecycle_state: 'invited' }).select('full_name');
      const company = user ? await Company.findById(inv.company_id).select('name') : null;
      if (!user || !company) continue; // nothing to remind (accepted by another route, or the organisation is gone); stays stamped
      await sendInviteReminderEmail({
        email: inv.email, full_name: user.full_name, company_name: company.name, expires_at: inv.expires_at,
        meta: { company_id: company._id, related: { type: 'user', id: String(user._id) } },
      });
      queued++;
    } catch (err) {
      console.error('[invitation-reminder] could not queue reminder for', String(inv._id), err);
      await Invitation.updateOne({ _id: inv._id }, { $set: { reminder_sent_at: null } }).catch(() => undefined);
    }
  }
  return queued;
}

/** Deletes finished invitations (accepted, revoked, superseded) whose last change is older than 180 days. */
export async function purgeFinishedInvitations(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY);
  const r = await Invitation.deleteMany({ state: { $in: ['accepted', 'revoked', 'superseded'] }, updatedAt: { $lt: cutoff } });
  return r.deletedCount;
}

let stops: Array<() => void> = [];

/** Start both jobs. Safe to call twice. */
export function startInvitationJobs(): void {
  if (stops.length) return;
  stops = [
    every('invitation-reminder', REMINDER_EVERY_MS, async () => { await sendInvitationReminders(); }),
    every('invitation-retention', RETENTION_EVERY_MS, async () => { await purgeFinishedInvitations(); }),
  ];
}

export function stopInvitationJobs(): void {
  stops.forEach((s) => s());
  stops = [];
}
