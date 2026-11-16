// server/src/lib/emailSender.ts
// Sender loop for the e-mail outbox (Plan 0.6). Every claim is one atomic findOneAndUpdate, so several Admin
// instances can run it safely. Delivery itself is `deliverNow` (Azure first, Nodemailer fallback).
import { EmailDelivery, IEmailDelivery } from '../models/EmailDelivery.model';
import { decrypt } from './cryptoService';
import { deliverNow } from './emailService';
import { every } from './periodic';

/** Minutes to wait after failed attempt 1, 2, 3, 4. A fifth failure is final. */
export const RETRY_DELAYS_MIN = [1, 5, 30, 120];
export const MAX_ATTEMPTS = RETRY_DELAYS_MIN.length + 1;
const CLAIM_MS = 5 * 60 * 1000;
const TICK_MS = 5_000;
const BATCH = 10;

export const describeError = (err: unknown): string => {
  const e = err as { code?: unknown; name?: string; message?: string };
  const code = typeof e?.code === 'string' ? e.code : e?.name || 'Error';
  return `${code}: ${String(e?.message ?? err).slice(0, 200)}`;
};

/** Put rows that were claimed but never finished (the instance died) back in the queue. */
export async function reclaimStuck(now: Date = new Date()): Promise<number> {
  const r = await EmailDelivery.updateMany(
    { status: 'sending', locked_until: { $lt: now } },
    { $set: { status: 'queued', next_attempt_at: now }, $unset: { locked_until: 1 } },
  );
  return r.modifiedCount;
}

/** Atomically claim the oldest due row, or null. */
export async function claimOne(now: Date = new Date()): Promise<IEmailDelivery | null> {
  return EmailDelivery.findOneAndUpdate(
    { status: 'queued', next_attempt_at: { $lte: now } },
    { $set: { status: 'sending', locked_until: new Date(now.getTime() + CLAIM_MS) }, $inc: { attempts: 1 } },
    { sort: { next_attempt_at: 1 }, returnDocument: 'after' },
  );
}

/** Send one claimed row and record the outcome. Bodies are removed on `sent` and on a final `failed`. */
export async function sendClaimed(row: IEmailDelivery, now: () => Date = () => new Date()): Promise<void> {
  try {
    const result = await deliverNow({
      to: row.to,
      subject: row.subject,
      html: row.html_enc ? decrypt(row.html_enc) : '',
      text: row.text_enc ? decrypt(row.text_enc) : undefined,
    });
    await EmailDelivery.updateOne(
      { _id: row._id },
      { $set: { status: 'sent', sent_at: now(), provider_message_id: result.provider_message_id }, $unset: { html_enc: 1, text_enc: 1, locked_until: 1, last_error: 1 } },
    );
  } catch (err) {
    const last_error = describeError(err);
    if (row.attempts >= MAX_ATTEMPTS) {
      await EmailDelivery.updateOne({ _id: row._id }, { $set: { status: 'failed', last_error }, $unset: { html_enc: 1, text_enc: 1, locked_until: 1 } });
      return;
    }
    const delayMin = RETRY_DELAYS_MIN[Math.min(row.attempts, RETRY_DELAYS_MIN.length) - 1];
    await EmailDelivery.updateOne(
      { _id: row._id },
      { $set: { status: 'queued', last_error, next_attempt_at: new Date(now().getTime() + delayMin * 60_000) }, $unset: { locked_until: 1 } },
    );
  }
}

/** One pass: reclaim stuck rows, then send up to `limit` due rows. Returns how many were processed. */
export async function processDueEmails(limit: number = BATCH): Promise<number> {
  await reclaimStuck();
  let n = 0;
  for (; n < limit; n++) {
    const row = await claimOne();
    if (!row) break;
    await sendClaimed(row);
  }
  return n;
}

let stop: (() => void) | undefined;

/** Start the loop (every 5 s, one instance at a time via the lease). Safe to call twice. */
export function startEmailSender(): void {
  if (stop) return;
  stop = every('email-sender', TICK_MS, async () => { await processDueEmails(); });
}

export function stopEmailSender(): void {
  stop?.();
  stop = undefined;
}
