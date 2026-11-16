// server/src/lib/jobs.ts
// Generic background jobs (DRD 10.2, Plan 4.5). `enqueue` writes a `Job`; the runner claims one row at a time with an
// atomic findOneAndUpdate (several Admin instances can run it), calls the handler registered for the job's type, and
// retries with a backoff up to MAX_ATTEMPTS. A job whose instance died is reclaimed after `locked_until`.
import { ClientSession } from 'mongoose';
import { Job, IJob } from '../models/Job.model';
import { every } from './periodic';

export type JobHandler = (payload: Record<string, any>, job: IJob) => Promise<void>;

/** Minutes to wait after failed attempt 1, 2, 3, 4. A fifth failure is final. */
export const JOB_RETRY_DELAYS_MIN = [1, 5, 30, 120];
export const JOB_MAX_ATTEMPTS = JOB_RETRY_DELAYS_MIN.length + 1;
const CLAIM_MS = 5 * 60 * 1000;
const TICK_MS = 5_000;
const BATCH = 20;

const handlers = new Map<string, JobHandler>();

/** One handler per type; registering a type again replaces the handler. */
export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export async function enqueue(type: string, payload: Record<string, unknown>, opts: { runAt?: Date; session?: ClientSession | null } = {}): Promise<string> {
  const [job] = await Job.create([{ type, payload, run_at: opts.runAt ?? new Date() }], { session: opts.session ?? undefined });
  return String(job._id);
}

/** Many jobs of one type, inserted in batches of 200. Returns how many were queued. */
export async function enqueueMany(type: string, payloads: Array<Record<string, unknown>>, opts: { runAt?: Date; session?: ClientSession | null } = {}): Promise<number> {
  const runAt = opts.runAt ?? new Date();
  for (let i = 0; i < payloads.length; i += 200) {
    await Job.insertMany(payloads.slice(i, i + 200).map((payload) => ({ type, payload, run_at: runAt })), { session: opts.session ?? undefined });
  }
  return payloads.length;
}

/** Put jobs that were claimed but never finished back in the queue (or fail them when out of attempts). */
export async function reclaimStaleJobs(now: Date = new Date()): Promise<number> {
  const stale = { status: 'running' as const, locked_until: { $lt: now } };
  await Job.updateMany({ ...stale, attempts: { $gte: JOB_MAX_ATTEMPTS } }, { $set: { status: 'failed', finished_at: now, last_error: 'Instance stopped before the job finished' }, $unset: { locked_until: 1 } });
  const r = await Job.updateMany(stale, { $set: { status: 'queued', run_at: now }, $unset: { locked_until: 1 } });
  return r.modifiedCount;
}

/** Atomically claim the oldest due job that has a handler, or null. */
export async function claimJob(now: Date = new Date()): Promise<IJob | null> {
  return Job.findOneAndUpdate(
    { status: 'queued', run_at: { $lte: now }, type: { $in: [...handlers.keys()] } },
    { $set: { status: 'running', locked_until: new Date(now.getTime() + CLAIM_MS) }, $inc: { attempts: 1 } },
    { sort: { run_at: 1 }, returnDocument: 'after' },
  );
}

const describe = (err: unknown) => String((err as Error)?.message ?? err).slice(0, 300);

/** Run one claimed job and record the outcome. */
export async function runJob(job: IJob, now: () => Date = () => new Date()): Promise<void> {
  try {
    const handler = handlers.get(job.type);
    if (!handler) throw new Error(`No handler for job type ${job.type}`);
    await handler(job.payload ?? {}, job);
    await Job.updateOne({ _id: job._id }, { $set: { status: 'done', finished_at: now() }, $unset: { locked_until: 1, last_error: 1 } });
  } catch (err) {
    const last_error = describe(err);
    if (job.attempts >= JOB_MAX_ATTEMPTS) {
      await Job.updateOne({ _id: job._id }, { $set: { status: 'failed', last_error, finished_at: now() }, $unset: { locked_until: 1 } });
      return;
    }
    const delayMin = JOB_RETRY_DELAYS_MIN[Math.min(job.attempts, JOB_RETRY_DELAYS_MIN.length) - 1];
    await Job.updateOne({ _id: job._id }, { $set: { status: 'queued', last_error, run_at: new Date(now().getTime() + delayMin * 60_000) }, $unset: { locked_until: 1 } });
  }
}

/** One pass: reclaim stale rows, then run up to `limit` due jobs. Returns how many ran. */
export async function processDueJobs(limit: number = BATCH): Promise<number> {
  await reclaimStaleJobs();
  let n = 0;
  for (; n < limit; n++) {
    const job = await claimJob();
    if (!job) break;
    await runJob(job);
  }
  return n;
}

let stop: (() => void) | undefined;

/** Start the runner (every 5 s, one instance at a time via the lease). Safe to call twice. */
export function startJobRunner(): void {
  if (stop) return;
  stop = every('job-runner', TICK_MS, async () => { await processDueJobs(); });
}

export function stopJobRunner(): void {
  stop?.();
  stop = undefined;
}
