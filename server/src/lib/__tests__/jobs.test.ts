// Plan 4.5: the job runner (claim, success, retry with backoff, final failure, stale reclaim). In-memory MongoDB.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Job } from '../../models/Job.model';
import {
  enqueue, enqueueMany, registerJobHandler, claimJob, runJob, reclaimStaleJobs, processDueJobs, JOB_MAX_ATTEMPTS,
} from '../jobs';

let mongo: MongoMemoryServer;
const now = new Date('2026-11-16T12:00:00Z');

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'jobs' });
  await Job.init();
});
after(async () => { await mongoose.disconnect(); await mongo.stop(); });
beforeEach(async () => { await Job.deleteMany({}); });

test('a queued job is claimed once and finishes as done', async () => {
  const seen: unknown[] = [];
  registerJobHandler('t.ok', async (p) => { seen.push(p.n); });
  await enqueue('t.ok', { n: 1 });
  const job = await claimJob(now);
  assert.equal(job?.status, 'running');
  assert.equal(job?.attempts, 1);
  assert.equal(await claimJob(now), null, 'a running job cannot be claimed again');
  await runJob(job!, () => now);
  const done = await Job.findById(job!._id);
  assert.equal(done?.status, 'done');
  assert.deepEqual(seen, [1]);
  assert.ok(done?.finished_at);
});

test('a job only runs when it is due and a handler exists for its type', async () => {
  registerJobHandler('t.later', async () => undefined);
  await enqueue('t.later', {}, { runAt: new Date(now.getTime() + 60_000) });
  await enqueue('t.nohandler', {});
  assert.equal(await claimJob(now), null);
  assert.ok(await claimJob(new Date(now.getTime() + 61_000)));
});

test('a failing job is retried with a backoff, then fails for good after the last attempt', async () => {
  registerJobHandler('t.fail', async () => { throw new Error('boom'); });
  await enqueue('t.fail', {});
  let job = await claimJob(now);
  await runJob(job!, () => now);
  let row = await Job.findById(job!._id);
  assert.equal(row?.status, 'queued');
  assert.equal(row?.last_error, 'boom');
  assert.equal(row!.run_at.getTime(), now.getTime() + 60_000, 'first retry after one minute');

  await Job.updateOne({ _id: row!._id }, { $set: { attempts: JOB_MAX_ATTEMPTS - 1, run_at: now } });
  job = await claimJob(now);
  assert.equal(job?.attempts, JOB_MAX_ATTEMPTS);
  await runJob(job!, () => now);
  row = await Job.findById(job!._id);
  assert.equal(row?.status, 'failed');
  assert.ok(row?.finished_at);
});

test('a running job whose lock expired is put back in the queue', async () => {
  registerJobHandler('t.stale', async () => undefined);
  await enqueue('t.stale', {});
  const job = await claimJob(now);
  assert.equal(await reclaimStaleJobs(new Date(now.getTime() + 60_000)), 0, 'lock still valid');
  assert.equal(await reclaimStaleJobs(new Date(now.getTime() + 10 * 60_000)), 1);
  assert.equal((await Job.findById(job!._id))?.status, 'queued');
});

test('enqueueMany inserts in batches and processDueJobs runs them all', async () => {
  let ran = 0;
  registerJobHandler('t.many', async () => { ran++; });
  assert.equal(await enqueueMany('t.many', Array.from({ length: 450 }, (_, i) => ({ i }))), 450);
  assert.equal(await Job.countDocuments({ type: 't.many' }), 450);
  assert.equal(await processDueJobs(500), 450);
  assert.equal(ran, 450);
  assert.equal(await Job.countDocuments({ type: 't.many', status: 'done' }), 450);
});
